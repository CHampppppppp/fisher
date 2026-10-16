import type { GameState } from '../game/types.ts';
import { FISH_SPECIES } from '../game/fish-species.ts';
import { placementPreview } from '../game/fish-life.ts';
import { makeWorld } from '../game/world.ts';
import { FOOD, INVENTORY_CAPACITY } from '../game/survival.ts';
import { SALE_PRICES, shopAccess } from '../game/shop.ts';
import { WEAPONS, WEAPON_IDS } from '../game/weapons.ts';
import { BINDING_ACTIONS, BINDING_LABELS, keyLabel } from '../game/settings.ts';
import type { BindingAction } from '../game/settings.ts';

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
  readonly modeButton: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
  readonly restartButton: HTMLButtonElement;
  readonly placeButton: HTMLButtonElement;
  readonly inventoryButton: HTMLButtonElement;
  readonly closeInventoryButton: HTMLButtonElement;
  readonly eatButton: HTMLButtonElement;
  readonly pauseInventoryButton: HTMLButtonElement;
  readonly shopButton: HTMLButtonElement;
  readonly closeShopButton: HTMLButtonElement;
  readonly sellButton: HTMLButtonElement;
  readonly weaponBar: HTMLElement;
  readonly inventoryWeapons: HTMLElement;
  readonly purchaseList: HTMLElement;
  selectedFishId: string | null = null;
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
  private inventoryOverlay: HTMLElement;
  private inventoryList: HTMLElement;
  private inventoryCount: HTMLElement;
  private inventoryVitals: HTMLElement;
  private inventoryStatus: HTMLElement;
  private foodDetail: HTMLElement;
  private survivalWarning: HTMLElement;
  private interactionFeedback: HTMLElement;
  private inventorySignature = '';
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
  private hintTemplates: [HTMLElement,string][] = [];

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <p id="playtest-banner" hidden>Boss专项试玩 · 预置装备，不代表完整流程通关</p>
      <canvas id="world" aria-label="第一人称海岛游戏场景"></canvas>
      <header class="identity"><span class="brand">潮生<span class="brand-dot">.</span></span><span class="edition">ISLAND / 12</span></header>
      <p id="rare-progress" role="status">金鳞捕获 0 / 3</p>
      <section id="boss-hud" aria-label="章鱼Boss状态" hidden><div class="boss-heading"><strong>北岸章鱼</strong><span id="boss-phase">第一阶段</span><strong id="boss-hp">600 / 600</strong></div><div class="boss-bar"><span id="boss-hp-fill"></span></div><p id="boss-attack-status" role="status"></p></section>
      <div id="damage-flash" aria-hidden="true" hidden></div>
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
        <div id="reel-meters" hidden>
          <div class="reel-meter"><span>张力</span><strong id="tension-value">40.0</strong><span class="meter-track"><span id="tension-fill"></span></span></div>
          <div class="reel-meter"><span>收杆进度</span><strong id="progress-value">0.0</strong><span class="meter-track"><span id="progress-fill"></span></span></div>
        </div>
        <p id="fishing-help">按住左键蓄力，松开抛竿</p>
      </div>
      <div id="fishing-actions">
        <button id="mode-button" type="button">钓鱼模式 <kbd>Q</kbd></button>
        <button id="cancel-fishing" type="button" hidden>取消钓鱼 <kbd>R</kbd></button>
        <button id="place-fish" type="button" hidden>放下活鱼 <kbd>E</kbd></button>
        <button id="restart-button" type="button" hidden>重新开始</button>
        <button id="inventory-button" type="button">背包 <kbd>Tab</kbd></button>
        <button id="shop-button" type="button" hidden>海风商店 <kbd>E</kbd></button>
      </div>
      <p id="pointer-hint" hidden>鼠标已释放 · 点击场景继续观察</p>
      <p id="live-fish-status" hidden aria-live="polite"></p>
      <p id="fish-notice" hidden role="status"></p>
      <p id="interaction-feedback" hidden role="status"></p>
      <p id="survival-warning" hidden role="status">饥饿过低 · 生命每秒减少 2 · Tab 打开背包食用</p>
      <p id="shop-hint" hidden role="status">柜台就在眼前 · 按 E 出售 / 购买武器</p>
      <nav id="weapon-bar" aria-label="武器快捷栏">${this.weaponButtons()}</nav>
      <p id="weapon-feedback" role="status" aria-live="polite"></p>
      <div class="location"><span class="location-dot"></span>无名岛 <span class="location-divider">/</span> 第一天</div>
      <div id="controls"><span><kbd>W A S D</kbd> 移动</span><span><kbd>SPACE</kbd> 跳跃</span><span><kbd>SHIFT</kbd> 冲刺</span><span><kbd>E</kbd> 交互</span><span><kbd>TAB</kbd> 背包</span><span><kbd>ESC</kbd> 暂停</span></div>
      <section id="menu" aria-labelledby="menu-title">
        <div class="menu-content">
          <p class="eyebrow">A LITTLE ISLAND. A NEW BEGINNING.</p>
          <h1 id="menu-title">潮起，<br>从这里出发。</h1>
          <p id="menu-description">脚下是沙，眼前是海。<br>沿着岸边走走，找到海风补给站。</p>
          <dl id="victory-stats" hidden></dl>
          <button id="play-button" type="button">开始探索 <span aria-hidden="true">↗</span></button>
          <button id="pause-inventory" type="button" hidden>打开背包</button>
          <button id="settings-button" type="button">设置与键位</button><button id="pause-restart" type="button" hidden>重新开始新局</button>
          ${this.storageTools()}
          <p id="playtest-entry"><a href="?playtest=boss">Boss 专项试玩</a></p>
          <p class="lock-help">点击后锁定鼠标 · 移动鼠标观察 · Esc 释放鼠标</p>
          <p id="menu-message" role="status" aria-live="polite"></p>
        </div>
        <span class="chapter">第一章 <span>海岛初见</span></span>
      </section>
      <section id="settings-menu" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
        <div class="settings-panel">
          <div class="inventory-heading"><h2 id="settings-title">设置与键位</h2><span>本地自动保留</span></div>
          <p class="inventory-help">时间已冻结 · 关闭后仍暂停 · 与游戏存档独立</p>
          <label class="setting-range" for="volume-input"><span>音量 <output id="volume-output" for="volume-input">100%</output></span><input id="volume-input" type="range" min="0" max="100" step="any" value="100"><small>0% 完全静音</small></label>
          <label class="setting-range" for="sensitivity-input"><span>鼠标灵敏度 <output id="sensitivity-output" for="sensitivity-input">1.00 倍</output></span><input id="sensitivity-input" type="range" min="0.25" max="3" step="any" value="1"><small>0.25–3 倍 · 数值越大转向越快</small></label>
          <h3>动作键位</h3><p class="settings-help">选择按键按钮后按新键；Esc 取消绑定并保留暂停。重复按键拒绝，Tab 可导航控件。</p>
          <div id="settings-bindings">${BINDING_ACTIONS.map(action=>`<div class="binding-row"><span>${BINDING_LABELS[action]}</span><button type="button" data-binding-action="${action}"></button></div>`).join('')}</div>
          <p id="settings-status" role="status" aria-live="polite">修改后自动保留，关闭设置后点击继续。</p>
          <button id="close-settings" type="button">关闭设置</button>
        </div>
      </section>
      <section id="shop-menu" role="dialog" aria-modal="true" aria-labelledby="shop-title" hidden>
        <div class="inventory-panel shop-panel">
          <div class="inventory-heading"><h2 id="shop-title">海风补给</h2><span id="shop-balance">金币 0</span></div>
          <p class="inventory-help">时间已冻结 · 尸体只能出售一次 · 购买武器本局永久解锁</p>
          <p id="shop-vitals"></p>
          <div class="shop-columns"><section aria-labelledby="sale-title"><h3 id="sale-title">出售鱼尸体</h3>
          <div id="shop-list" aria-label="可出售尸体"></div>
          <p id="shop-detail">选择一条鱼查看售价。</p>
          </section><section aria-labelledby="purchase-title"><h3 id="purchase-title">购买武器</h3><div id="purchase-list">
          ${WEAPON_IDS.filter(id => id !== 'fist').map(id => `<div class="weapon-offer"><strong>${WEAPONS[id].name} <span>${WEAPONS[id].price} 金币</span></strong><p>伤害 ${WEAPONS[id].damage} · 射程 ${WEAPONS[id].range} m<br>冷却 ${WEAPONS[id].cooldownTicks / 60} s · 击退 ${WEAPONS[id].knockback} m</p><button class="buy-weapon" data-weapon-id="${id}" type="button">购买${WEAPONS[id].name}</button></div>`).join('')}
          </div><p class="inventory-help">购买后按 1–4 或在背包装备<br>切换装备不会清除攻击冷却</p></section></div>
          <p id="shop-status" role="status" aria-live="polite"></p>
          <div class="inventory-actions"><button id="sell-button" type="button" disabled>出售所选鱼</button><button id="close-shop" type="button">关闭商店并继续</button></div>
          ${this.storageTools()}
          <p class="inventory-help">Tab 也可关闭 · 清除按住输入 · 期间失焦后仍需点击继续探索</p>
        </div>
      </section>
      <section id="inventory-menu" role="dialog" aria-modal="true" aria-labelledby="inventory-title" hidden>
        <div class="inventory-panel">
          <div class="inventory-heading"><h2 id="inventory-title">尸体背包</h2><span id="inventory-count">0 / 10</span></div>
          <p class="inventory-help">时间已冻结 · 每条鱼占一格 · 食用只恢复饥饿</p>
          <p id="inventory-vitals"></p>
          <h3>装备武器</h3><div id="inventory-weapons" aria-label="背包装备">${this.weaponButtons()}</div>
          <div id="inventory-list" aria-label="背包物品"></div>
          <p id="food-detail">选择一条鱼查看恢复值。</p>
          <p id="inventory-status" role="status" aria-live="polite"></p>
          <div class="inventory-actions"><button id="eat-button" type="button" disabled>食用所选鱼</button><button id="close-inventory" type="button">关闭背包</button></div>
          ${this.storageTools()}
          <p class="inventory-help">关闭后清除按住输入 · 若已暂停或失焦，请点击继续探索</p>
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
    this.modeButton = root.querySelector<HTMLButtonElement>('#mode-button')!;
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
    this.inventoryButton = root.querySelector<HTMLButtonElement>('#inventory-button')!;
    this.closeInventoryButton = root.querySelector<HTMLButtonElement>('#close-inventory')!;
    this.eatButton = root.querySelector<HTMLButtonElement>('#eat-button')!;
    this.pauseInventoryButton = root.querySelector<HTMLButtonElement>('#pause-inventory')!;
    this.inventoryOverlay = root.querySelector<HTMLElement>('#inventory-menu')!;
    this.inventoryList = root.querySelector<HTMLElement>('#inventory-list')!;
    this.inventoryCount = root.querySelector<HTMLElement>('#inventory-count')!;
    this.inventoryVitals = root.querySelector<HTMLElement>('#inventory-vitals')!;
    this.inventoryStatus = root.querySelector<HTMLElement>('#inventory-status')!;
    this.foodDetail = root.querySelector<HTMLElement>('#food-detail')!;
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
    this.inventoryWeapons = root.querySelector<HTMLElement>('#inventory-weapons')!;
    this.purchaseList = root.querySelector<HTMLElement>('#purchase-list')!;
    this.hintTemplates = Array.from(root.querySelectorAll<HTMLElement>('.inventory-help')).map(element=>[element,element.innerHTML]);
  }

  private weaponButtons(): string {
    return WEAPON_IDS.map((id, index) => `<button type="button" class="equip-weapon" data-weapon-id="${id}" aria-pressed="false"><kbd>${index + 1}</kbd> ${WEAPONS[id].name}</button>`).join('');
  }

  private storageTools(): string {
    return `<section class="storage-tools" aria-label="本地存档"><div><button type="button" data-storage-action="save">保存进度</button><button type="button" data-storage-action="load">读取存档</button></div><p class="storage-status" role="status" aria-live="polite">单槽本地存档 · 读取后暂停 · Esc 打开保存菜单</p></section>`;
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
      this.inventorySignature = ''; this.shopSignature = '';
      document.querySelector('#controls')!.innerHTML = `<span><kbd>${(['forward','left','backward','right'] as const).map(action=>this.key(action)).join(' ')}</kbd> 移动</span><span><kbd>${this.key('jump')}</kbd> 跳跃</span><span><kbd>${this.key('sprint')}</kbd> 冲刺</span><span><kbd>${this.key('interact')}</kbd> 交互</span><span><kbd>${this.key('inventory')}</kbd> 背包</span><span><kbd>ESC</kbd> 暂停</span>`;
      for (const [element,original] of this.hintTemplates) element.innerHTML = original.replace(/\bTab\b/g,this.key('inventory')).replace(/\bE\b/g,this.key('interact')).replace('1–4',(['weapon1','weapon2','weapon3','weapon4'] as const).map(action=>this.key(action)).join('/'));
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
    document.querySelector('#menu-title')!.textContent = '在这里，歇一会。';
    document.querySelector('#menu-description')!.innerHTML = '海风还在，时间已停。<br>准备好后，继续探索这座岛。';
    this.button.innerHTML = '继续探索 <span aria-hidden="true">↗</span>';
    this.overlay.classList.add('pause-menu');
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
    this.inventoryOverlay.hidden = state.ui.menu !== 'inventory';
    this.shopOverlay.hidden = state.ui.menu !== 'shop';
    const access = shopAccess(state.player);
    this.shopButton.hidden = !access.valid; this.shopHint.hidden = !access.valid || paused;
    this.pauseRestartButton.hidden = !this.started || dead || victory;
    this.pauseInventoryButton.hidden = !this.started || state.ui.menu !== 'pause';
    this.inventoryButton.innerHTML = `背包 ${state.inventory.length} / 10 <kbd>${this.key('inventory')}</kbd>`;
    if (this.started) {
      document.querySelector('#menu-title')!.textContent = victory ? '北岸，平静了。' : dead ? '这次，止步于此。' : '在这里，歇一会。';
      document.querySelector('#menu-description')!.textContent = victory ? '通关成功 · 章鱼已被击败。海岛重新安静下来，这次探索到此完成。' : dead ? state.deathReason==='boss' ? '生命耗尽。章鱼的攻击终结了这次探索。重新开始，留意地面预警与墨汁方向。' : '生命耗尽。饥饿低于 20 时会持续失去生命。重新开始，再次探索海岛。' : '海风还在，时间已停。准备好后，继续探索这座岛。';
      this.button.textContent = dead || victory ? '重新开始' : '继续探索';
      document.querySelector('.lock-help')!.textContent = dead || victory ? '确认重新开始后重置本局进度，并锁定鼠标' : '点击后锁定鼠标 · 移动鼠标观察 · Esc 释放鼠标';
    }
    if (this.bossPlaytest) {
      document.querySelector('#menu-title')!.textContent = victory ? '试玩完成' : dead ? '挑战失败' : 'Boss 专项试玩';
      document.querySelector('#menu-description')!.textContent = `预置满生命与饥饿，解锁全部武器，默认重锤。${['weapon1','weapon2','weapon3','weapon4'].map(action => this.key(action as BindingAction)).join(' / ')} 切换武器，左键攻击，${['forward','left','backward','right'].map(action => this.key(action as BindingAction)).join(' / ')} 移动躲避预警。此入口不读写存档，不能作为完整流程通关证据。`;
      this.button.textContent = dead || victory ? '再次挑战' : this.started ? '继续挑战' : '开始挑战';
      this.pauseRestartButton.textContent = '重新挑战 Boss';
    }
    document.body.classList.toggle('is-paused', paused);
    this.hp.textContent = String(Number(state.player.hp.toFixed(1)));
    this.hunger.textContent = String(Number(state.player.hunger.toFixed(1)));
    document.querySelector<HTMLElement>('.vital .bar>span')!.style.width = `${state.player.hp}%`;
    document.querySelector<HTMLElement>('.hunger .bar>span')!.style.width = `${state.player.hunger}%`;
    this.survivalWarning.textContent = `饥饿过低 · 生命每秒减少 2 · ${this.key('inventory')} 打开背包食用`;
    this.survivalWarning.hidden = state.player.hunger >= 20 || dead || victory;
    document.body.classList.toggle('low-hunger', state.player.hunger < 20);
    this.updateInventory(state);
    this.updateShop(state);
    this.updateWeapons(state);
    this.updateBoss(state);
    const notices: Record<string,string> = { 'inventory-full':'背包已满（10 / 10）· 尸体仍在岸上', 'pickup-corpse':`已拾取尸体 · ${this.key('inventory')} 打开背包`, 'no-corpse-in-range':'2 米内没有尸体 · 商店需走到正面柜台', 'place-fish':'已放下活鱼', 'shop-too-far':'柜台距离超过 2 米，请走到商店正面', 'shop-obstructed':'柜台被墙挡住，请绕到商店正面' };
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
    this.modeButton.innerHTML = `${mode === 'fishing' ? '钓鱼模式' : '战斗模式'} <kbd>${this.key('toggleMode')}</kbd>`;
    this.modeButton.setAttribute('aria-label', mode === 'fishing' ? '切换到战斗模式' : '切换到钓鱼模式');
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
    this.attackFeedback.hidden = mode !== 'combat';
    const weapon = WEAPONS[state.currentWeapon]; const usedWeapon = WEAPONS[state.attack.weaponId];
    const feedback = attacking && state.attack.result !== 'none' ? state.attack.result === 'kill' ? `${usedWeapon.name}击杀 · ${state.attack.targetKind==='boss'?'章鱼已败':'鱼已死亡'}` : state.attack.result === 'hit' ? `${usedWeapon.name}命中${state.attack.targetKind==='boss'?'章鱼':''} · 伤害 ${usedWeapon.damage}` : `${usedWeapon.name}挥空` : state.attackCooldownRemaining > 0 ? `${weapon.name} · 攻击恢复中` : `${weapon.name}已就绪`;
    this.attackFeedback.textContent = `${feedback} · ${state.attackCooldownRemaining > 0 ? `冷却 ${state.attackCooldownRemaining.toFixed(2)} s` : '点击左键攻击'}`;
    const escaped = state.terminalFish.findLast(fish => fish.state === 'escaped');
    this.fishNotice.hidden = !escaped || state.simulationTick - escaped.escapedTick > 360;
    this.fishNotice.textContent = escaped ? `${FISH_SPECIES[escaped.species].name}逃入海中` : '';
    this.castDistance.hidden = mode !== 'fishing' || carrying;
    this.chargeTrack.hidden = mode !== 'fishing' || carrying || reeling || fishing.phase === 'bite';
    this.reelMeters.hidden = !reeling;
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
      this.fishingHelp.textContent = `持鱼时不能抛竿 · ${this.key('interact')} 放鱼 · ${this.key('inventory')} 背包`;
    } else if (fishing.phase === 'bite') {
      this.fishingStatus.textContent = '咬钩了！点击左键提杆'; this.fishingHelp.textContent = paused ? '计时已冻结 · 点击继续后再提杆' : '抓住浮漂下沉的瞬间';
    } else if (reeling) {
      this.fishingStatus.textContent = fishing.struggling ? `${definition!.name}正在挣扎` : `收杆中 · ${definition!.name}`;
      this.fishingHelp.textContent = paused ? '计时已冻结 · 继续后重新按住左键' : '按住左键拉近 · 松开降低张力 · 避免满张力或零张力';
    } else if (mode === 'combat') {
      this.fishingStatus.textContent = `${weapon.name} · 战斗模式`; this.fishingHelp.textContent = `伤害 ${weapon.damage} · 射程 ${weapon.range} m · 单次点击攻击 · ${['weapon1','weapon2','weapon3','weapon4'].map(action=>this.key(action as BindingAction)).join('/')} 换武器 · ${this.key('toggleMode')} 钓鱼`;
    } else if (fishing.phase === 'waiting') {
      this.fishingStatus.textContent = '等待中 · 浮漂已入水';
      this.fishingHelp.textContent = `看住浮漂 · 咬钩时点击左键提杆 · ${this.key('cancelFishing')} 取消`;
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
    document.querySelector('#boss-attack-status')!.textContent=boss.state==='defeated'?'战斗结束':warnings.length?warnings.join(' / '):`触手 ${boss.tentacleRemaining.toFixed(2)} s${boss.phase===2?` · 墨汁 ${boss.inkRemaining.toFixed(2)} s`:''}`;
    const damage=state.events.findLast(event=>event.type==='player_damage');
    document.querySelector<HTMLElement>('#damage-flash')!.hidden=!damage || state.simulationTick-damage.tick>=9 || state.gamePhase==='victory';
    const statistics=document.querySelector<HTMLElement>('#victory-stats')!;statistics.hidden=state.gamePhase!=='victory';
    if(!statistics.hidden) statistics.innerHTML=`<div><dt>探索时间</dt><dd>${(state.simulationTick/60).toFixed(1)} 秒</dd></div><div><dt>本次捕获 / 累计金鳞</dt><dd>${state.stats.caught} / ${state.rareCaughtCount}</dd></div><div><dt>鱼击杀 / 出售</dt><dd>${state.stats.killed} / ${state.stats.sold}</dd></div><div><dt>赚取 / 当前金币</dt><dd>${state.stats.coinsEarned} / ${state.coins}</dd></div>`;
  }

  private updateWeapons(state: GameState): void {
    this.weaponBar.hidden = state.gamePhase !== 'running';
    for (const container of [this.weaponBar, this.inventoryWeapons]) {
      for (const button of container.querySelectorAll<HTMLButtonElement>('.equip-weapon')) {
        const id = WEAPON_IDS.find(id => id === button.dataset.weaponId)!;
        const unlocked = state.unlockedWeapons.includes(id);
        button.disabled = !unlocked; button.setAttribute('aria-pressed', String(state.currentWeapon === id));
        button.querySelector('kbd')!.textContent = this.key(`weapon${WEAPON_IDS.indexOf(id)+1}` as BindingAction);
        button.title = unlocked ? `装备${WEAPONS[id].name} · 伤害 ${WEAPONS[id].damage} · 射程 ${WEAPONS[id].range} m` : `未解锁 · 商店 ${WEAPONS[id].price} 金币`;
      }
    }
    for (const button of this.purchaseList.querySelectorAll<HTMLButtonElement>('.buy-weapon')) {
      const id = WEAPON_IDS.find(id => id === button.dataset.weaponId)!;
      const unlocked = state.unlockedWeapons.includes(id); button.disabled = unlocked;
      button.textContent = unlocked ? `${WEAPONS[id].name}已解锁` : `购买${WEAPONS[id].name} · ${WEAPONS[id].price} 金币`;
    }
    const element = document.querySelector<HTMLElement>('#weapon-feedback')!;
    element.hidden = state.gamePhase !== 'running';
    if (state.lastAction.reason === 'weapon-locked') element.textContent = '武器未解锁 · 请到商店购买';
    else element.textContent = `已装备${WEAPONS[state.currentWeapon].name} · ${state.mode === 'fishing' ? `${this.key('toggleMode')} 进入战斗` : '单次点击左键攻击'}`;
  }

  private updateShop(state: GameState): void {
    this.shopBalance.textContent = `金币 ${state.coins}`;
    this.shopVitals.textContent = `生命 ${Number(state.player.hp.toFixed(1))} / 100　饥饿 ${Number(state.player.hunger.toFixed(1))} / 100`;
    const signature = JSON.stringify(state.inventory);
    if (signature !== this.shopSignature) {
      this.shopSignature = signature; this.shopList.replaceChildren();
      if (!state.inventory.some(item => item.id === this.selectedShopFishId)) this.selectedShopFishId = null;
      if (!state.inventory.length) this.shopList.textContent = `背包为空，没有可出售尸体。先击杀岸上活鱼，再走近按 ${this.key('interact')} 拾取。`;
      for (const item of state.inventory) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'shop-item'; button.dataset.fishId = item.id;
        button.textContent = `${FISH_SPECIES[item.species].name} · ${SALE_PRICES[item.species]} 金币 · ${item.id}`;
        button.addEventListener('click', () => { this.selectedShopFishId = item.id; this.updateShop(this.currentState!); });
        this.shopList.append(button);
      }
    }
    for (const button of this.shopList.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.fishId === this.selectedShopFishId));
    const selected = state.inventory.find(item => item.id === this.selectedShopFishId);
    this.sellButton.disabled = !selected;
    this.shopDetail.textContent = selected ? `${FISH_SPECIES[selected.species].name}：出售获得 ${SALE_PRICES[selected.species]} 金币。售出后不能再食用。` : state.inventory.length ? '选择一条鱼查看售价。' : '没有可出售的物品。';
    const errors: Record<string,string> = {'not-in-inventory':'物品已消费或不在背包中 · 未增加金币', 'invalid-sell':'请选择有效背包尸体 · 未增加金币', 'shop-not-open':'请先打开商店', 'coin-limit':'金币无法精确交易 · 保留物品和解锁状态', 'insufficient-coins':'金币不足 · 未扣费', 'already-unlocked':'武器已解锁 · 未重复扣费', 'invalid-buy':'无效武器购买 · 未扣费'};
    if (state.lastAction.reason === 'sell') {
      const sold = state.terminalFish.findLast(fish => fish.state === 'sold');
      this.shopStatus.textContent = sold ? `已出售 ${FISH_SPECIES[sold.species].name} · +${sold.price} 金币` : '';
    } else if (state.lastAction.reason === 'buy') {
      const bought = state.events.findLast(event => event.type === 'buy');
      const id = WEAPON_IDS.find(id => id === bought?.entityId);
      this.shopStatus.textContent = id ? `已购买${WEAPONS[id].name} · -${WEAPONS[id].price} 金币 · 按 ${this.key(`weapon${WEAPON_IDS.indexOf(id) + 1}` as BindingAction)} 或在背包装备` : '';
    } else if (errors[state.lastAction.reason]) this.shopStatus.textContent = errors[state.lastAction.reason];
    else if (['reset','restart','openShop'].includes(state.lastAction.reason)) this.shopStatus.textContent = '';
  }

  private updateInventory(state: GameState): void {
    this.inventoryCount.textContent = `${state.inventory.length} / ${INVENTORY_CAPACITY}`;
    this.inventoryVitals.textContent = `生命 ${Number(state.player.hp.toFixed(1))} / 100　饥饿 ${Number(state.player.hunger.toFixed(1))} / 100`;
    const signature = JSON.stringify(state.inventory);
    if (signature !== this.inventorySignature) {
      this.inventorySignature = signature; this.inventoryList.replaceChildren();
      if (!state.inventory.some(item => item.id === this.selectedFishId)) this.selectedFishId = null;
      if (!state.inventory.length) this.inventoryList.textContent = `背包为空。击杀岸上活鱼后，走近尸体按 ${this.key('interact')} 拾取。`;
      for (const item of state.inventory) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'inventory-item'; button.dataset.fishId = item.id;
        button.textContent = `${FISH_SPECIES[item.species].name} · +${FOOD[item.species]} 饥饿 · ${item.id}`;
        button.addEventListener('click', () => { this.selectedFishId = item.id; this.updateInventory(this.currentState!); });
        this.inventoryList.append(button);
      }
    }
    for (const button of this.inventoryList.querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.fishId === this.selectedFishId));
    const selected = state.inventory.find(item => item.id === this.selectedFishId);
    this.eatButton.disabled = !selected;
    this.foodDetail.textContent = selected ? `${FISH_SPECIES[selected.species].name}：恢复 ${FOOD[selected.species]} 饥饿，不恢复生命。` : '选择一条鱼查看恢复值。';
    const results: Record<string,string> = { eat:'已食用 · 物品消耗一次，生命不变', 'hunger-full':'饥饿已满 · 未消耗物品', 'not-in-inventory':'物品已消耗或不在背包中', 'invalid-eat':'食用操作无效' };
    if (results[state.lastAction.reason]) this.inventoryStatus.textContent = results[state.lastAction.reason];
    else if (['reset','restart','openInventory'].includes(state.lastAction.reason)) this.inventoryStatus.textContent = '';
  }

  fatal(message: string): void {
    const element = document.querySelector<HTMLElement>('#fatal')!;
    element.textContent = message; element.hidden = false;
    this.button.disabled = true;
  }
}
