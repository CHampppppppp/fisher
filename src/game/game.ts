import { PHYSICS, STEP } from './types.ts';
import type { GameState, Position, FishingState, Fish } from './types.ts';
import { canOccupy, makeWorld, moveHorizontal, SHOP, landAtCenter } from './world.ts';
import type { World } from './world.ts';
import { castPreview, floatPitch, limitedLook, idleFishing, carriedPosition } from './fishing.ts';
import { createReel, stepReel, isStruggling } from './reeling.ts';
import { sampleFish, FISH_SPECIES } from './fish-species.ts';
import type { FishSpecies } from './fish-species.ts';
import { createLiveFish, fishClearOfShop, placementPreview, stepLiveFish } from './fish-life.ts';
import { attackTarget, attackFish, targetDistance } from './combat.ts';
import { BOSS, BossSimulation, bossInitial } from './boss.ts';
import { WEAPONS, isWeaponId } from './weapons.ts';
import type { WeaponId } from './weapons.ts';
import { FOOD, INVENTORY_CAPACITY, Survival, pickupTarget } from './survival.ts';
import type { InventoryFish } from './types.ts';
import { validateSave, SAVE_VERSION } from './save-format.ts';
import type { SaveFile, SavedState } from './save-format.ts';
import { defaultSettings, updateSettings, SettingsError } from './settings.ts';
import type { Settings } from './settings.ts';
import { SALE_PRICES, shopAccess } from './shop.ts';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}
function position(value: unknown): value is Position {
  return record(value) && onlyKeys(value, ['x', 'y', 'z']) && finite(value.x) && finite(value.y) && finite(value.z);
}
function direction(value: unknown): value is -1 | 0 | 1 { return value === -1 || value === 0 || value === 1; }

export class Game {
  private state: GameState;
  private world: World;
  private velocityY = 0;
  private input = { forward: 0, strafe: 0, sprint: false };
  private chargeTicks = 0;
  private nextCastId = 1;
  private nextFishId = 1;
  private reservedFishIds = new Set<string>();
  private nextEventSequence = 1;
  private initialFishRngState = 1;
  private waitingTicks = 0;
  private biteTicks = 0;
  private chargeHeld = false;
  private reel = createReel();
  private attackCooldownTicks = 0;
  private survival = new Survival();
  private bossSimulation: BossSimulation;
  private pendingBossHit: { damage:number; weaponId:WeaponId } | null = null;
  private menuReturnPhase: 'running' | 'paused' = 'running';
  private preferences = defaultSettings();
  private settingsWriter?: (value: Settings) => void;
  private settingsReturnPhase: 'paused' | 'dead' | 'victory' = 'paused';
  private settingsBasePhase: GameState['gamePhase'] = 'paused';

  constructor(private readonly bossPlaytest = false) {
    this.world = makeWorld('island');
    this.state = this.newState('island', 0, { x: 4, y: 1, z: -7 }, -0.3, 0);
    this.bossSimulation = new BossSimulation(this.world); this.state.boss = this.bossSimulation.state;
    this.state.gamePhase = 'paused'; this.state.ui.menu = 'pause';
    if (bossPlaytest) this.prepareBossPlaytest();
  }

  private prepareBossPlaytest(): void {
    this.reset({ seed: 1, fixture: 'boss-arena', initial: {
      unlockedWeapons: ['fist', 'club', 'spear', 'hammer'], currentWeapon: 'hammer',
    } });
    this.state.mode = 'combat';
    this.state.gamePhase = 'paused'; this.state.ui.menu = 'pause';
  }

  private newState(fixture: GameState['fixture'], seed: number, p: Position, yaw: number, pitch: number, fishRngState = seed || 1): GameState {
    return {
      simulationTick: 0, gamePhase: 'running', ui: { menu: 'none' }, seed: seed || 1, fixture, fishRngState,
      settings: structuredClone(this.preferences),
      deathReason: null,
      player: { position: { ...p }, yaw, pitch, hp: 100, hunger: 100 }, coins: 0,
      unlockedWeapons: ['fist'], currentWeapon: 'fist',
      rareCaughtCount:0,boss:new BossSimulation(makeWorld(fixture)).state,stats:{caught:0,killed:0,sold:0,coinsEarned:0,bossDamageDealt:0},
      mode: 'fishing',
      fishing: idleFishing(castPreview(makeWorld(fixture), { position: p, yaw, pitch, hp: 100, hunger: 100 }, 0)),
      fish: [], terminalFish: [], inventory: [], consumedFish: [], events: [],
      attackCooldownRemaining: 0, attack: { sequence: 0, elapsed: .45, weaponId: 'fist', targetKind:null, hitId: null, result: 'none' },
      lastAction: { accepted: true, reason: 'reset' },
    };
  }

  getState(): GameState { return structuredClone(this.state); }
  getWorld(): World { return structuredClone(this.world); }

  installSettings(value: Settings, write?: (value: Settings) => void): void {
    this.preferences = updateSettings(defaultSettings(), value);
    this.state.settings = structuredClone(this.preferences); this.settingsWriter = write;
  }

  exportSave(): SaveFile {
    if (this.state.fishing.phase !== 'idle') throw new Error('请先完成或取消钓鱼，再保存进度');
    if (this.pendingBossHit || this.state.attack.elapsed < WEAPONS[this.state.attack.weaponId].animationSeconds - 1e-9)
      throw new Error('攻击动作尚未结束，请结束动作后保存');
    const { simulationTick, gamePhase, deathReason, player, coins, unlockedWeapons, currentWeapon, rareCaughtCount,
      boss, stats, seed, fishRngState, fixture, mode, fish, terminalFish, inventory, consumedFish, attackCooldownRemaining, attack } = this.state;
    const state: SavedState = { simulationTick, gamePhase: this.state.ui.menu === 'settings' ? this.settingsBasePhase : ['inventory','shop'].includes(this.state.ui.menu) ? this.menuReturnPhase : gamePhase,
      deathReason, player, coins, unlockedWeapons, currentWeapon, rareCaughtCount, boss, stats, seed, fishRngState,
      fixture, mode, fish, terminalFish, inventory, consumedFish, attackCooldownRemaining, attack };
    return validateSave({ version: SAVE_VERSION, state, runtime: { velocityY: this.velocityY,
      initialFishRngState: this.initialFishRngState, nextFishId: this.nextFishId, nextCastId: this.nextCastId,
      nextEventSequence: this.nextEventSequence, reservedFishIds: [...this.reservedFishIds], attackCooldownTicks: this.attackCooldownTicks,
      survival: this.survival.snapshot(), boss: this.bossSimulation.snapshot() } });
  }

  importSave(value: unknown): void {
    const save = validateSave(value);
    const saved = save.state; const runtime = save.runtime;
    const world = makeWorld(saved.fixture);
    const boss = BossSimulation.restore(world, saved.boss, runtime.boss);
    const survival = Survival.restore(runtime.survival);
    const next = this.newState(saved.fixture, saved.seed, saved.player.position, saved.player.yaw, saved.player.pitch, saved.fishRngState);
    Object.assign(next, saved);
    next.boss = boss.state;
    next.gamePhase = saved.gamePhase === 'dead' || saved.gamePhase === 'victory' ? saved.gamePhase : 'paused';
    next.ui.menu = next.gamePhase === 'paused' ? 'pause' : next.gamePhase;
    next.events = []; next.lastAction = { accepted: true, reason: 'loaded' };
    // Only fully validated, fully constructed data reach the production state.
    this.world = world; this.state = next; this.bossSimulation = boss; this.survival = survival;
    this.velocityY = runtime.velocityY; this.initialFishRngState = runtime.initialFishRngState;
    this.nextFishId = runtime.nextFishId; this.nextCastId = runtime.nextCastId; this.nextEventSequence = runtime.nextEventSequence;
    this.reservedFishIds = new Set(runtime.reservedFishIds); this.attackCooldownTicks = runtime.attackCooldownTicks;
    this.pendingBossHit = null; this.chargeTicks = 0; this.waitingTicks = 0; this.biteTicks = 0;
    this.reel = createReel(); this.menuReturnPhase = 'paused'; this.clearInput();
  }

  persistenceResult(accepted: boolean, reason: string): GameState['lastAction'] {
    this.state.lastAction = { accepted, reason }; return { ...this.state.lastAction };
  }

  reset(options: unknown, freshSession = false): void {
    if (!record(options) || !onlyKeys(options, ['seed', 'fixture', 'initial']) ||
      !finite(options.seed) || !Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff ||
      (options.fixture !== 'shore' && options.fixture !== 'fish-arena' && options.fixture!=='boss-arena')) throw new TypeError('reset requires uint32 seed and fixture: shore, fish-arena or boss-arena');
    const fixture = options.fixture;
    const arena = fixture === 'fish-arena';
    let p = { x: 0, y: 1, z: arena ? 3.5 : fixture==='boss-arena'?8.5:0 }; let yaw = 0; let pitch = arena ? -.6 : 0;
    let initialFish: unknown = arena ? [{ id: 'fixture-fish-1', species: 'sprat', state: 'groundedAlive', position: { x: 0, y: 1, z: 5 }, jumpTimer: 0 }] : [];
    const seed = options.seed || 1; let fishRngState = seed;
    let hp = 100; let hunger = 100; let coins = 0; let initialInventory: unknown = [];
    let unlockedWeapons: WeaponId[] = ['fist']; let currentWeapon: WeaponId = 'fist';
    let rareCaughtCount=fixture==='boss-arena'?3:0;let initialBoss:unknown=undefined;
    if (options.initial !== undefined) {
      const initial = options.initial;
      if (!record(initial) || !onlyKeys(initial, ['player', 'fishRngState', 'fish', 'inventory', 'coins', 'unlockedWeapons', 'currentWeapon','rareCaughtCount','boss'])) throw new TypeError('Invalid initial state');
      if(initial.rareCaughtCount!==undefined) {
        if(!finite(initial.rareCaughtCount)||!Number.isSafeInteger(initial.rareCaughtCount)||initial.rareCaughtCount<0) throw new RangeError('rareCaughtCount must be a nonnegative safe integer');
        rareCaughtCount=initial.rareCaughtCount;
      }
      initialBoss=initial.boss;
      if (initial.unlockedWeapons !== undefined) {
        if (!Array.isArray(initial.unlockedWeapons) || !Array.from(initial.unlockedWeapons).every(isWeaponId) || new Set(initial.unlockedWeapons).size !== initial.unlockedWeapons.length)
          throw new TypeError('unlockedWeapons requires unique legal weapon IDs');
        unlockedWeapons = ['fist', ...initial.unlockedWeapons.filter((id: WeaponId) => id !== 'fist')];
      }
      if (initial.currentWeapon !== undefined) {
        if (!isWeaponId(initial.currentWeapon) || !unlockedWeapons.includes(initial.currentWeapon)) throw new TypeError('Current weapon must be unlocked');
        currentWeapon = initial.currentWeapon;
      }
      if (initial.coins !== undefined) {
        if (!finite(initial.coins) || !Number.isInteger(initial.coins) || initial.coins < 0) throw new RangeError('Coins must be a nonnegative integer');
        coins = initial.coins;
      }
      if (initial.inventory !== undefined) initialInventory = initial.inventory;
      if (initial.fish !== undefined) initialFish = initial.fish;
      if (initial.fishRngState !== undefined) {
        if (!finite(initial.fishRngState) || !Number.isInteger(initial.fishRngState) || initial.fishRngState < 1 || initial.fishRngState > 0xffffffff)
          throw new TypeError('fishRngState must be a nonzero uint32');
        fishRngState = initial.fishRngState;
      }
      if (initial.player !== undefined) {
        const player = initial.player;
        if (!record(player) || !onlyKeys(player, ['position', 'yaw', 'pitch', 'hp', 'hunger'])) throw new TypeError('Invalid initial player');
        for (const key of ['hp', 'hunger'] as const) {
          if (player[key] !== undefined && (!finite(player[key]) || player[key] < 0 || player[key] > 100)) throw new RangeError('Invalid player vitals');
        }
        if (player.hp !== undefined) hp = player.hp as number;
        if (player.hunger !== undefined) hunger = player.hunger as number;
        if (player.position !== undefined) {
          if (!position(player.position)) throw new TypeError('Position must have finite x/y/z');
          p = { ...player.position };
        }
        if (player.yaw !== undefined) {
          if (!finite(player.yaw)) throw new TypeError('Yaw must be finite');
          yaw = player.yaw;
        }
        if (player.pitch !== undefined) {
          if (!finite(player.pitch) || Math.abs(player.pitch) > 1.4) throw new TypeError('Pitch must be in [-1.4,1.4]');
          pitch = player.pitch;
        }
      }
    }
    const nextWorld = makeWorld(fixture);
    const nextBoss = new BossSimulation(nextWorld,bossInitial(rareCaughtCount,initialBoss));
    // Spawning over the shop roof is outside this stage's standing surface.
    if (p.y < 1 || !canOccupy(nextWorld, { ...p, y: 1 })) throw new RangeError('Initial position is outside legal land or inside shop');
    if (!Array.isArray(initialFish)) throw new TypeError('initial.fish must be an array');
    const fish: Fish[] = []; const ids = new Set<string>(); let carriedCount = 0;
    for (const item of initialFish) {
      if (!record(item) || !onlyKeys(item, ['id', 'species', 'state', 'position', 'jumpTimer', 'hp']) ||
        typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) ||
        typeof item.species !== 'string' || !Object.hasOwn(FISH_SPECIES, item.species) ||
        (item.state !== 'carried' && item.state !== 'groundedAlive' && item.state !== 'groundedDead') || !position(item.position) || !finite(item.jumpTimer))
        throw new TypeError('Invalid initial fish');
      const species = item.species as FishSpecies;
      const hp = item.hp === undefined ? FISH_SPECIES[species].hp : item.hp;
      if (!finite(hp) || hp < 0 || hp > FISH_SPECIES[species].hp || (item.state === 'groundedDead' ? hp !== 0 : hp <= 0)) throw new RangeError('Invalid fish HP');
      if (item.jumpTimer < 0 || item.jumpTimer > FISH_SPECIES[species].jumpInterval) throw new RangeError('Invalid fish jumpTimer');
      if (item.state === 'carried' && ++carriedCount > 1) throw new RangeError('Only one carried fish is allowed');
      if (item.state !== 'carried' && (item.position.y !== nextWorld.surface || !landAtCenter(nextWorld, item.position) || !fishClearOfShop(item.position)))
        throw new RangeError('Initial ground fish must be on unobstructed land');
      ids.add(item.id); fish.push(createLiveFish({ id: item.id, species, state: item.state, position: item.position, jumpTimer: item.jumpTimer, hp }));
    }
    if (!Array.isArray(initialInventory) || initialInventory.length > INVENTORY_CAPACITY) throw new RangeError('Invalid inventory capacity');
    const inventory: InventoryFish[] = [];
    for (const item of initialInventory) {
      if (!record(item) || !onlyKeys(item, ['id','species']) || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) ||
        typeof item.species !== 'string' || !Object.hasOwn(FISH_SPECIES, item.species)) throw new TypeError('Invalid inventory item');
      ids.add(item.id); inventory.push({id:item.id, species:item.species as FishSpecies, state:'inventoryDead'});
    }
    const nextState = this.newState(fixture, seed, p, yaw, pitch, fishRngState);
    nextState.fish = fish;
    nextState.inventory = inventory; nextState.player.hp = hp; nextState.player.hunger = hunger;
    nextState.coins = coins;
    nextState.unlockedWeapons = unlockedWeapons; nextState.currentWeapon = currentWeapon;
    nextState.rareCaughtCount=rareCaughtCount;nextState.boss=nextBoss.state;
    for (const item of fish) if (item.state === 'carried') item.position = carriedPosition(nextState.player);
    this.initialFishRngState = fishRngState;
    for (const id of ids) this.reservedFishIds.add(id);
    this.world = nextWorld; this.state = nextState; this.velocityY = 0;
    this.bossSimulation=nextBoss;this.pendingBossHit=null;
    this.chargeTicks = 0; this.waitingTicks = 0; this.biteTicks = 0;
    this.nextCastId = 1; this.reel = createReel(); this.clearInput();
    this.attackCooldownTicks = 0;
    this.survival = new Survival(hp, hunger); this.menuReturnPhase = 'running';
    if (hp === 0) this.die();
    else if(nextState.boss.state==='defeated') this.win();
    if (freshSession) {
      this.nextFishId = 1; this.reservedFishIds = new Set(ids);
      this.state.events.forEach((event,index)=>{event.sequence=index+1;}); this.nextEventSequence = this.state.events.length+1;
    }
  }

  clearInput(): void {
    this.input = { forward: 0, strafe: 0, sprint: false };
    this.chargeHeld = false; this.state.fishing.holding = false;
  }

  private cancelFishing(result: FishingState['result'] = 'cancelled', keepTelemetry = false): void {
    const previous = this.state.fishing;
    if (previous.cast && result !== 'landed') this.publish(result === 'cancelled' ? 'cancelled' : 'failed', `cast-${previous.cast.id}`);
    this.clearInput(); this.chargeTicks = 0;
    this.waitingTicks = 0; this.biteTicks = 0;
    this.state.fishing = idleFishing(castPreview(this.world, this.state.player, 0));
    this.state.fishing.result = result;
    if (keepTelemetry) {
      Object.assign(this.state.fishing, {
        progress: previous.progress, tension: previous.tension,
        highTensionDuration: previous.highTensionDuration, lowTensionDuration: previous.lowTensionDuration,
        reelElapsed: previous.reelElapsed,
      });
    }
  }

  private publish(type: string, entityId: string, weaponId?: WeaponId): void {
    this.state.events.push({ tick: this.state.simulationTick, type, entityId, sequence: this.nextEventSequence++, ...(weaponId ? {weaponId} : {}) });
    if (this.state.events.length > 200) this.state.events.splice(0, this.state.events.length - 200);
  }

  private syncCarriedFish(): void {
    for (const fish of this.state.fish) if (fish.state === 'carried') fish.position = carriedPosition(this.state.player);
  }

  private stepFishLife(): void {
    this.state.fish = this.state.fish.filter(fish => {
      if (!stepLiveFish(this.world, fish)) return true;
      this.escapeFish(fish); return false;
    });
  }

  private escapeFish(fish: Fish): void {
    this.state.terminalFish.push({ id: fish.id, species: fish.species, state: 'escaped', position: { ...fish.position }, escapedTick: this.state.simulationTick });
    this.publish('fish_escape', fish.id);
  }

  private removeFishInWater(): void {
    this.state.fish = this.state.fish.filter(fish => {
      if (fish.state !== 'groundedAlive' || landAtCenter(this.world, fish.position)) return true;
      this.escapeFish(fish); return false;
    });
  }

  private allocateFishId(): string {
    let id: string;
    do { id = `fish-${this.state.seed}-${this.nextFishId++}`; } while (this.reservedFishIds.has(id));
    this.reservedFishIds.add(id); return id;
  }

  private restart(): void {
    if (this.bossPlaytest) { this.prepareBossPlaytest(); return; }
    const fixture = this.state.fixture; const seed = this.state.seed;
    this.world = makeWorld(fixture);
    this.state = this.newState(fixture, seed, fixture === 'island' ? { x: 4, y: 1, z: -7 } : { x: 0, y: 1, z: fixture === 'fish-arena' ? 3.5 : fixture==='boss-arena'?8.5:0 }, fixture === 'island' ? -0.3 : 0, fixture === 'fish-arena' ? -.6 : 0, this.initialFishRngState);
    this.bossSimulation=new BossSimulation(this.world);this.state.boss=this.bossSimulation.state;this.pendingBossHit=null;
    this.velocityY = 0; this.chargeTicks = 0; this.waitingTicks = 0; this.biteTicks = 0;
    this.nextCastId = 1; this.reel = createReel(); this.clearInput();
    this.attackCooldownTicks = 0;
    this.survival = new Survival(); this.menuReturnPhase = 'running'; this.state.mode = 'combat';
    this.publish('restart', 'player');
  }

  private die(reason: GameState['deathReason']='starvation'): void {
    if (this.state.gamePhase === 'dead') return;
    this.state.gamePhase = 'dead'; this.state.ui.menu = 'dead'; this.state.deathReason = reason;
    this.state.attack.elapsed = WEAPONS[this.state.attack.weaponId].animationSeconds;
    this.clearInput(); this.publish('game_over', 'player');
  }

  private win(): void {
    if(this.state.gamePhase==='victory') return;
    this.state.gamePhase='victory';this.state.ui.menu='victory';this.clearInput();this.publish('victory',BOSS.id);
    this.state.attack.elapsed = WEAPONS[this.state.attack.weaponId].animationSeconds;
  }

  private openShop(): GameState['lastAction'] {
    const phase = this.state.gamePhase;
    if (phase === 'dead'||phase==='victory') return {accepted:false, reason:phase};
    if (this.state.ui.menu === 'settings') return {accepted:false, reason:'settings-open'};
    if (this.state.ui.menu === 'inventory') return {accepted:false, reason:'inventory-open'};
    const access = shopAccess(this.state.player);
    if (!access.valid) return {accepted:false, reason:access.reason};
    if (this.state.ui.menu !== 'shop') this.menuReturnPhase = phase;
    this.state.gamePhase = 'paused'; this.state.ui.menu = 'shop'; this.clearInput();
    return {accepted:true, reason:'openShop'};
  }

  private stepFishing(): void {
    const fishing = this.state.fishing;
    if (fishing.phase === 'waiting') {
      this.waitingTicks++;
      if (this.waitingTicks === 120) {
        fishing.phase = 'bite'; fishing.biteRemaining = 1; this.biteTicks = 0;
        this.publish('bite', `cast-${fishing.cast!.id}`);
      }
    } else if (fishing.phase === 'bite') {
      this.biteTicks++; fishing.biteRemaining = Math.max(0, 60 - this.biteTicks) * STEP;
      if (this.biteTicks >= 60) this.cancelFishing('missed-bite');
    } else if (fishing.phase === 'reeling') {
      const next = stepReel(this.reel, fishing.holding, fishing.species!); this.reel = next.state;
      fishing.progress = this.reel.progressTicks / 3; fishing.tension = this.reel.tension;
      fishing.highTensionDuration = this.reel.highTicks * STEP; fishing.lowTensionDuration = this.reel.lowTicks * STEP;
      fishing.reelElapsed = this.reel.ticks * STEP; fishing.struggling = isStruggling(this.reel.ticks);
      if (next.outcome === 'landed') {
        fishing.phase = 'landed';
        const fish = createLiveFish({ id: this.allocateFishId(), species: fishing.species!,
          state: 'carried', position: carriedPosition(this.state.player), jumpTimer: 0 });
        this.state.fish.push(fish);this.state.stats.caught++; this.publish('landing', fish.id); this.cancelFishing('landed', true);
        if(fish.species==='golden') {
          this.state.rareCaughtCount++;
          if(this.state.rareCaughtCount===3 && this.state.boss.state==='locked') {
            this.bossSimulation=new BossSimulation(this.world,bossInitial(3),this.state.simulationTick);this.state.boss=this.bossSimulation.state;this.publish('boss_spawn',BOSS.id);
          }
        }
      } else if (next.outcome) this.cancelFishing(next.outcome, true);
    }
  }

  dispatch(action: unknown): GameState['lastAction'] {
    const finish = (accepted: boolean, reason: string) => {
      this.state.lastAction = { accepted, reason }; return { ...this.state.lastAction };
    };
    if (!record(action) || typeof action.type !== 'string') return finish(false, 'invalid-action');
    if (action.type === 'restart') {
      if (!onlyKeys(action, ['type', 'confirm']) || action.confirm !== true) return finish(false, 'confirmation-required');
      this.restart(); return finish(true, 'restart');
    }
    if (action.type === 'openSettings' || action.type === 'closeSettings') {
      if (!onlyKeys(action, ['type'])) return finish(false,'invalid-settings');
      if (action.type === 'openSettings') {
        if (['inventory','shop'].includes(this.state.ui.menu)) return finish(false,'menu-open');
        if (this.state.ui.menu !== 'settings') {
          this.settingsBasePhase = this.state.gamePhase;
          this.settingsReturnPhase = this.state.gamePhase === 'dead' || this.state.gamePhase === 'victory' ? this.state.gamePhase : 'paused';
        }
        this.state.gamePhase = 'paused'; this.state.ui.menu = 'settings';
      } else {
        if (this.state.ui.menu !== 'settings') return finish(false,'settings-not-open');
        this.state.gamePhase = this.settingsReturnPhase; this.state.ui.menu = this.settingsReturnPhase === 'paused' ? 'pause' : this.settingsReturnPhase;
      }
      this.clearInput(); return finish(true,action.type);
    }
    if (action.type === 'updateSettings') {
      if (this.state.ui.menu !== 'settings') return finish(false,'settings-not-open');
      if (!onlyKeys(action,['type','volume','sensitivity','bindings'])) return finish(false,'invalid-settings');
      const {type: _type,...patch} = action;
      try {
        const next = updateSettings(this.preferences,patch);
        try { this.settingsWriter?.(next); } catch { return finish(false,'settings-write-failed'); }
        this.preferences = next; this.state.settings = structuredClone(next); this.clearInput(); return finish(true,'settings-updated');
      } catch(error) { return finish(false,error instanceof SettingsError ? error.reason : 'invalid-settings'); }
    }
    if (this.state.ui.menu === 'settings' && !['pause','resume'].includes(action.type)) return finish(false,'settings-open');
    if (this.state.gamePhase === 'dead'||this.state.gamePhase==='victory') return finish(false, this.state.gamePhase);
    if (action.type === 'buy' || action.type === 'equip') {
      if (!onlyKeys(action, ['type', 'weaponId']) || !isWeaponId(action.weaponId)) return finish(false, `invalid-${action.type}`);
      const id = action.weaponId;
      if (action.type === 'buy') {
        if (this.state.ui.menu !== 'shop') return finish(false, 'shop-not-open');
        if (this.state.unlockedWeapons.includes(id)) return finish(false, 'already-unlocked');
        const price = WEAPONS[id].price;
        if (this.state.coins < price) return finish(false, 'insufficient-coins');
        const balance = this.state.coins - price;
        if (!Number.isFinite(balance) || !Number.isInteger(balance) || this.state.coins - balance !== price) return finish(false, 'coin-limit');
        this.state.coins = balance; this.state.unlockedWeapons.push(id);
        this.publish('buy', id); return finish(true, 'buy');
      }
      if (!this.state.unlockedWeapons.includes(id)) return finish(false, 'weapon-locked');
      if (this.state.gamePhase !== 'running' && !['inventory','shop'].includes(this.state.ui.menu)) return finish(false, 'paused');
      this.state.currentWeapon = id; return finish(true, 'equip');
    }
    if (action.type === 'openShop' || action.type === 'closeShop') {
      if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-shop');
      if (action.type === 'openShop') { const result = this.openShop(); return finish(result.accepted, result.reason); }
      if (this.state.ui.menu !== 'shop') return finish(false, 'shop-not-open');
      this.state.gamePhase = this.menuReturnPhase; this.state.ui.menu = this.menuReturnPhase === 'running' ? 'none' : 'pause';
      this.clearInput(); return finish(true, 'closeShop');
    }
    if (action.type === 'sell') {
      if (!onlyKeys(action, ['type','fishId']) || typeof action.fishId !== 'string') return finish(false, 'invalid-sell');
      if (this.state.ui.menu !== 'shop') return finish(false, 'shop-not-open');
      const index = this.state.inventory.findIndex(item => item.id === action.fishId);
      if (index === -1) return finish(false, 'not-in-inventory');
      const item = this.state.inventory[index]; const price = SALE_PRICES[item.species]; const balance = this.state.coins + price;
      if (!Number.isFinite(balance) || !Number.isInteger(balance) || balance - this.state.coins !== price) return finish(false, 'coin-limit');
      this.state.inventory.splice(index, 1); this.state.coins = balance;
      this.state.stats.sold++;this.state.stats.coinsEarned+=price;
      this.state.terminalFish.push({id:item.id, species:item.species, state:'sold', soldTick:this.state.simulationTick, price});
      this.publish('sell', item.id); return finish(true, 'sell');
    }
    if (action.type === 'openInventory' || action.type === 'closeInventory') {
      if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-inventory');
      if (action.type === 'openInventory') {
        if (this.state.ui.menu === 'settings') return finish(false,'settings-open');
        if (this.state.ui.menu === 'shop') return finish(false, 'shop-open');
        if (this.state.ui.menu !== 'inventory') this.menuReturnPhase = this.state.gamePhase;
        this.state.gamePhase = 'paused'; this.state.ui.menu = 'inventory';
      } else {
        if (this.state.ui.menu !== 'inventory') return finish(false, 'inventory-not-open');
        this.state.gamePhase = this.menuReturnPhase;
        this.state.ui.menu = this.menuReturnPhase === 'running' ? 'none' : 'pause';
      }
      this.clearInput(); return finish(true, action.type);
    }
    if (action.type === 'eat') {
      if (!onlyKeys(action, ['type','fishId']) || typeof action.fishId !== 'string') return finish(false, 'invalid-eat');
      const index = this.state.inventory.findIndex(item => item.id === action.fishId);
      if (index === -1) return finish(false, 'not-in-inventory');
      if (this.state.player.hunger >= 100) return finish(false, 'hunger-full');
      const [item] = this.state.inventory.splice(index, 1);
      this.survival.eat(this.state.player, FOOD[item.species]);
      this.state.consumedFish.push({id:item.id, species:item.species, state:'consumed', consumedTick:this.state.simulationTick});
      this.publish('eat', item.id); return finish(true, 'eat');
    }
    if (action.type === 'pause' || action.type === 'resume') {
      if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-action');
      if (['inventory','shop','settings'].includes(this.state.ui.menu)) {
        if (action.type === 'resume') return finish(false, `${this.state.ui.menu}-open`);
        if (this.state.ui.menu === 'settings' && this.settingsBasePhase === 'running') this.settingsBasePhase = 'paused';
        this.menuReturnPhase = 'paused'; this.clearInput(); return finish(true, 'pause');
      }
      this.clearInput();
      this.state.gamePhase = action.type === 'pause' ? 'paused' : 'running';
      this.state.ui.menu = action.type === 'pause' ? 'pause' : 'none';
      return finish(true, action.type);
    }
    if (this.state.gamePhase !== 'running') return finish(false, 'paused');
    switch (action.type) {
      case 'interact': {
        if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-interact');
        const access = shopAccess(this.state.player);
        if (access.valid) { const result = this.openShop(); return finish(result.accepted, result.reason); }
        const fish = this.state.fish.find(fish => fish.state === 'carried');
        if (!fish) {
          const corpse = pickupTarget(this.state.player, this.state.fish);
          if (!corpse) return finish(false, access.reason === 'shop-obstructed' ? access.reason : 'no-corpse-in-range');
          if (this.state.inventory.length >= INVENTORY_CAPACITY) return finish(false, 'inventory-full');
          this.state.fish = this.state.fish.filter(item => item.id !== corpse.id);
          this.state.inventory.push({id:corpse.id, species:corpse.species, state:'inventoryDead'});
          this.publish('inventory', corpse.id); return finish(true, 'pickup-corpse');
        }
        const target = placementPreview(this.world, this.state.player);
        if (!target.valid) return finish(false, target.reason);
        Object.assign(fish, createLiveFish({ id: fish.id, species: fish.species, state: 'groundedAlive', position: target.position, jumpTimer: 0, hp: fish.hp }));
        this.publish('fish_place', fish.id); return finish(true, 'place-fish');
      }
      case 'move':
        if (!onlyKeys(action, ['type', 'forward', 'strafe', 'sprint']) || !direction(action.forward) ||
          !direction(action.strafe) || typeof action.sprint !== 'boolean') return finish(false, 'invalid-move');
        if (this.state.fishing.phase !== 'idle') { this.input = { forward: 0, strafe: 0, sprint: false }; return finish(false, 'fishing-locked'); }
        this.input = { forward: action.forward, strafe: action.strafe, sprint: action.sprint };
        return finish(true, 'move');
      case 'look':
        if (!onlyKeys(action, ['type', 'yaw', 'pitch']) || !finite(action.yaw) || !finite(action.pitch)) return finish(false, 'invalid-look');
        const look = this.state.fishing.cast ? limitedLook(this.state.fishing.cast, action.yaw, action.pitch)
          : { yaw: action.yaw, pitch: Math.max(-1.4, Math.min(1.4, action.pitch)) };
        this.state.player.yaw = look.yaw;
        this.state.player.pitch = look.pitch;
        this.syncCarriedFish();
        if (this.state.fishing.phase === 'idle' || this.state.fishing.phase === 'charging')
          this.state.fishing.preview = castPreview(this.world, this.state.player, this.state.fishing.chargeSeconds);
        return finish(true, 'look');
      case 'jump':
        if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-jump');
        if (this.state.fishing.phase !== 'idle') return finish(false, 'fishing-locked');
        if (this.state.player.position.y !== this.world.surface || this.velocityY !== 0) return finish(false, 'airborne');
        this.velocityY = PHYSICS.jump; return finish(true, 'jump');
      case 'setMode':
        if (!onlyKeys(action, ['type', 'mode']) || (action.mode !== 'fishing' && action.mode !== 'combat')) return finish(false, 'invalid-mode');
        if (action.mode === this.state.mode) return finish(true, 'mode-unchanged');
        this.cancelFishing();
        this.state.mode = action.mode;
        return finish(true, 'setMode');
      case 'cancelFishing':
        if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-cancel');
        this.cancelFishing(); return finish(true, 'cancelFishing');
      case 'primaryDown':
        if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-primary');
        if (this.state.mode === 'combat') {
          if (this.attackCooldownTicks > 0) return finish(false, 'attack-cooldown');
          const weaponId = this.state.currentWeapon; const weapon = WEAPONS[weaponId];
          const fishTarget = attackTarget(this.state.player, this.state.fish, weapon);
          const boss = this.state.boss;
          const bossDistance = boss.state==='active' ? targetDistance(this.state.player,boss.position,boss.radius,weapon.range,Infinity) : null;
          const fishDistance = fishTarget ? targetDistance(this.state.player,{...fishTarget.position,y:fishTarget.position.y+.2},.2,weapon.range)! : Infinity;
          const hitBoss = bossDistance!==null && bossDistance<fishDistance;
          const target = hitBoss ? null : fishTarget;
          const hitId = hitBoss ? boss.id : target?.id ?? null;
          this.attackCooldownTicks = weapon.cooldownTicks; this.state.attackCooldownRemaining = weapon.cooldownTicks * STEP;
          this.state.attack = { sequence: this.state.attack.sequence + 1, elapsed: 0, weaponId, targetKind:hitBoss?'boss':target?'fish':null, hitId, result: hitId ? 'hit' : 'miss' };
          this.publish(weaponId === 'fist' ? 'punch' : 'weapon_attack', hitId ?? 'player', weaponId);
          if(hitBoss) this.pendingBossHit={damage:weapon.damage,weaponId};
          if (target) {
            const died = attackFish(this.world, target, this.state.player, weapon); this.publish('fish_damage', target.id, weaponId);
            if (died) { this.state.stats.killed++;this.publish('fish_death', target.id); this.state.attack.result = 'kill'; }
          }
          // Attack/death commit before any fish displacement/escape simulation.
          this.removeFishInWater();
          return finish(true, hitBoss ? 'boss-hit' : target ? weaponId === 'fist' ? 'punch-hit' : 'attack-hit' : weaponId === 'fist' ? 'punch-miss' : 'attack-miss');
        }
        if (this.state.fish.some(fish => fish.state === 'carried')) return finish(false, 'carrying-fish');
        if (this.state.fishing.phase === 'bite' || this.state.fishing.phase === 'reeling') {
          if (this.state.fishing.phase === 'bite') {
            const draw = sampleFish(this.state.fishRngState);
            this.state.fishRngState = draw.state; this.state.fishing.species = draw.species;
            this.reel = createReel(); this.state.fishing.phase = 'reeling'; this.state.fishing.biteRemaining = 0;
            this.state.fishing.progress = 0; this.state.fishing.tension = 40;
            this.publish('hooked', `cast-${this.state.fishing.cast!.id}`);
          }
          this.input = { forward: 0, strafe: 0, sprint: false };
          this.state.fishing.holding = true; return finish(true, 'primaryDown');
        }
        if (this.state.fishing.phase === 'charging' && !this.chargeHeld) {
          this.chargeHeld = true; this.state.fishing.holding = true; return finish(true, 'primaryDown');
        }
        if (this.state.fishing.phase !== 'idle') return finish(false, 'fishing-active');
        if (this.state.player.position.y !== this.world.surface || this.velocityY !== 0) return finish(false, 'not-grounded');
        this.cancelFishing(null); this.chargeTicks = 0; this.chargeHeld = true;
        this.state.fishing.phase = 'charging'; this.state.fishing.chargeSeconds = 0;
        this.state.fishing.holding = true;
        this.state.fishing.preview = castPreview(this.world, this.state.player, 0);
        return finish(true, 'primaryDown');
      case 'primaryUp': {
        if (!onlyKeys(action, ['type'])) return finish(false, 'invalid-primary');
        if (this.state.mode === 'combat') return finish(true, 'primaryUp');
        if (this.state.fishing.phase === 'reeling') {
          this.state.fishing.holding = false; return finish(true, 'primaryUp');
        }
        if (this.state.fishing.phase !== 'charging') return finish(false, 'not-charging');
        const preview = castPreview(this.world, this.state.player, this.state.fishing.chargeSeconds);
        if (!preview.valid) { this.cancelFishing(null); return finish(false, preview.reason); }
        const player = this.state.player;
        const cast = {
          id: this.nextCastId++, origin: { ...player.position }, position: { ...preview.position },
          distance: preview.distance, yaw: player.yaw, pitch: floatPitch(player, preview.distance),
        };
        this.state.fishing.phase = 'waiting'; this.state.fishing.preview = preview; this.state.fishing.cast = cast;
        this.waitingTicks = 0; this.biteTicks = 0;
        this.publish('cast', `cast-${cast.id}`);
        const look = limitedLook(cast, player.yaw, player.pitch); player.yaw = look.yaw; player.pitch = look.pitch;
        this.clearInput(); return finish(true, 'primaryUp');
      }
      default: return finish(false, 'unsupported-action');
    }
  }

  advanceTicks(count: unknown): void {
    if (!finite(count) || !Number.isInteger(count) || count < 0 || count > 36000) throw new RangeError('count must be an integer in [0,36000]');
    for (let i = 0; i < count; i++) this.step();
  }

  step(): void {
    if (this.state.gamePhase !== 'running') return;
    this.state.simulationTick++;
    if(this.pendingBossHit) {
      const hit=this.pendingBossHit;this.pendingBossHit=null;const dealt=this.bossSimulation.damage(hit.damage);
      if(dealt>0) { this.state.stats.bossDamageDealt+=dealt;this.publish('boss_damage',BOSS.id,hit.weaponId); }
      if(this.state.boss.state==='defeated') this.state.attack.result='kill';
    }
    this.attackCooldownTicks = Math.max(0, this.attackCooldownTicks - 1);
    this.state.attackCooldownRemaining = this.attackCooldownTicks * STEP;
    this.state.attack.elapsed = Math.min(WEAPONS[this.state.attack.weaponId].animationSeconds, this.state.attack.elapsed + STEP);
    const player = this.state.player;
    if (this.state.fishing.phase === 'charging' && this.chargeHeld) {
      this.chargeTicks = Math.min(60, this.chargeTicks + 1);
      this.state.fishing.chargeSeconds = this.chargeTicks * STEP;
    }
    const magnitude = Math.hypot(this.input.forward, this.input.strafe) || 1;
    const forward = this.input.forward / magnitude;
    const strafe = this.input.strafe / magnitude;
    const speed = this.input.sprint ? PHYSICS.sprint : PHYSICS.walk;
    const sin = Math.sin(player.yaw); const cos = Math.cos(player.yaw);
    if (this.state.fishing.phase === 'idle')
      player.position = moveHorizontal(this.world, player.position,
        (forward * sin + strafe * cos) * speed * STEP,
        (forward * cos - strafe * sin) * speed * STEP);
    if (this.velocityY !== 0 || player.position.y > this.world.surface) {
      const nextY = player.position.y + this.velocityY * STEP - 0.5 * PHYSICS.gravity * STEP * STEP;
      this.velocityY -= PHYSICS.gravity * STEP;
      // Respect the building's height when an initial airborne player descends.
      if (this.velocityY < 0 && nextY < SHOP.bottom + SHOP.height &&
        player.position.y >= SHOP.bottom + SHOP.height &&
        !canOccupy(this.world, { ...player.position, y: SHOP.bottom })) {
        player.position.y = SHOP.bottom + SHOP.height;
        this.velocityY = 0;
      } else if (nextY <= this.world.surface) {
        player.position.y = this.world.surface; this.velocityY = 0;
      } else player.position.y = nextY;
    }
    this.stepFishing(); this.stepFishLife(); this.syncCarriedFish();
    const previousHp = player.hp;let bossKilledPlayer=false;
    this.bossSimulation.step(this.state.simulationTick,player,amount=>{
      this.survival.damage(player,amount);if(player.hp===0) bossKilledPlayer=true;
    });
    this.survival.step(player);
    if (player.hp < previousHp) this.publish('player_damage', 'player');
    if (player.hp === 0) this.die(bossKilledPlayer?'boss':'starvation');
    else if(this.state.boss.state==='defeated') this.win();
    if (this.state.fishing.phase === 'idle' || this.state.fishing.phase === 'charging')
      this.state.fishing.preview = castPreview(this.world, player, this.state.fishing.chargeSeconds);
  }
}
