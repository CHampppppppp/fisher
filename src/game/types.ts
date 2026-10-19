import type { FishSpecies } from './fish-species.ts';
import type { WeaponId } from './weapons.ts';
import type { Settings } from './settings.ts';

export interface Position { x: number; y: number; z: number }
export interface Player {
  position: Position;
  yaw: number;
  pitch: number;
  hp: number;
  hunger: number;
  oxygen: number;
}
export type Mode = 'fishing' | 'combat';
export interface CastPreview {
  position: Position;
  distance: number;
  valid: boolean;
  reason: 'water' | 'land' | 'obstructed';
}
export interface FishingCast {
  id: number;
  origin: Position;
  position: Position;
  distance: number;
  yaw: number;
  pitch: number;
}
export interface FishingState {
  phase: 'idle' | 'charging' | 'waiting' | 'bite' | 'reeling' | 'landed';
  chargeSeconds: number;
  lastCastTick: number;
  pullDirection: {x:number;y:number};
  rodOffset: {x:number;y:number};
  counterStrength: number;
  directionRngState: number;
  preview: CastPreview;
  cast: FishingCast | null;
  progress: number;
  tension: number;
  species: FishSpecies | null;
  biteRemaining: number;
  highTensionDuration: number;
  lowTensionDuration: number;
  reelElapsed: number;
  struggling: boolean;
  holding: boolean;
  result: 'missed-bite' | 'line-broken' | 'unhooked' | 'cancelled' | 'landed' | null;
}
export interface Fish {
  id: string; species: FishSpecies; state: 'carried' | 'groundedAlive' | 'groundedDead'; position: Position; hp: number;
  jumpTimer: number; jumpPhase: 'idle' | 'warning' | 'jumping'; jumpElapsed: number;
  jumpDirection: { x: number; z: number }; jumpBlocked: boolean;
}
export interface InitialFish { id: string; species: FishSpecies; state: Fish['state']; position: Position; jumpTimer: number; hp?: number }
export interface EscapedFish { id: string; species: FishSpecies; state: 'escaped'; position: Position; escapedTick: number }
export interface SoldFish { id: string; species: FishSpecies; state: 'sold'; soldTick: number; price: number }
export type TerminalFish = EscapedFish | SoldFish;
export interface InventoryFish { id: string; species: FishSpecies; state: 'inventoryDead' }
export interface ConsumedFish { id: string; species: FishSpecies; state: 'consumed'; consumedTick: number }
export interface GameEvent { tick: number; type: string; entityId: string; sequence: number; weaponId?: WeaponId; position?: Position }
export interface InitialBoss { state: 'locked' | 'active' | 'defeated'; hp: number; tentacleRemaining: number; inkRemaining: number }
export interface TentacleAttack { id: string; type: 'tentacle'; phase: 'warning' | 'active'; position: Position; radius: number; remaining: number; hit: boolean }
export interface InkAttack { id: string; type: 'ink'; phase: 'warning' | 'flying'; position: Position; direction: Position; target: Position; radius: number; remaining: number }
export type BossAttack = TentacleAttack | InkAttack;
export interface BossState extends InitialBoss { id: string; position: Position; radius: number; phase: 1 | 2; attacks: BossAttack[]; jumpPhase:'cooldown'|'warning'|'jumping'; jumpTicks:number; start:Position;target:Position;cooldownTicks:number;contactProtectionTicks:number;bossRngState:number }
export interface GameState {
  simulationTick: number;
  gamePhase: 'running' | 'paused' | 'dead' | 'victory';
  ui: { menu: 'none' | 'pause' | 'inventory' | 'shop' | 'dead' | 'victory' | 'settings' };
  settings: Settings;
  deathReason: 'starvation' | 'boss' | 'drowning' | null;
  player: Player;
  coins: number;
  unlockedWeapons: WeaponId[];
  currentWeapon: WeaponId;
  rareCaughtCount: number;
  boss: BossState;
  stats: { caught: number; killed: number; sold: number; coinsEarned: number; bossDamageDealt: number };
  seed: number;
  fishRngState: number;
  directionRngState: number;
  fixture: 'shore' | 'island' | 'fish-arena' | 'boss-arena';
  selectedSlot:number;
  locomotion:"ground"|"air"|"swimming";
  submerged:boolean;
  verticalInput:-1|0|1;
  mode: Mode;
  fishing: FishingState;
  fish: Fish[];
  terminalFish: TerminalFish[];
  inventory: InventoryFish[];
  consumedFish: ConsumedFish[];
  attackCooldownRemaining: number;
  attack: { sequence: number; elapsed: number; elapsedTicks:number; hand:"left"|"right"; queued:boolean; hitCommitted:boolean; weaponId: WeaponId; targetKind: 'fish' | 'boss' | null; hitId: string | null; result: 'none' | 'miss' | 'hit' | 'kill' };
  events: GameEvent[];
  lastAction: { accepted: boolean; reason: string };
}
export interface ResetOptions {
  seed: number;
  fixture: 'shore' | 'fish-arena' | 'boss-arena';
  initial?: { selectedSlot?:number; player?: { position?: Position; yaw?: number; pitch?: number; hp?: number; hunger?: number; oxygen?:number }; fishRngState?: number; fish?: InitialFish[]; inventory?: {id: string; species: FishSpecies}[]; coins?: number; unlockedWeapons?: WeaponId[]; currentWeapon?: WeaponId; rareCaughtCount?: number; boss?: InitialBoss };
}
export type Action =
  | { type: 'move'; forward: -1 | 0 | 1; strafe: -1 | 0 | 1; sprint: boolean }
  | {type:'selectSlot';index:number}
  | {type:'cycleSlot';delta:-1|1}
  | {type:'swim';vertical:-1|0|1}
  | { type: 'look'; yaw: number; pitch: number }
  | { type: 'setMode'; mode: Mode }
  | { type: 'pull'; x:number; y:number }
  | { type: 'restart'; confirm: true }
  | { type: 'eat' | 'sell'; fishId: string }
  | { type: 'buy' | 'equip'; weaponId: WeaponId }
  | ({ type: 'updateSettings' } & Partial<Settings>)
  | { type: 'jump' | 'pause' | 'resume' | 'primaryDown' | 'primaryUp' | 'cancelFishing' | 'interact' | 'openInventory' | 'closeInventory' | 'openShop' | 'closeShop' | 'save' | 'load' | 'openSettings' | 'closeSettings' };

export const STEP = 1 / 60;
export const BODY = { radius: 0.3, height: 1.8 } as const;
export const PHYSICS = { walk: 4, sprint: 6, gravity: 18, jump: 5 } as const;
