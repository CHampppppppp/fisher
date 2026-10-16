import type { Game } from './game.ts';
import { validateSave } from './save-format.ts';
import type { SaveFile } from './save-format.ts';
import { SaveStore } from './save-store.ts';

export interface SaveResult { ok: boolean; error?: string }
export interface PersistenceHooks {
  status(message: string, busy: boolean): void;
  beginLoad(): void;
  endLoad(): void;
  restored(): void;
}
function message(error: unknown): string { return error instanceof Error ? error.message : 'Unknown storage failure'; }

/** Storage operations queue; imports and real reads have one validator and one production commit. */
export class Persistence {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private game: Game, private hooks: PersistenceHooks, private store = new SaveStore()) {}

  private enqueue(operation:()=>Promise<SaveResult>): Promise<SaveResult> {
    const result=this.pending.then(operation);this.pending=result.catch(()=>undefined);return result;
  }
  async waitUntilIdle(): Promise<void> { await this.pending; }
  async exportSave(): Promise<SaveFile> { await this.pending;return this.game.exportSave(); }

  save(): Promise<SaveResult> {
    return this.enqueue(async()=>{
      this.hooks.status('正在保存完整进度…',true);
      try {
        const snapshot=this.game.exportSave();
        await this.store.write(snapshot);
        this.game.persistenceResult(true,'saved');this.hooks.status(`已保存 · 第 ${snapshot.state.simulationTick} 步`,false);return {ok:true};
      } catch(error) {
        const reason=message(error);this.game.persistenceResult(false,'save-failed');this.hooks.status(`保存失败：${reason}。旧存档保持不变。`,false);return {ok:false,error:reason};
      }
    });
  }

  private restore(value: unknown): SaveResult {
    // Validate before clearing input, moving the clock, rebuilding a scene or touching production state.
    const save=validateSave(value);this.game.importSave(save);this.hooks.restored();
    this.hooks.status(save.state.gamePhase==='dead'||save.state.gamePhase==='victory'
      ? '已读取终局记录 · 可重新开始，或读取其他备份。'
      : '已读取 · 时间已暂停，请点击继续探索。',false);
    return {ok:true};
  }

  load(): Promise<SaveResult> {
    return this.enqueue(async()=>{
      this.hooks.status('正在读取存档…',true);this.hooks.beginLoad();
      try {
        const value=await this.store.read();if(value===undefined)throw new Error('当前存档槽为空，请先保存进度');
        return this.restore(value);
      } catch(error) {
        const reason=message(error);this.game.persistenceResult(false,'load-failed');this.hooks.status(`读取失败：${reason}。当前进度保持不变。`,false);return {ok:false,error:reason};
      } finally {this.hooks.endLoad();}
    });
  }

  importSave(value: unknown): Promise<SaveResult> {
    // Capture the caller's object now; later caller changes cannot race a queued import.
    let captured:unknown;
    try {captured=validateSave(value);}catch(error){const reason=message(error);this.hooks.status(`导入失败：${reason}。当前进度与旧存档保持不变。`,false);return Promise.resolve({ok:false,error:reason});}
    return this.enqueue(async()=>{
      this.hooks.status('正在导入备份…',true);this.hooks.beginLoad();
      try {return this.restore(captured);}catch(error){const reason=message(error);this.hooks.status(`导入失败：${reason}`,false);return {ok:false,error:reason};}
      finally {this.hooks.endLoad();}
    });
  }
}
