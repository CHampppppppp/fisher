import type { Game } from './game.ts';
import type { GameClock } from './clock.ts';
import type { UI } from '../ui/ui.ts';
import type { GameState } from './types.ts';
import { WEAPON_IDS } from './weapons.ts';
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
        if (!window.confirm('重新开始？当前背包、鱼和探索进度会清除。')) return;
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
    ui.inventoryButton.addEventListener('click', () => this.dispatch({type:'openInventory'}), options);
    ui.pauseInventoryButton.addEventListener('click', () => this.dispatch({type:'openInventory'}), options);
    ui.closeInventoryButton.addEventListener('click', () => this.dispatch({type:'closeInventory'}), options);
    ui.eatButton.addEventListener('click', () => this.dispatch({type:'eat',fishId:ui.selectedFishId}), options);
    ui.shopButton.addEventListener('click', () => this.dispatch({type:'openShop'}), options);
    ui.closeShopButton.addEventListener('click', () => this.dispatch({type:'closeShop'}), options);
    ui.sellButton.addEventListener('click', () => this.dispatch({type:'sell',fishId:ui.selectedShopFishId}), options);
    const weaponClick = (event: Event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.equip-weapon');
      if (button && !button.disabled) this.dispatch({type:'equip',weaponId:button.dataset.weaponId});
    };
    ui.weaponBar.addEventListener('click', weaponClick, options);
    ui.inventoryWeapons.addEventListener('click', weaponClick, options);
    ui.purchaseList.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.buy-weapon');
      if (button && !button.disabled) this.dispatch({type:'buy',weaponId:button.dataset.weaponId});
    }, options);
    ui.modeButton.addEventListener('click', () => this.dispatch({
      type: 'setMode', mode: this.game.getState().mode === 'fishing' ? 'combat' : 'fishing',
    }), options);
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
    document.addEventListener('pointerlockerror', () => this.lockFailed(), options);
    window.addEventListener('blur', () => this.pause(), options);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); }, options);
    document.addEventListener('keydown', event => {
      if (event.code === 'Escape') {
        event.preventDefault();
        if (ui.rebindingAction) { ui.rebindingAction = null; ui.setSettingsMessage('已取消绑定 · Esc 仍用于暂停'); }
        this.pause(); return;
      }
      const state = this.game.getState();
      if (state.ui.menu === 'settings') {
        if (ui.rebindingAction && !event.repeat) {
          event.preventDefault(); const action = ui.rebindingAction; ui.rebindingAction = null;
          this.dispatch({type:'updateSettings',bindings:{[action]:event.code}});
        }
        return; // Native Tab, arrows, Space and Enter operate the settings controls.
      }
      const action = bindingAction(state.settings,event.code);
      if (!action || event.repeat) return;
      if (action === 'inventory' && !['dead','victory'].includes(state.gamePhase)) {
        event.preventDefault(); const menu = state.ui.menu;
        this.dispatch({type:menu === 'shop' ? 'closeShop' : menu === 'inventory' ? 'closeInventory' : 'openInventory'}); return;
      }
      if (action.startsWith('weapon')) {
        event.preventDefault(); this.dispatch({type:'equip',weaponId:WEAPON_IDS[Number(action.at(-1))-1]}); return;
      }
      if (state.gamePhase === 'running' && ['toggleMode','cancelFishing','interact'].includes(action)) {
        event.preventDefault();
        this.dispatch(action === 'interact' ? {type:'interact'} : action === 'toggleMode'
          ? {type:'setMode',mode:state.mode === 'fishing' ? 'combat' : 'fishing'} : {type:'cancelFishing'}); return;
      }
      if (!this.canControl()) return;
      event.preventDefault();
      if (action === 'jump') { this.dispatch({type:'jump'}); return; }
      if (['forward','backward','left','right','sprint'].includes(action)) { this.keys.add(event.code); this.updateMove(); }
    }, options);
    document.addEventListener('keyup', event => {
      const releasedMovement = this.keys.delete(event.code);
      if (releasedMovement && this.canControl()) this.updateMove();
    }, options);
    document.addEventListener('mousemove', event => {
      if (!this.canControl()) return;
      const {player: p, settings} = this.game.getState();
      this.dispatch({ type: 'look', yaw: p.yaw + event.movementX * 0.002 * settings.sensitivity, pitch: p.pitch - event.movementY * 0.002 * settings.sensitivity });
    }, options);
    document.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.target !== ui.canvas) return;
      if (!this.canControl()) {
        if (this.pointerFree && this.game.getState().gamePhase === 'running') void this.startFromClick(true);
        return;
      }
      this.primaryHeld = this.dispatch({ type: 'primaryDown' }).accepted;
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
    this.dispatch({ type: 'move', forward:held('forward')-held('backward'), strafe:held('right')-held('left'), sprint:Boolean(held('sprint')) });
  }

  clearInput(): void { this.keys.clear(); this.primaryHeld = false; this.game.clearInput(); }

  dispatch(action: unknown): GameState['lastAction'] {
    if (this.loading) return {accepted:false,reason:'storage-busy'};
    const result = this.game.dispatch(action);
    if (result.accepted && result.reason === 'pause') this.pause();
    else if (result.accepted && result.reason === 'resume') this.resume();
    else if (result.accepted && this.game.getState().mode === 'fishing' && ['primaryDown', 'primaryUp'].includes(result.reason)) this.keys.clear();
    else if (result.accepted && ['openInventory','closeInventory','openShop','closeShop','openSettings','closeSettings'].includes(result.reason)) {
      this.clearInput(); this.clock.resetTime(); this.awaitingLock = false; this.lockForHud = false;
      this.pointerFree = ['closeInventory','closeShop'].includes(result.reason) && this.game.getState().gamePhase === 'running';
      this.ui.setPointerFree(this.pointerFree);
      if (document.pointerLockElement === this.ui.canvas) document.exitPointerLock();
    }
    else if (result.accepted && ['setMode', 'cancelFishing', 'restart', 'settings-updated'].includes(result.reason)) {
      this.clearInput();
      if (result.reason === 'restart') {
        this.clock.resetTime(); this.awaitingLock = false;
        this.pointerFree = document.pointerLockElement !== this.ui.canvas;
        this.ui.setPointerFree(this.pointerFree);
      }
    }
    this.draw();
    if (result.accepted && result.reason === 'openInventory') this.ui.closeInventoryButton.focus();
    if (result.accepted && result.reason === 'openShop') this.ui.closeShopButton.focus();
    if (result.accepted && result.reason === 'openSettings') this.ui.volumeInput.focus();
    if (result.accepted && result.reason === 'closeSettings') this.ui.settingsButton.focus();
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
    this.awaitingLock = false; this.pause();
    this.ui.setMessage('鼠标锁定未成功，请再次点击按钮。桌面浏览器需要允许鼠标锁定。');
  }

  private async startFromClick(forHud = false): Promise<void> {
    if (this.awaitingLock || this.loading) return;
    if (!this.ui.canvas.requestPointerLock) { this.ui.setMessage('当前浏览器不支持 Pointer Lock，请使用桌面浏览器。'); return; }
    this.awaitingLock = true;
    this.lockForHud = forHud;
    try { await this.ui.canvas.requestPointerLock(); } catch { this.lockFailed(); }
  }

  dispose(): void { this.events.abort(); this.clearInput(); }
}
