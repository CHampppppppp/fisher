import type { Game } from './game.ts';
import type { GameClock } from './clock.ts';
import type { UI } from '../ui/ui.ts';
import type { GameState } from './types.ts';
import type { Persistence } from './persistence.ts';
import { bindingAction, bindingCodes } from './settings.ts';
import type { BindingAction } from './settings.ts';

export class Controller {
  private keys = new Set<string>();
  private awaitingLock = false;
  private events = new AbortController();
  private primaryHeld = false;
  private pointerFree = false;
  private lockForHud = false;
  private lockRequestId = 0;
  private lockUsesPromise = false;
  private persistence?: Persistence;
  private loading = false;

  constructor(private game: Game, private clock: GameClock, private ui: UI, private draw: () => void) {
    const options = { signal: this.events.signal };
    document.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-storage-action]');
      if (button && !button.disabled) void this.dispatchAsync({type:button.dataset.storageAction});
    }, options);
    ui.button.addEventListener('click', () => {
      if (['dead','victory'].includes(this.game.getState().gamePhase)) {
        if (!window.confirm('重新开始？当前物品和本局进度会清除。')) return;
        this.dispatch({type:'restart',confirm:true});
      }
      void this.startFromClick();
    }, options);
    ui.pauseRestartButton.addEventListener('click', () => { if (window.confirm('重新开始新局？当前进度会清除，已有存档与设置保留。')) this.dispatch({type:'restart',confirm:true}); }, options);
    ui.settingsButton.addEventListener('click', () => this.dispatch({type:'openSettings'}), options);
    ui.closeSettingsButton.addEventListener('click', () => this.dispatch({type:'closeSettings'}), options);
    ui.volumeInput.addEventListener('input', () => this.dispatch({type:'updateSettings',volume:Number(ui.volumeInput.value)}), options);
    ui.sensitivityInput.addEventListener('input', () => this.dispatch({type:'updateSettings',sensitivity:Number(ui.sensitivityInput.value)}), options);
    ui.bindingsPanel.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-binding-action]');
      if (button) { ui.captureBinding(button.dataset.bindingAction as BindingAction); this.draw(); }
    }, options);
    ui.shopButton.addEventListener('click', () => this.dispatch({type:'openShop'}), options);
    ui.closeShopButton.addEventListener('click', () => this.closeShopFromGesture(), options);
    ui.sellButton.addEventListener('click', () => this.dispatch({type:'sell',fishId:ui.selectedShopFishId}), options);
    ui.weaponBar.addEventListener('click', event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-slot]');if(b)this.dispatch({type:'selectSlot',index:Number(b.dataset.slot)});},options);
    ui.purchaseList.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.buy-weapon');
      if (button && !button.disabled) this.dispatch({type:'buy',weaponId:button.dataset.weaponId});
    }, options);
    ui.cancelButton.addEventListener('click', () => this.dispatch({ type: 'cancelFishing' }), options);
    ui.placeButton.addEventListener('click', () => this.dispatch({ type: 'interact' }), options);
    ui.restartButton.addEventListener('click', () => {
      if (window.confirm('重新开始海岛探索？当前持鱼和钓鱼进度会清除。')) this.dispatch({ type: 'restart', confirm: true });
    }, options);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === ui.canvas) {
        if (this.awaitingLock && !document.hidden && document.hasFocus()) {
          this.awaitingLock = false;
          this.pointerFree = false; this.ui.setPointerFree(false);
          if (this.lockForHud) { this.clearInput(); this.draw(); }
          else this.resume();
          this.lockForHud = false;
        } else if (this.game.getState().gamePhase !== 'running') {
          // A delayed lock grant must not undo a blur/hidden pause.
          this.awaitingLock = false; document.exitPointerLock();
        }
      } else if (['inventory','shop','settings'].includes(this.game.getState().ui.menu)) {
        this.clearInput(); this.draw();
      } else if (this.pointerFree && this.game.getState().gamePhase === 'running') {
        this.clearInput(); this.ui.setPointerFree(true); this.draw();
      } else this.pause();
    }, options);
    document.addEventListener('pointerlockerror', () => {
      // Promise rejections carry a request ID; a legacy error event does not.
      if (!this.lockUsesPromise) this.lockFailed();
    }, options);
    window.addEventListener('blur', () => this.pause(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, options);
    document.addEventListener('keydown', event => {
      if (event.code === 'Escape') {
        event.preventDefault();
        if (event.repeat) return;
        if (ui.rebindingAction) {
          ui.rebindingAction = null; this.draw(); ui.setSettingsMessage('已取消绑定'); return;
        }
        if (ui.closeHelp()) return;
        const menu = this.game.getState().ui.menu;
        if (menu === 'settings') this.dispatch({type:'closeSettings'});
        else if (menu === 'shop') this.closeShopFromGesture();
        else if (menu === 'pause' && ui.hasStarted) this.continueFromGesture();
        else this.pause();
        return;
      }
      const state = this.game.getState();
      if (state.ui.menu === 'settings') {
        if (ui.rebindingAction && !event.repeat) {
          event.preventDefault(); const action = ui.rebindingAction; ui.rebindingAction = null;
          this.dispatch({type:'updateSettings',bindings:{[action]:event.code}});
        }
        return; // Native Tab, arrows, Space and Enter operate the settings controls.
      }
      if(event.code==='Tab'&&state.gamePhase==='running'){event.preventDefault();return;}
      const action = bindingAction(state.settings,event.code);
      if (event.code==='Tab'&&state.ui.menu==='shop'){event.preventDefault();this.closeShopFromGesture();return;}
      if (!action || event.repeat) return;
      if (action.startsWith('slot')) {
        if(!this.canControl())return;event.preventDefault();this.dispatch({type:'selectSlot',index:Number(action.at(-1))-1});return;
      }
      if (state.gamePhase === 'running' && ['cancelFishing','interact'].includes(action)) {
        event.preventDefault();
        this.dispatch(action === 'interact' ? {type:'interact'} : {type:'cancelFishing'}); return;
      }
      if (!this.canControl()) return;
      event.preventDefault();
      if (action === 'jump') {this.keys.add(event.code);if(state.locomotion!=='swimming')this.dispatch({type:'jump'});this.updateMove();return;}
      if(action==='dive'){this.keys.add(event.code);this.updateMove();return;}
      if (['forward','backward','left','right','sprint'].includes(action)) { this.keys.add(event.code); this.updateMove(); }
    }, options);
    document.addEventListener('wheel',event=>{if(!this.canControl()||event.deltaY===0)return;event.preventDefault();this.dispatch({type:'cycleSlot',delta:event.deltaY>0?1:-1});},{...options,passive:false});
    document.addEventListener('keyup', event => {
      const releasedMovement = this.keys.delete(event.code);
      if (releasedMovement && this.canControl()) this.updateMove();
    }, options);
    document.addEventListener('mousemove', event => {
      if (!this.canControl()) return;
      const state=this.game.getState();const {player:p,settings}=state;
      if(state.fishing.phase==='reeling') {
        let x=state.fishing.rodOffset.x+event.movementX*settings.sensitivity/200;
        let y=state.fishing.rodOffset.y-event.movementY*settings.sensitivity/200;
        const length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;
        this.dispatch({type:'pull',x,y});
      }
      this.dispatch({ type: 'look', yaw: p.yaw + event.movementX * 0.002 * settings.sensitivity, pitch: p.pitch - event.movementY * 0.002 * settings.sensitivity });
    }, options);
    document.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.target !== ui.canvas) return;
      if (!this.canControl()) {
        if (this.pointerFree && this.game.getState().gamePhase === 'running') void this.startFromClick(true);
        return;
      }
      if(this.primaryHeld)return;
      this.primaryHeld=true;this.dispatch({ type: 'primaryDown' });
    }, options);
    document.addEventListener('mouseup', event => {
      if (event.button !== 0 || !this.primaryHeld) return;
      this.primaryHeld = false;
      if (this.canControl()) this.dispatch({ type: 'primaryUp' });
    }, options);
  }

  private canControl(): boolean {
    return !this.loading && document.pointerLockElement === this.ui.canvas && this.game.getState().gamePhase === 'running';
  }

  setPersistence(persistence: Persistence): void { this.persistence = persistence; }
  beginLoad(): void { this.loading = true; this.clock.suspend(); }
  endLoad(): void { this.loading = false; this.clock.release(); }
  restored(): void {
    this.clearInput(); this.awaitingLock = false; this.lockForHud = false; this.pointerFree = false;
    this.ui.setPointerFree(false); this.ui.markStarted(); this.clock.resetTime();
    if (document.pointerLockElement === this.ui.canvas) document.exitPointerLock();
    this.draw();
  }
  async prepareReplay(): Promise<void> {
    if (document.pointerLockElement !== this.ui.canvas) { this.pause(); return; }
    await new Promise<void>((resolve,reject)=>{
      const complete = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(()=>{document.removeEventListener('pointerlockchange',complete);reject(new Error('Pointer release timed out'));},1000);
      document.addEventListener('pointerlockchange',complete,{once:true}); this.pause();
    });
  }
  async dispatchAsync(action: unknown): Promise<GameState['lastAction']> {
    if (action && typeof action === 'object' && !Array.isArray(action) && ['save','load'].includes((action as {type:string}).type)) {
      if (Object.keys(action).length !== 1 || !this.persistence) return this.game.persistenceResult(false,'invalid-storage-action');
      if ((action as {type:string}).type === 'save') await this.persistence.save(); else await this.persistence.load();
      this.draw(); return this.game.getState().lastAction;
    }
    return this.dispatch(action);
  }

  private updateMove(): void {
    const settings = this.game.getState().settings;
    const held = (action: BindingAction) => Number(bindingCodes(action,settings.bindings[action]).some(code=>this.keys.has(code)));
    this.dispatch({type:'swim',vertical:held('jump')-held('dive')});
    this.dispatch({ type: 'move', forward:held('forward')-held('backward'), strafe:held('right')-held('left'), sprint:Boolean(held('sprint')) });
  }

  clearInput(): void { this.keys.clear(); this.primaryHeld = false; this.game.clearInput(); }

  dispatch(action: unknown): GameState['lastAction'] {
    if (this.loading) return {accepted:false,reason:'storage-busy'};
    // The removed inventory keeps its legacy pause handling; closing the shop resumes.
    if (action && typeof action === 'object' && Object.keys(action).length === 1) {
      const type = (action as {type?:string}).type;
      const menu = this.game.getState().ui.menu;
      if (type === 'closeInventory' && menu === 'inventory') this.game.dispatch({type:'pause'});
    }
    const hadFishing=this.game.getState().fishing.phase!=='idle';
    const result = this.game.dispatch(action);
    if (result.accepted && result.reason === 'pause') this.pause();
    else if (result.accepted && result.reason === 'resume') this.resume();
    else if (result.accepted && this.game.getState().mode === 'fishing' && this.game.getState().fishing.phase!=='charging' && ['primaryDown', 'primaryUp'].includes(result.reason)) this.keys.clear();
    else if (result.accepted && ['openInventory','closeInventory','openShop','closeShop','openSettings','closeSettings'].includes(result.reason)) {
      this.clearInput(); this.clock.resetTime(); this.awaitingLock = false; this.lockForHud = false;
      this.pointerFree = ['closeInventory','closeShop'].includes(result.reason) && this.game.getState().gamePhase === 'running';
      this.ui.setPointerFree(this.pointerFree);
      if (document.pointerLockElement === this.ui.canvas) document.exitPointerLock();
    }
    else if(result.accepted&&['selectSlot','setMode','equip'].includes(result.reason)&&!hadFishing){
      this.primaryHeld=false;this.game.clearPrimaryInput();
    }
    else if (result.accepted && ['selectSlot','setMode','equip', 'cancelFishing', 'restart', 'settings-updated'].includes(result.reason)) {
      this.clearInput();
      if (result.reason === 'restart') {
        this.clock.resetTime(); this.awaitingLock = false;
        this.pointerFree = document.pointerLockElement !== this.ui.canvas;
        this.ui.setPointerFree(this.pointerFree);
      }
    }
    this.draw();
    if (result.accepted && result.reason === 'openShop') this.ui.closeShopButton.focus();
    if (result.accepted && result.reason === 'openSettings') this.ui.volumeInput.focus();
    if (result.accepted && result.reason === 'closeSettings') this.ui.settingsButton.focus();
    if (result.accepted && ['closeInventory','closeShop'].includes(result.reason) && this.game.getState().gamePhase === 'paused') this.ui.button.focus();
    return result;
  }

  observePhase(state: GameState): void {
    if (state.gamePhase !== 'dead' && state.gamePhase !== 'victory') return;
    this.clearInput(); this.awaitingLock = false; this.pointerFree = false; this.lockForHud = false;
    this.ui.setPointerFree(false); this.clock.resetTime();
    if (document.pointerLockElement === this.ui.canvas) document.exitPointerLock();
  }

  pause(): void {
    this.awaitingLock = false;
    this.pointerFree = false; this.lockForHud = false; this.ui.setPointerFree(false);
    this.clearInput(); this.game.dispatch({ type: 'pause' }); this.clock.resetTime();
    if (document.pointerLockElement === this.ui.canvas) document.exitPointerLock();
    this.draw();
  }

  resume(): void {
    this.pointerFree = false; this.ui.setPointerFree(false);
    this.clearInput(); this.ui.markStarted(); this.ui.setMessage('');
    this.game.dispatch({ type: 'resume' }); this.clock.resetTime(); this.draw();
  }

  private lockFailed(): void {
    if (!this.awaitingLock) return;
    const keepPlaying = this.lockForHud && this.game.getState().gamePhase === 'running';
    this.awaitingLock = false; this.lockForHud = false;
    if (keepPlaying) {
      this.clearInput(); this.pointerFree = true; this.ui.setPointerFree(true); this.draw();
    } else {
      this.pause(); this.ui.setMessage('鼠标锁定未成功，请再次点击按钮。桌面浏览器需要允许鼠标锁定。');
    }
  }

  private continueFromGesture(): void {
    if (this.loading || document.hidden || !document.hasFocus()) return;
    const state = this.game.getState();
    if (state.gamePhase !== 'paused' || state.ui.menu !== 'pause') return;
    this.resume();
    this.pointerFree = true; this.ui.setPointerFree(true);
    void this.startFromClick(true);
  }

  private closeShopFromGesture(): void {
    const result = this.dispatch({type:'closeShop'});
    if (result.accepted && this.game.getState().gamePhase === 'running') void this.startFromClick(true);
  }

  private async startFromClick(forHud = false): Promise<void> {
    if (this.awaitingLock || this.loading) return;
    if (!this.ui.canvas.requestPointerLock) { this.ui.setMessage('当前浏览器不支持 Pointer Lock，请使用桌面浏览器。'); return; }
    this.awaitingLock = true;
    this.lockForHud = forHud;
    const requestId = ++this.lockRequestId;
    try {
      const request = this.ui.canvas.requestPointerLock();
      this.lockUsesPromise = Boolean(request && typeof request.then === 'function');
      await request;
    } catch {
      if (requestId === this.lockRequestId) this.lockFailed();
    }
  }

  dispose(): void { this.events.abort(); this.clearInput(); }
}
