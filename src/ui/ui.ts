import type { GameState } from '../game/types.ts';
import { FISH_SPECIES } from '../game/fish-species.ts';
import { placementPreview } from '../game/fish-life.ts';
import { makeWorld } from '../game/world.ts';
import { SALE_PRICES, shopAccess } from '../game/shop.ts';
import { WEAPONS, WEAPON_IDS } from '../game/weapons.ts';
import { BINDING_ACTIONS, BINDING_LABELS, keyLabel } from '../game/settings.ts';
import type { BindingAction } from '../game/settings.ts';
import { EAT_DURATION_TICKS } from '../game/survival.ts';

export class UI {
  readonly pauseRestartButton: HTMLButtonElement;
  readonly settingsButton: HTMLButtonElement;
  readonly closeSettingsButton: HTMLButtonElement;
  readonly volumeInput: HTMLInputElement;
  readonly sensitivityInput: HTMLInputElement;
  readonly bindingsPanel: HTMLElement;
  rebindingAction: BindingAction | null = null;
  private settingsOverlay: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly button: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
  readonly restartButton: HTMLButtonElement;
  readonly placeButton: HTMLButtonElement;
  readonly shopButton: HTMLButtonElement;
  readonly closeShopButton: HTMLButtonElement;
  readonly sellButton: HTMLButtonElement;
  readonly weaponBar: HTMLElement;
  readonly purchaseList: HTMLElement;
  selectedShopFishId: string | null = null;
  private overlay: HTMLElement;
  private hp: HTMLElement;
  private hunger: HTMLElement;
  private coins: HTMLElement;
  private bearing: HTMLElement;
  private message: HTMLElement;
  private started = false;
  private fishingInfo: HTMLElement;
  private fishingActions: HTMLElement;
  private fishingStatus: HTMLElement;
  private fishingHelp: HTMLElement;
  private castDistance: HTMLElement;
  private charge: HTMLElement;
  private chargeTrack: HTMLElement;
  private pointerHint: HTMLElement;
  private reelMeters: HTMLElement;
  private tensionValue: HTMLElement;
  private progressValue: HTMLElement;
  private tensionFill: HTMLElement;
  private progressFill: HTMLElement;
  private biteWindow: HTMLElement;
  private speciesDetail: HTMLElement;
  private placementHint: HTMLElement;
  private liveFishStatus: HTMLElement;
  private fishNotice: HTMLElement;
  private attackFeedback: HTMLElement;
  private survivalWarning: HTMLElement;
  private interactionFeedback: HTMLElement;
  private shopOverlay: HTMLElement;
  private shopList: HTMLElement;
  private shopBalance: HTMLElement;
  private shopVitals: HTMLElement;
  private shopDetail: HTMLElement;
  private shopStatus: HTMLElement;
  private shopHint: HTMLElement;
  private shopSignature = '';
  private currentState: GameState | null = null;
  private bossPlaytest = false;
  private bindingSignature = '';

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <p id="playtest-banner" hidden>Boss专项试玩 · 预置装备，不代表完整流程通关</p>
      <canvas id="world" aria-label="第一人称海岛游戏场景"></canvas>
      <header class="identity"><span class="brand">潮生<span class="brand-dot">.</span></span></header>
      <p id="rare-progress" role="status">金鳞捕获 0 / 3</p>
      <section id="boss-hud" aria-label="章鱼Boss状态" hidden><div class="boss-heading"><strong>北岸章鱼</strong><span id="boss-phase">第一阶段</span><strong id="boss-hp">600 / 600</strong></div><div class="boss-bar"><span id="boss-hp-fill"></span></div><p id="boss-attack-status" role="status"></p></section>
      <div id="damage-flash" aria-hidden="true" hidden></div>
      <div id="underwater-tint" hidden aria-hidden="true"></div><p id="oxygen" hidden>氧气 <span id="oxygen-value">20</span></p>
      <div id="hud" aria-label="玩家状态">
        <div class="compass"><span>W</span><span class="compass-mark">│</span><strong id="bearing">N</strong><span class="compass-mark">│</span><span>E</span></div>
        <div class="coins"><span>金币</span><strong id="coins-value">0</strong><span class="coin-symbol" aria-hidden="true">◎</span></div>
        <div class="vitals">
          <div class="vital"><span>生命</span><strong id="hp-value">100</strong><span class="bar"><span></span></span></div>
          <div class="vital hunger"><span>饥饿</span><strong id="hunger-value">100</strong><span class="bar"><span></span></span></div>
        </div>
        <div id="crosshair" aria-hidden="true"></div>
      </div>
      <div id="fishing-info" aria-live="polite">
        <div class="fishing-heading"><strong id="fishing-status">选择海水落点</strong><span id="cast-distance">3.0 m</span></div>
        <p id="species-detail" hidden></p>
        <p id="placement-hint" hidden></p>
        <p id="attack-feedback" hidden></p>
        <div id="charge-track"><div id="charge-fill"></div></div>
        <span id="bite-window" hidden></span>
        <p id="pull-feedback" hidden></p>
        <div id="reel-meters" hidden>
          <div class="reel-meter"><span>张力</span><strong id="tension-value">40.0</strong><span class="meter-track"><span id="tension-fill"></span></span></div>
          <div class="reel-meter"><span>收杆进度</span><strong id="progress-value">0.0</strong><span class="meter-track"><span id="progress-fill"></span></span></div>
        </div>
        <p id="fishing-help">按住左键蓄力，松开抛竿</p>
      </div>
      <div id="fishing-actions">
        <button id="cancel-fishing" type="button" hidden>取消钓鱼 <kbd>R</kbd></button>
        <button id="place-fish" type="button" hidden>放下活鱼 <kbd>E</kbd></button>
        <button id="restart-button" type="button" hidden>重新开始</button>
        <button id="shop-button" type="button" hidden>海风商店 <kbd>E</kbd></button>
      </div>
      <p id="pointer-hint" hidden>鼠标已释放 · 点击场景继续观察</p>
      <p id="live-fish-status" hidden aria-live="polite"></p>
      <p id="fish-notice" hidden role="status"></p>
      <p id="interaction-feedback" hidden role="status"></p>
      <p id="survival-warning" hidden role="status">饥饿过低 · 生命每秒减少 2 · 选择鱼格，左键食用</p>
      <div id="eating-info" hidden><span id="eating-label"></span><progress id="eating-progress" aria-label="吃鱼进度" max="${EAT_DURATION_TICKS}" value="0"></progress><small>按住左键 · 松开取消</small></div>
      <p id="shop-hint" hidden role="status">柜台就在眼前 · 按 E 出售 / 购买武器</p>
      <nav id="weapon-bar" aria-label="物品快捷栏">${this.weaponButtons()}</nav>
      <p id="weapon-feedback" role="status" aria-live="polite"></p>
      <section id="menu" aria-labelledby="menu-title">
        <div class="menu-content">
          <h1 id="menu-title">潮生</h1>
          <p id="menu-description">钓鱼、补充食物，准备迎战章鱼。</p>
          <dl id="victory-stats" hidden></dl>
          <div class="menu-actions"><button id="play-button" type="button">开始游戏</button>
          <button id="settings-button" type="button">设置</button><button id="pause-restart" type="button" hidden>重新开始</button>
          ${this.storageTools()}
          <details id="menu-help"><summary>操作帮助</summary><div class="help-content"><div id="controls"><span><kbd>W A S D</kbd> 移动</span><span><kbd>SPACE</kbd> 跳跃</span><span><kbd>SHIFT</kbd> 冲刺</span><span><kbd>E</kbd> 交互</span><span><kbd>TAB</kbd> 背包</span><span><kbd>ESC</kbd> 暂停</span></div><p>钓鱼：按住左键蓄力，松开抛竿；咬钩后按住左键收杆，松开缓解张力。</p><p>切换模式 Q · 取消钓鱼 R · 战斗时左键攻击 · 1–4 切换武器。</p></div></details></div>
          <p id="playtest-entry"><a href="?playtest=boss">Boss 专项试玩</a></p>
          <p class="lock-help">点击开始后使用鼠标观察，Esc 暂停</p>
          <p id="menu-message" role="status" aria-live="polite"></p>
        </div>

      </section>
      <section id="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
        <div class="settings-panel">
          <div class="inventory-heading"><h2 id="settings-title">设置</h2><span>自动保存</span></div>
          <p class="inventory-help">Esc 返回菜单</p>
          <label class="setting-range" for="volume-input"><span>音量 <output id="volume-output" for="volume-input">100%</output></span><input id="volume-input" type="range" min="0" max="100" step="any" value="100"><small>0% 完全静音</small></label>
          <label class="setting-range" for="sensitivity-input"><span>鼠标灵敏度 <output id="sensitivity-output" for="sensitivity-input">1.00 倍</output></span><input id="sensitivity-input" type="range" min="0.25" max="3" step="any" value="1"><small>0.25–3 倍 · 数值越大转向越快</small></label>
          <h3>动作键位</h3><p class="settings-help">选择按键按钮后按新键；Esc 取消绑定并保留暂停。重复按键拒绝，Tab 可导航控件。</p>
          <div id="settings-bindings">${BINDING_ACTIONS.map(action=>`<div class="binding-row"><span>${BINDING_LABELS[action]}</span><button type="button" data-binding-action="${action}"></button></div>`).join('')}</div>
          <p id="settings-status" role="status" aria-live="polite">修改后自动保留，关闭设置后点击继续。</p>
          <button id="close-settings" type="button">返回菜单</button>
        </div>
      </section>
      <section id="shop-menu" role="dialog" aria-modal="true" aria-labelledby="shop-title" hidden>
        <div class="inventory-panel shop-panel">
          <div class="inventory-heading"><h2 id="shop-title">海风补给</h2><span id="shop-balance">金币 0</span></div>
          <p class="inventory-help">游戏已暂停</p>
          <p id="shop-vitals"></p>
          <div class="shop-columns"><section aria-labelledby="sale-title"><h3 id="sale-title">出售鱼尸体</h3>
          <div id="shop-list" aria-label="可出售尸体"></div>
          <p id="shop-detail">选择一条鱼查看售价。</p>
          </section><section aria-labelledby="purchase-title"><h3 id="purchase-title">购买武器</h3><div id="purchase-list">
          ${WEAPON_IDS.filter(id => id !== 'fist').map(id => `<div class="weapon-offer"><strong>${WEAPONS[id].name} <span>${WEAPONS[id].price} 金币</span></strong><p>伤害 ${WEAPONS[id].damage} · 射程 ${WEAPONS[id].range} m<br>动作 ${WEAPONS[id].cooldownTicks / 60} s · 击退 ${WEAPONS[id].knockback} m</p><button class="buy-weapon" data-weapon-id="${id}" type="button">购买${WEAPONS[id].name}</button></div>`).join('')}
          </div><p class="inventory-help">购买后通过快捷栏装备<br>切换工具不会提前结束动作</p></section></div>
          <p id="shop-status" role="status" aria-live="polite"></p>
          <div class="inventory-actions"><button id="sell-button" type="button" disabled>出售所选鱼</button><button id="close-shop" type="button">返回游戏</button></div>
          ${this.storageTools()}
          <p class="inventory-help">Esc 返回游戏</p>
        </div>
      </section>
      <div id="fatal" role="alert" hidden></div>`;
    this.canvas = root.querySelector<HTMLCanvasElement>('#world')!;
    this.button = root.querySelector<HTMLButtonElement>('#play-button')!;
    this.pauseRestartButton = root.querySelector<HTMLButtonElement>('#pause-restart')!;
    this.settingsButton = root.querySelector<HTMLButtonElement>('#settings-button')!;
    this.closeSettingsButton = root.querySelector<HTMLButtonElement>('#close-settings')!;
    this.volumeInput = root.querySelector<HTMLInputElement>('#volume-input')!;
    this.sensitivityInput = root.querySelector<HTMLInputElement>('#sensitivity-input')!;
    this.bindingsPanel = root.querySelector<HTMLElement>('#settings-bindings')!;
    this.settingsOverlay = root.querySelector<HTMLElement>('#settings-menu')!;
    this.overlay = root.querySelector<HTMLElement>('#menu')!;
    this.hp = root.querySelector<HTMLElement>('#hp-value')!;
    this.hunger = root.querySelector<HTMLElement>('#hunger-value')!;
    this.coins = root.querySelector<HTMLElement>('#coins-value')!;
    this.bearing = root.querySelector<HTMLElement>('#bearing')!;
    this.message = root.querySelector<HTMLElement>('#menu-message')!;
    this.cancelButton = root.querySelector<HTMLButtonElement>('#cancel-fishing')!;
    this.fishingInfo = root.querySelector<HTMLElement>('#fishing-info')!;
    this.fishingActions = root.querySelector<HTMLElement>('#fishing-actions')!;
    this.fishingStatus = root.querySelector<HTMLElement>('#fishing-status')!;
    this.fishingHelp = root.querySelector<HTMLElement>('#fishing-help')!;
    this.castDistance = root.querySelector<HTMLElement>('#cast-distance')!;
    this.charge = root.querySelector<HTMLElement>('#charge-fill')!;
    this.chargeTrack = root.querySelector<HTMLElement>('#charge-track')!;
    this.pointerHint = root.querySelector<HTMLElement>('#pointer-hint')!;
    this.restartButton = root.querySelector<HTMLButtonElement>('#restart-button')!;
    this.placeButton = root.querySelector<HTMLButtonElement>('#place-fish')!;
    this.reelMeters = root.querySelector<HTMLElement>('#reel-meters')!;
    this.tensionValue = root.querySelector<HTMLElement>('#tension-value')!;
    this.progressValue = root.querySelector<HTMLElement>('#progress-value')!;
    this.tensionFill = root.querySelector<HTMLElement>('#tension-fill')!;
    this.progressFill = root.querySelector<HTMLElement>('#progress-fill')!;
    this.biteWindow = root.querySelector<HTMLElement>('#bite-window')!;
    this.speciesDetail = root.querySelector<HTMLElement>('#species-detail')!;
    this.placementHint = root.querySelector<HTMLElement>('#placement-hint')!;
    this.liveFishStatus = root.querySelector<HTMLElement>('#live-fish-status')!;
    this.fishNotice = root.querySelector<HTMLElement>('#fish-notice')!;
    this.attackFeedback = root.querySelector<HTMLElement>('#attack-feedback')!;
    this.survivalWarning = root.querySelector<HTMLElement>('#survival-warning')!;
    this.interactionFeedback = root.querySelector<HTMLElement>('#interaction-feedback')!;
    this.shopButton = root.querySelector<HTMLButtonElement>('#shop-button')!;
    this.closeShopButton = root.querySelector<HTMLButtonElement>('#close-shop')!;
    this.sellButton = root.querySelector<HTMLButtonElement>('#sell-button')!;
    this.shopOverlay = root.querySelector<HTMLElement>('#shop-menu')!;
    this.shopList = root.querySelector<HTMLElement>('#shop-list')!;
    this.shopBalance = root.querySelector<HTMLElement>('#shop-balance')!;
    this.shopVitals = root.querySelector<HTMLElement>('#shop-vitals')!;
    this.shopDetail = root.querySelector<HTMLElement>('#shop-detail')!;
    this.shopStatus = root.querySelector<HTMLElement>('#shop-status')!;
    this.shopHint = root.querySelector<HTMLElement>('#shop-hint')!;
    this.weaponBar = root.querySelector<HTMLElement>('#weapon-bar')!;
    this.purchaseList = root.querySelector<HTMLElement>('#purchase-list')!;
  }

  private weaponButtons(): string {
    return ['鱼竿','拳头','木棍','鱼叉','重锤','银鳍鱼','岩鲈鱼','蓝背鱼','金鳞鱼'].map((name,index)=>`<button type="button" data-slot="${index}" aria-pressed="false"><kbd>${index+1}</kbd><span class="slot-name">${name}</span><small class="slot-count"></small></button>`).join('');
  }

  private storageTools(): string {
    return `<section class="storage-tools" aria-label="本地存档"><div><button type="button" data-storage-action="save">保存游戏</button><button type="button" data-storage-action="load">读取存档</button></div><p class="storage-status" role="status" aria-live="polite"></p></section>`;
  }
  setStorageStatus(message: string, busy: boolean): void {
    document.querySelectorAll<HTMLElement>('.storage-status').forEach(element => { element.textContent = message; });
    document.querySelectorAll<HTMLButtonElement>('[data-storage-action]').forEach(button => { button.disabled = busy; });
  }

  private key(action: BindingAction): string { return keyLabel(this.currentState!.settings.bindings[action]); }
  setSettingsMessage(message: string): void { document.querySelector('#settings-status')!.textContent = message; }
  captureBinding(action: BindingAction): void {
    this.rebindingAction = action; this.setSettingsMessage(`请按新的${BINDING_LABELS[action]}按键 · Esc 取消`);
  }
  private updateSettings(state: GameState): void {
    this.settingsOverlay.hidden = state.ui.menu !== 'settings';
    if (state.ui.menu !== 'settings') this.rebindingAction = null;
    this.volumeInput.value = String(state.settings.volume); this.sensitivityInput.value = String(state.settings.sensitivity);
    document.querySelector('#volume-output')!.textContent = state.settings.volume === 0 ? '0% · 已静音' : `${state.settings.volume}%`;
    document.querySelector('#sensitivity-output')!.textContent = `${state.settings.sensitivity.toFixed(2)} 倍`;
    for (const button of this.bindingsPanel.querySelectorAll<HTMLButtonElement>('[data-binding-action]')) {
      const action = button.dataset.bindingAction as BindingAction;
      button.textContent = this.rebindingAction === action ? '按下新键…' : this.key(action);
      button.classList.toggle('capturing',this.rebindingAction === action);
      button.setAttribute('aria-label',`修改${BINDING_LABELS[action]}按键，当前 ${this.key(action)}`);
    }
    const errors: Record<string,string> = { 'settings-updated':'已保存设置 · 关闭后点击继续', 'binding-conflict':'按键已被其他动作占用，原设置未改变', 'reserved-key':'Esc 保留为暂停，原设置未改变', 'invalid-key':'不支持此键码，请使用字母、数字、方向或修饰键', 'invalid-volume':'音量必须在 0–100% 内', 'invalid-sensitivity':'灵敏度必须在 0.25–3 倍内', 'invalid-bindings':'动作或绑定格式无效', 'invalid-settings':'设置格式无效', 'settings-write-failed':'设置写入失败，原设置保持不变' };
    if (!this.rebindingAction && errors[state.lastAction.reason]) this.setSettingsMessage(errors[state.lastAction.reason]);
    const signature = JSON.stringify(state.settings.bindings);
    if (signature !== this.bindingSignature) {
      this.bindingSignature = signature;
      this.shopSignature = '';
      document.querySelector('#menu-help .help-content p:last-child')!.textContent = `数字1–9或滚轮选择物品，左键使用；${this.key('cancelFishing')} 收回鱼竿。水中松手缓慢下沉，${this.key('jump')} 划水上浮 / ${this.key('dive')} 下潜。`;
      document.querySelector('#controls')!.innerHTML = `<span><kbd>${(['forward','left','backward','right'] as const).map(action=>this.key(action)).join(' ')}</kbd> 移动</span><span><kbd>${this.key('jump')}</kbd> 跳跃 / 上浮</span><span><kbd>${this.key('sprint')}</kbd> 冲刺</span><span><kbd>${this.key('interact')}</kbd> 交互</span><span><kbd>ESC</kbd> 暂停</span>`;
    }
  }

  setBossPlaytest(enabled: boolean): void {
    this.bossPlaytest = enabled;
    document.querySelector<HTMLElement>('#playtest-banner')!.hidden = !enabled;
    if (enabled) {
      document.querySelector('#playtest-entry')!.innerHTML = '<a href="./">返回普通游戏</a>';
      document.querySelectorAll<HTMLElement>('.storage-tools').forEach(section => {
        section.hidden = true;
      });
    }
  }

  markStarted(): void {
    if (this.started) return;
    this.started = true;
    this.overlay.classList.add('pause-menu');
  }

  get hasStarted(): boolean { return this.started; }

  closeHelp(): boolean {
    const help = document.querySelector<HTMLDetailsElement>('#menu-help')!;
    if (!help.open) return false;
    help.open = false; help.querySelector<HTMLElement>('summary')!.focus(); return true;
  }

  setMessage(message: string): void { this.message.textContent = message; }
  setPointerFree(free: boolean): void {
    this.pointerHint.hidden = !free;
    document.body.classList.toggle('pointer-free', free);
  }

  update(state: GameState): void {
    this.currentState = state;
    this.updateSettings(state);
    const paused = state.gamePhase !== 'running';
    const dead = state.gamePhase === 'dead';
    const victory = state.gamePhase === 'victory';
    this.overlay.hidden = state.ui.menu !== 'pause' && !dead && !victory;
    this.shopOverlay.hidden = state.ui.menu !== 'shop';
    const access = shopAccess(state.player);
    this.shopButton.hidden = !access.valid; this.shopHint.hidden = !access.valid || paused;
    this.pauseRestartButton.hidden = !this.started || dead || victory;
    if (this.started) {
      document.querySelector('#menu-title')!.textContent = victory ? '通关成功' : dead ? '游戏结束' : '游戏已暂停';
      document.querySelector('#menu-description')!.textContent = victory ? '你击败了章鱼。' : dead ? state.deathReason==='drowning' ? '溺水了。重新开始，留意氧气。' : state.deathReason==='boss' ? '生命耗尽。章鱼的攻击终结了这次探索。重新开始，留意地面预警与墨汁方向。' : '生命耗尽。饥饿低于 20 时会持续失去生命。重新开始，再次探索海岛。' : '按 Esc 或选择继续游戏返回海岛。';
      this.button.textContent = dead || victory ? '重新开始' : '继续游戏';
      document.querySelector('.lock-help')!.textContent = dead || victory ? '确认重新开始后重置本局进度，并锁定鼠标' : 'Esc 继续游戏 · 游戏中 Esc 暂停';
    }
    if (this.bossPlaytest) {
      document.querySelector('#menu-title')!.textContent = victory ? '试玩完成' : dead ? '挑战失败' : 'Boss 专项试玩';
      document.querySelector('#menu-description')!.textContent = '全武器已解锁，默认装备重锤。此模式不读写普通游戏存档。';
      this.button.textContent = dead || victory ? '再次挑战' : this.started ? '继续挑战' : '开始挑战';
      this.pauseRestartButton.textContent = '重新挑战 Boss';
    }
    document.body.classList.toggle('is-paused', paused);
    document.body.classList.toggle('has-started', this.started);
    document.body.classList.toggle('in-menu', state.ui.menu !== 'none' || paused);
    if (this.overlay.hidden) document.querySelector<HTMLDetailsElement>('#menu-help')!.open = false;
    this.hp.textContent = String(Number(state.player.hp.toFixed(1)));
    this.hunger.textContent = String(Number(state.player.hunger.toFixed(1)));
    document.querySelector<HTMLElement>('.vital .bar>span')!.style.width = `${state.player.hp}%`;
    document.querySelector<HTMLElement>('.hunger .bar>span')!.style.width = `${state.player.hunger}%`;
    this.survivalWarning.textContent = `饥饿过低 · 生命每秒减少 2 · 选择鱼格，按住左键 2 秒食用`;
    this.survivalWarning.hidden = state.player.hunger >= 20 || dead || victory;
    document.body.classList.toggle('low-hunger', state.player.hunger < 20);
    this.updateShop(state);
    this.updateBoss(state);
    const notices: Record<string,string> = { 'inventory-full':'物品已满（10 / 10）· 尸体仍在岸上', 'pickup-corpse':`已拾取尸体 · 已放入快捷栏`, 'no-corpse-in-range':'2 米内没有尸体 · 商店需走到正面柜台', 'place-fish':'已放下活鱼', 'shop-too-far':'柜台距离超过 2 米，请走到商店正面', 'shop-obstructed':'柜台被墙挡住，请绕到商店正面' };
    if (notices[state.lastAction.reason]) { this.interactionFeedback.textContent = notices[state.lastAction.reason]; this.interactionFeedback.hidden = false; }
    if (['reset','restart'].includes(state.lastAction.reason)) this.interactionFeedback.hidden = true;
    this.coins.textContent = String(state.coins);
    const angle = ((state.player.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const direction = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(angle / 45) % 8];
    this.bearing.textContent = `${direction} ${Math.round(angle)}°`;
    const { fishing, mode } = state;
    const reeling = fishing.phase === 'reeling';
    const carriedFish = state.fish.find(fish => fish.state === 'carried');
    const carrying = Boolean(carriedFish);
    const species = carriedFish?.species ?? fishing.species;
    const definition = species ? FISH_SPECIES[species] : null;
    this.speciesDetail.hidden = !definition || (!reeling && !carrying);
    this.speciesDetail.textContent = definition ? `${definition.rarity} · 出现概率 ${definition.probability}% · 挣扎 +${definition.struggle}/秒` : '';
    this.fishingInfo.hidden = paused && !reeling && fishing.phase !== 'bite'; this.fishingActions.hidden = paused;
    this.cancelButton.hidden = fishing.phase === 'idle';
    this.cancelButton.innerHTML = `取消钓鱼 <kbd>${this.key('cancelFishing')}</kbd>`;
    this.placeButton.innerHTML = `放下活鱼 <kbd>${this.key('interact')}</kbd>`;
    this.shopButton.innerHTML = `海风商店 <kbd>${this.key('interact')}</kbd>`;
    this.shopHint.textContent = `柜台就在眼前 · 按 ${this.key('interact')} 出售 / 购买武器`;
    this.restartButton.hidden = !carrying;
    this.placeButton.hidden = !carrying;
    const placement = placementPreview(makeWorld(state.fixture), state.player);
    const placementReasons: Record<string, string> = { water: '不能放入海水', obstructed: '落点或路径被障碍挡住', 'body-overlap': '落点太近，与身体重叠', 'no-ground': '请站稳并朝向脚下沙地' };
    this.placementHint.hidden = !carrying;
    this.placementHint.textContent = placement.valid ? `绿色落点 · 按 ${this.key('interact')} 放下活鱼` : placementReasons[placement.reason];
    const living = state.fish.filter(fish => fish.state !== 'carried').sort((a, b) =>
      Math.hypot(a.position.x - state.player.position.x, a.position.z - state.player.position.z) - Math.hypot(b.position.x - state.player.position.x, b.position.z - state.player.position.z));
    this.liveFishStatus.hidden = living.length === 0;
    const attacking = state.attack.elapsed < WEAPONS[state.attack.weaponId].animationSeconds;
    const focus = (attacking && state.attack.targetKind!=='boss' && living.find(fish => fish.id === state.attack.hitId)) || living[0];
    if (focus) this.liveFishStatus.textContent = `${FISH_SPECIES[focus.species].name} · ${focus.state === 'groundedDead' ? '尸体' : focus.jumpPhase === 'warning' ? '起跳预兆' : focus.jumpPhase === 'jumping' ? '跳跃中' : '正在岸上'} · HP ${focus.hp}/${FISH_SPECIES[focus.species].hp}${focus.state === 'groundedDead' ? ` · 2 米内按 ${this.key('interact')} 拾取` : ` · 活鱼 ${living.filter(fish => fish.state === 'groundedAlive').length}`}`;
    this.attackFeedback.hidden = mode !== 'combat' || (!attacking && state.attackCooldownRemaining === 0);
    const weapon = WEAPONS[state.currentWeapon]; const usedWeapon = WEAPONS[state.attack.weaponId];
    const feedback = attacking && state.attack.result !== 'none' ? state.attack.result === 'kill' ? `${usedWeapon.name}击杀 · ${state.attack.targetKind==='boss'?'章鱼已败':'鱼已死亡'}` : state.attack.result === 'hit' ? `${usedWeapon.name}命中${state.attack.targetKind==='boss'?'章鱼':''} · 伤害 ${usedWeapon.damage}` : `${usedWeapon.name}挥空` : state.attackCooldownRemaining > 0 ? `${weapon.name} · 攻击恢复中` : `${weapon.name}已就绪`;
    this.attackFeedback.textContent = `${feedback} · ${state.attackCooldownRemaining > 0 ? `冷却 ${state.attackCooldownRemaining.toFixed(2)} s` : '点击左键攻击'}`;
    const escaped = state.terminalFish.findLast(fish => fish.state === 'escaped');
    this.fishNotice.hidden = !escaped || state.simulationTick - escaped.escapedTick > 360;
    this.fishNotice.textContent = escaped ? `${FISH_SPECIES[escaped.species].name}逃入海中` : '';
    this.castDistance.hidden = mode !== 'fishing' || carrying;
    this.chargeTrack.hidden = mode !== 'fishing' || carrying || fishing.phase !== 'charging';
    this.reelMeters.hidden = !reeling;
    const pull=document.querySelector<HTMLElement>('#pull-feedback')!;
    pull.hidden=!reeling;
    pull.textContent='反向牵引 '+Math.round(fishing.counterStrength*100)+'%';
    this.tensionValue.textContent = fishing.tension.toFixed(1); this.progressValue.textContent = fishing.progress.toFixed(1);
    this.tensionFill.style.width = `${fishing.tension}%`; this.progressFill.style.width = `${fishing.progress}%`;
    this.fishingInfo.classList.toggle('danger-tension', fishing.tension >= 90 || fishing.tension <= 10);
    this.fishingInfo.classList.toggle('has-bite', fishing.phase === 'bite');
    this.biteWindow.hidden = fishing.phase !== 'bite'; this.biteWindow.textContent = `提杆窗口 ${fishing.biteRemaining.toFixed(2)} s`;
    this.castDistance.textContent = `${(fishing.cast?.distance ?? fishing.preview.distance).toFixed(1)} m`;
    this.charge.style.width = `${fishing.chargeSeconds * 100}%`;
    const reason = fishing.preview.reason === 'land' ? '落点在陆地' : '鱼线被建筑或岸坡遮挡';
    this.fishingInfo.classList.toggle('invalid-cast', !fishing.preview.valid && mode === 'fishing');
    if (carrying) {
      this.fishingStatus.textContent = `${definition!.name} · 捕获成功 · 已拿在手中`;
      this.fishingHelp.textContent = `持鱼时不能抛竿 · ${this.key('interact')} 放鱼 · 上岸后放下`;
    } else if (fishing.phase === 'bite') {
      this.fishingStatus.textContent = '咬钩了！点击左键提杆'; this.fishingHelp.textContent = paused ? '计时已冻结 · 点击继续后再提杆' : '抓住浮漂下沉的瞬间';
    } else if (reeling) {
      this.fishingStatus.textContent = fishing.struggling ? `${definition!.name}正在挣扎` : `收杆中 · ${definition!.name}`;
      this.fishingHelp.textContent = paused ? '计时已冻结 · 继续后重新按住左键' : '鼠标反向拉杆 · 按住收鱼，松开缓解张力';
    } else if (mode === 'combat') {
      this.fishingStatus.textContent = `${weapon.name} · 战斗模式`; this.fishingHelp.textContent = `伤害 ${weapon.damage} · 射程 ${weapon.range} m`;
    } else if (fishing.phase === 'waiting') {
      const flying=state.simulationTick-fishing.lastCastTick<21;
      this.fishingStatus.textContent = flying?'抛竿中':'等待中 · 浮漂已入水';
      this.fishingHelp.textContent = flying?'浮漂正在飞向落点':`看住浮漂 · 咬钩时点击左键提杆 · ${this.key('cancelFishing')} 取消`;
    } else if (fishing.phase === 'charging') {
      this.fishingStatus.textContent = fishing.preview.valid ? '蓄力中 · 有效海水落点' : `蓄力中 · ${reason}`;
      this.fishingHelp.textContent = `1 秒满蓄力 · 松开左键抛竿 · ${this.key('cancelFishing')} 取消`;
    } else {
      const outcomes = { 'missed-bite': '错过咬钩 · 可以重新抛竿', 'line-broken': '断线 · 张力持续过高',
        unhooked: '脱钩 · 张力持续过低', cancelled: '已取消钓鱼', landed: '捕获成功 · 鱼已上岸' };
      const failure = !state.lastAction.accepted && ['land', 'obstructed'].includes(state.lastAction.reason);
      this.fishingStatus.textContent = fishing.result ? outcomes[fishing.result] : failure ? `抛竿失败 · ${state.lastAction.reason === 'land' ? '落点在陆地' : '鱼线受到遮挡'}`
        : fishing.preview.valid ? '有效海水落点' : reason;
      this.fishingHelp.textContent = '走近岸边 · 按住左键蓄力，松开抛竿';
    }
    this.updateWeapons(state);
  }

  private updateBoss(state: GameState): void {
    const boss=state.boss; const visible=boss.state!=='locked';
    document.querySelector<HTMLElement>('#rare-progress')!.textContent=`金鳞捕获 ${state.rareCaughtCount} / 3${visible?' · 北岸章鱼'+(boss.state==='defeated'?'已败':'已出现'):''}`;
    document.querySelector<HTMLElement>('#boss-hud')!.hidden=!visible;
    document.body.classList.toggle('boss-active',boss.state==='active');
    document.querySelector('#boss-phase')!.textContent=boss.state==='defeated'?'已击败':boss.phase===1?'第一阶段 · 触手':'第二阶段 · 触手 + 墨汁';
    document.querySelector('#boss-hp')!.textContent=`${boss.hp} / 600`;
    document.querySelector<HTMLElement>('#boss-hp-fill')!.style.width=`${boss.hp/600*100}%`;
    const warnings=boss.attacks.map(attack=>attack.type==='tentacle' ? attack.phase==='warning' ? `触手预警 ${attack.remaining.toFixed(2)} s · 移出红圈` : '触手生效 · 避开红圈' : attack.phase==='warning' ? `墨汁预警 ${attack.remaining.toFixed(2)} s · 侧移躲开锁定方向` : '墨汁飞行中');
    document.querySelector('#boss-attack-status')!.textContent=boss.state==='defeated'?'战斗结束':boss.jumpPhase==='warning'?'避开落点，章鱼要砸下来了':warnings.length?warnings.join(' / '):'贴近身体可以攻击 · 留意落地冲击';
    const damage=state.events.findLast(event=>event.type==='player_damage');
    document.querySelector<HTMLElement>('#damage-flash')!.hidden=!damage || state.simulationTick-damage.tick>=9 || state.gamePhase==='victory';
    const statistics=document.querySelector<HTMLElement>('#victory-stats')!;statistics.hidden=state.gamePhase!=='victory';
    if(!statistics.hidden) statistics.innerHTML=`<div><dt>探索时间</dt><dd>${(state.simulationTick/60).toFixed(1)} 秒</dd></div><div><dt>本次捕获 / 累计金鳞</dt><dd>${state.stats.caught} / ${state.rareCaughtCount}</dd></div><div><dt>鱼击杀 / 出售</dt><dd>${state.stats.killed} / ${state.stats.sold}</dd></div><div><dt>赚取 / 当前金币</dt><dd>${state.stats.coinsEarned} / ${state.coins}</dd></div>`;
  }

  private updateWeapons(state: GameState): void {
    this.weaponBar.hidden=state.gamePhase!=='running';
    const species=['sprat','bass','tuna','golden'] as const;
    for(const button of this.weaponBar.querySelectorAll<HTMLButtonElement>('[data-slot]')){
      const index=Number(button.dataset.slot),weapon=WEAPON_IDS[index-1];
      const locked=index>1&&index<5&&!state.unlockedWeapons.includes(weapon);
      button.setAttribute('aria-pressed',String(state.selectedSlot===index));button.setAttribute('aria-disabled',String(locked));
      button.querySelector('kbd')!.textContent=this.key(`slot${index+1}` as BindingAction);
      button.querySelector('.slot-count')!.textContent=locked?'未解锁':index>=5?String(state.inventory.filter(f=>f.species===species[index-5]).length):'';
    }
    for(const button of this.purchaseList.querySelectorAll<HTMLButtonElement>('.buy-weapon')){
      const id=button.dataset.weaponId as typeof WEAPON_IDS[number];button.disabled=state.unlockedWeapons.includes(id);
      button.textContent=button.disabled?'已购买':`购买 · ${WEAPONS[id].price} 金币`;
    }
    const errors:Record<string,string>={'weapon-locked':'尚未购买这件工具','carrying-fish':'先把活鱼放在地上','empty-slot':'这里没有鱼','hunger-full':'现在不饿，先留着吧','in-water':'需要先上岸','inventory-full':'最多携带10条鱼','attack-active':'动作还没结束'};
    const element=document.querySelector<HTMLElement>('#weapon-feedback')!;
    const selectedFood=state.inventory.some(f=>f.species===species[state.selectedSlot-5]);
    const notice=errors[state.lastAction.reason]??(selectedFood&&state.eating.fishId===null?'按住左键 2 秒食用':'');
    element.hidden=state.gamePhase!=='running'||!notice;element.textContent=notice;
    const wet=state.locomotion==='swimming';document.querySelector<HTMLElement>('#oxygen')!.hidden=!wet;
    document.querySelector('#oxygen-value')!.textContent=state.player.oxygen.toFixed(1)+' s';
    document.querySelector<HTMLElement>('#underwater-tint')!.hidden=!state.submerged;
    this.fishingInfo.hidden=state.gamePhase!=='running'||state.selectedSlot>=5||(state.fishing.phase==='idle'&&!state.fish.some(f=>f.state==='carried'));
    const eatingFish=state.inventory.find(f=>f.id===state.eating.fishId);
    document.querySelector<HTMLElement>('#eating-info')!.hidden=state.gamePhase!=='running'||!eatingFish;
    document.querySelector('#eating-label')!.textContent=eatingFish?`正在吃${FISH_SPECIES[eatingFish.species].name} · ${((EAT_DURATION_TICKS-state.eating.elapsedTicks)/60).toFixed(1)} s`:'';
    document.querySelector<HTMLProgressElement>('#eating-progress')!.value=state.eating.elapsedTicks;
  }

  private updateShop(state: GameState): void {
    this.shopBalance.textContent = `金币 ${state.coins}`;
    this.shopVitals.textContent = `生命 ${Number(state.player.hp.toFixed(1))} / 100　饥饿 ${Number(state.player.hunger.toFixed(1))} / 100`;
    const signature = JSON.stringify(state.inventory);
    if (signature !== this.shopSignature) {
      this.shopSignature = signature; this.shopList.replaceChildren();
      if (!state.inventory.some(item => item.id === this.selectedShopFishId)) this.selectedShopFishId = null;
      if (!state.inventory.length) this.shopList.textContent = `没有可出售的鱼。先击杀岸上的鱼，拾取后再来。`;
      for (const item of state.inventory) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'shop-item'; button.dataset.fishId = item.id;
        button.textContent = `${FISH_SPECIES[item.species].name} · ${SALE_PRICES[item.species]} 金币`;
        button.addEventListener('click', () => { this.selectedShopFishId = item.id; this.updateShop(this.currentState!); });
        this.shopList.append(button);
      }
    }
    for (const button of this.shopList.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.fishId === this.selectedShopFishId));
    const selected = state.inventory.find(item => item.id === this.selectedShopFishId);
    this.sellButton.disabled = !selected;
    this.shopDetail.textContent = selected ? `${FISH_SPECIES[selected.species].name}：出售获得 ${SALE_PRICES[selected.species]} 金币。售出后不能再食用。` : state.inventory.length ? '选择一条鱼查看售价。' : '';
    const errors: Record<string,string> = {'not-in-inventory':'物品已消费或不在物品中 · 未增加金币', 'invalid-sell':'请选择有效死鱼 · 未增加金币', 'shop-not-open':'请先打开商店', 'coin-limit':'金币无法精确交易 · 保留物品和解锁状态', 'insufficient-coins':'金币不足 · 未扣费', 'already-unlocked':'武器已解锁 · 未重复扣费', 'invalid-buy':'无效武器购买 · 未扣费'};
    if (state.lastAction.reason === 'sell') {
      const sold = state.terminalFish.findLast(fish => fish.state === 'sold');
      this.shopStatus.textContent = sold ? `已出售 ${FISH_SPECIES[sold.species].name} · +${sold.price} 金币` : '';
    } else if (state.lastAction.reason === 'buy') {
      const bought = state.events.findLast(event => event.type === 'buy');
      const id = WEAPON_IDS.find(id => id === bought?.entityId);
      this.shopStatus.textContent = id ? `已购买${WEAPONS[id].name} · -${WEAPONS[id].price} 金币 · 按 ${this.key(`slot${WEAPON_IDS.indexOf(id) + 2}` as BindingAction)} 在快捷栏选择` : '';
    } else if (errors[state.lastAction.reason]) this.shopStatus.textContent = errors[state.lastAction.reason];
    else if (['reset','restart','openShop'].includes(state.lastAction.reason)) this.shopStatus.textContent = '';
  }

  fatal(message: string): void {
    const element = document.querySelector<HTMLElement>('#fatal')!;
    element.textContent = message; element.hidden = false;
    this.button.disabled = true;
  }
}
