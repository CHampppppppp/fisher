import type { GameState, Position } from './types.ts';
import { STEP } from './types.ts';
import { WEAPONS, isWeaponId } from './weapons.ts';
import { FISH_SPECIES } from './fish-species.ts';
import { fishClearOfShop } from './fish-life.ts';
import { carriedPosition } from './fishing.ts';
import { canOccupy, landAtCenter, makeWorld } from './world.ts';
import { bossInitial, BOSS, type BossSimulation } from './boss.ts';
import { INVENTORY_CAPACITY, type Survival } from './survival.ts';
import { SALE_PRICES } from './shop.ts';

export const SAVE_VERSION = 1;
export type SavedState = Pick<GameState, 'simulationTick' | 'gamePhase' | 'deathReason' | 'player' | 'coins' |
  'unlockedWeapons' | 'currentWeapon' | 'rareCaughtCount' | 'boss' | 'stats' | 'seed' | 'fishRngState' | 'fixture' |
  'mode' | 'fish' | 'terminalFish' | 'inventory' | 'consumedFish' | 'attackCooldownRemaining' | 'attack'>;
export interface SaveFile {
  version: typeof SAVE_VERSION;
  state: SavedState;
  runtime: {
    velocityY: number; initialFishRngState: number; nextFishId: number; nextCastId: number;
    nextEventSequence: number; reservedFishIds: string[]; attackCooldownTicks: number;
    survival: ReturnType<Survival['snapshot']>; boss: ReturnType<BossSimulation['snapshot']>;
  };
}

function fail(label: string): never { throw new TypeError(`Invalid save: ${label}`); }
function object(value: unknown, fields: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).length !== fields.length || !fields.every(key => Object.hasOwn(value, key))) fail(label);
  return value as Record<string, unknown>;
}
function number(value: unknown, label: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(label);
  return value;
}
function integer(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, label, min, max); if (!Number.isSafeInteger(result)) fail(label); return result;
}
function enumValue(value: unknown, values: readonly unknown[], label: string): void { if (!values.includes(value)) fail(label); }
function boolean(value: unknown, label: string): void { if (typeof value !== 'boolean') fail(label); }
function string(value: unknown, label: string): string { if (typeof value !== 'string' || !value.trim()) fail(label); return value; }
function list(value: unknown, label: string, max = 100000): unknown[] {
  if (!Array.isArray(value) || value.length > max || Object.keys(value).length !== value.length ||
    !Array.from({length:value.length},(_,index)=>Object.hasOwn(value,index)).every(Boolean)) fail(label); return value;
}
function position(value: unknown, label: string): Position {
  const p = object(value, ['x','y','z'], label);
  return { x:number(p.x,label), y:number(p.y,label), z:number(p.z,label) };
}
function near(a: number, b: number, label: string): void { if (Math.abs(a-b)>1e-8) fail(label); }
function ticksMatch(seconds: unknown, ticks: number, label: string): void {
  if (Math.ceil(number(seconds,label,0)/STEP-1e-9)!==ticks) fail(label);
}

/** All inputs pass the same complete validator before any game or IndexedDB mutation. */
export function validateSave(value: unknown): SaveFile {
  const root = object(value, ['version','state','runtime'], 'document');
  if(root.version!==SAVE_VERSION) throw new TypeError('Unsupported save version');
  const s = object(root.state, ['simulationTick','gamePhase','deathReason','player','coins','unlockedWeapons','currentWeapon',
    'rareCaughtCount','boss','stats','seed','fishRngState','fixture','mode','fish','terminalFish','inventory','consumedFish','attackCooldownRemaining','attack'], 'state');
  const r = object(root.runtime, ['velocityY','initialFishRngState','nextFishId','nextCastId','nextEventSequence','reservedFishIds','attackCooldownTicks','survival','boss'], 'runtime');
  const tick = integer(s.simulationTick,'simulationTick');
  enumValue(s.fixture,['island','shore','fish-arena','boss-arena'],'fixture');
  const world = makeWorld(s.fixture as GameState['fixture']);
  integer(s.seed,'seed',1,0xffffffff); integer(s.fishRngState,'fishRngState',1,0xffffffff);
  enumValue(s.gamePhase,['running','paused','dead','victory'],'gamePhase'); enumValue(s.mode,['fishing','combat'],'mode');
  enumValue(s.deathReason,[null,'starvation','boss'],'deathReason');
  const p = object(s.player,['position','yaw','pitch','hp','hunger'],'player'); const pp=position(p.position,'player.position');
  number(p.yaw,'yaw');number(p.pitch,'pitch',-1.4,1.4);number(p.hp,'hp',0,100);number(p.hunger,'hunger',0,100);
  if(pp.y<1 || !canOccupy(world,{...pp,y:1})) fail('player legal land');
  // Coins already supported integers beyond MAX_SAFE_INTEGER; only exact transactions are accepted by production.
  if(!Number.isInteger(number(s.coins,'coins',0))) fail('coins');
  const weapons=list(s.unlockedWeapons,'weapons',4);if(!weapons.every(isWeaponId)||new Set(weapons).size!==weapons.length||!weapons.includes('fist')||!isWeaponId(s.currentWeapon)||!weapons.includes(s.currentWeapon)) fail('equipped unlock');
  const rare=integer(s.rareCaughtCount,'rareCaughtCount');
  const stats=object(s.stats,['caught','killed','sold','coinsEarned','bossDamageDealt'],'stats');for(const [key,value] of Object.entries(stats)) { if(key==='bossDamageDealt') number(value,`stats.${key}`,0,600); else integer(value,`stats.${key}`); }
  number(r.velocityY,'velocityY');integer(r.initialFishRngState,'initialFishRngState',1,0xffffffff);
  integer(r.nextFishId,'nextFishId',1);integer(r.nextCastId,'nextCastId',1);integer(r.nextEventSequence,'nextEventSequence',1);
  const reserved=list(r.reservedFishIds,'reservedFishIds').map(id=>string(id,'reserved ID'));const reservedIds=new Set(reserved);if(reservedIds.size!==reserved.length) fail('reserved duplicate');
  const ids=new Set<string>();
  const identity=(item:Record<string,unknown>)=>{
    const id=string(item.id,'entity ID');if(ids.has(id)||!reservedIds.has(id)) fail('duplicate or unreserved entity ID');ids.add(id);
    if(typeof item.species!=='string'||!Object.hasOwn(FISH_SPECIES,item.species)) fail('species');
    return FISH_SPECIES[item.species as keyof typeof FISH_SPECIES];
  };
  let carried=0;
  for(const item of list(s.fish,'fish')) {
    const f=object(item,['id','species','state','position','hp','jumpTimer','jumpPhase','jumpElapsed','jumpDirection','jumpBlocked'],'fish');const def=identity(f);
    enumValue(f.state,['carried','groundedAlive','groundedDead'],'fish.state');const fp=position(f.position,'fish.position');const hp=number(f.hp,'fish.hp',0,def.hp);
    if((f.state==='groundedDead')!==(hp===0)) fail('fish HP state');
    const timer=number(f.jumpTimer,'fish.jumpTimer',0,def.jumpInterval+1e-8);const elapsed=number(f.jumpElapsed,'jumpElapsed',0,.4);
    enumValue(f.jumpPhase,['idle','warning','jumping'],'jumpPhase');boolean(f.jumpBlocked,'jumpBlocked');
    const dir=object(f.jumpDirection,['x','z'],'jumpDirection');near(Math.hypot(number(dir.x,'direction.x'),number(dir.z,'direction.z')),1,'fish direction');
    if(f.state==='carried') {
      if(++carried>1 || f.jumpPhase!=='idle' || elapsed!==0) fail('carried state');
      const expected=carriedPosition(s.player as GameState['player']);near(fp.x,expected.x,'carried.x');near(fp.y,expected.y,'carried.y');near(fp.z,expected.z,'carried.z');
    } else {
      if(!landAtCenter(world,fp)||!fishClearOfShop(fp)) fail('ground fish land');
      if(f.jumpPhase==='jumping') {
        if(f.state!=='groundedAlive'||elapsed>=.4||timer> .4+1e-8) fail('jumping state');near(timer,elapsed,'jump timer');near(fp.y,1+1.6*(elapsed/.4)*(1-elapsed/.4),'jump height');
      } else {
        near(fp.y,1,'ground height');
        if(f.state==='groundedDead' && (f.jumpPhase!=='idle'||elapsed!==0||f.jumpBlocked!==false)) fail('corpse jump');
        if(f.state==='groundedAlive' && (f.jumpPhase==='warning') !== (timer>=def.jumpInterval-.2-1e-9)) fail('warning timer');
      }
    }
  }
  for(const item of list(s.inventory,'inventory',INVENTORY_CAPACITY)) {
    const f=object(item,['id','species','state'],'inventory');identity(f);enumValue(f.state,['inventoryDead'],'inventory.state');
  }
  for(const item of list(s.consumedFish,'consumedFish')) {
    const f=object(item,['id','species','state','consumedTick'],'consumedFish');identity(f);enumValue(f.state,['consumed'],'consumed.state');integer(f.consumedTick,'consumedTick',0,tick);
  }
  for(const item of list(s.terminalFish,'terminalFish')) {
    if(!item||typeof item!=='object') fail('terminalFish');const kind=(item as Record<string,unknown>).state;
    const f=object(item,kind==='escaped'?['id','species','state','position','escapedTick']:['id','species','state','soldTick','price'],'terminalFish');identity(f);
    enumValue(kind,['escaped','sold'],'terminal.state');
    if(kind==='escaped'){position(f.position,'escaped.position');integer(f.escapedTick,'escapedTick',0,tick);}
    else { integer(f.soldTick,'soldTick',0,tick);if(f.price!==SALE_PRICES[f.species as keyof typeof SALE_PRICES]) fail('sale price'); }
  }
  const a=object(s.attack,['sequence','elapsed','weaponId','targetKind','hitId','result'],'attack');integer(a.sequence,'attack.sequence');
  if(!isWeaponId(a.weaponId)||!weapons.includes(a.weaponId)) fail('attack weapon');near(number(a.elapsed,'attack.elapsed'),WEAPONS[a.weaponId].animationSeconds,'unfinished animation');
  enumValue(a.targetKind,[null,'fish','boss'],'targetKind');enumValue(a.result,['none','miss','hit','kill'],'attack.result');
  if(a.hitId!==null && typeof a.hitId!=='string') fail('hitId');
  if((a.targetKind===null)!==(a.hitId===null) || (a.targetKind==='boss'&&a.hitId!==BOSS.id)) fail('attack target');
  if((a.targetKind==='fish' && !reservedIds.has(a.hitId as string)) ||
    (a.targetKind===null ? !['none','miss'].includes(a.result as string) : !['hit','kill'].includes(a.result as string))) fail('attack result');
  const cd=integer(r.attackCooldownTicks,'cooldownTicks',0,WEAPONS[a.weaponId].cooldownTicks);near(number(s.attackCooldownRemaining,'cooldown',0),cd*STEP,'cooldown clock');
  const survival=object(r.survival,['hpBase','hungerBase','hungerTicks','damageTicks'],'survival');
  const baseHp=number(survival.hpBase,'hpBase',0,100);const baseHunger=number(survival.hungerBase,'hungerBase',0,100);
  const hungerTicks=integer(survival.hungerTicks,'hungerTicks',0,tick);const damageTicks=integer(survival.damageTicks,'damageTicks',0,tick);
  near(number(p.hp,'hp'),Math.max(0,baseHp-damageTicks/30),'HP baseline');near(number(p.hunger,'hunger'),Math.max(0,baseHunger-hungerTicks/120),'hunger baseline');
  const b=object(s.boss,['state','hp','tentacleRemaining','inkRemaining','id','position','radius','phase','attacks'],'boss');
  bossInitial(rare,{state:b.state,hp:b.hp,tentacleRemaining:b.tentacleRemaining,inkRemaining:b.inkRemaining});
  if(b.id!==BOSS.id||b.radius!==BOSS.radius) fail('boss identity');const bp=position(b.position,'boss.position');near(bp.x,0,'boss.x');near(bp.y,1,'boss.y');near(bp.z,(world.coast.kind==='square'?world.coast.halfSize:world.coast.radius)+2,'boss.z');
  if(b.phase!==(b.state==='locked'||number(b.hp,'boss.hp')>300?1:2)) fail('boss phase');
  if((s.gamePhase==='dead')!==(p.hp===0) || (s.gamePhase==='dead')!==(s.deathReason!==null) ||
    (s.gamePhase==='victory' && b.state!=='defeated') || (b.state==='defeated' && !['dead','victory'].includes(s.gamePhase as string))) fail('terminal state');
  const clocks=object(r.boss,['tentacleTicks','inkTicks','nextAttack','bornTick','attackTicks'],'boss clocks');
  const tentacleTicks=integer(clocks.tentacleTicks,'tentacleTicks',0,240);const inkTicks=integer(clocks.inkTicks,'inkTicks',0,180);const next=integer(clocks.nextAttack,'nextAttack',1);integer(clocks.bornTick,'bornTick',0,tick);
  ticksMatch(b.tentacleRemaining,tentacleTicks,'tentacleRemaining');ticksMatch(b.inkRemaining,inkTicks,'inkRemaining');
  const attackClocks=new Map<string,number>();for(const pair of list(clocks.attackTicks,'attackTicks',100)){
    const tuple=list(pair,'attack tick pair',2);if(tuple.length!==2) fail('attack pair');const id=string(tuple[0],'attack tick ID');if(attackClocks.has(id)) fail('duplicate attack clock');attackClocks.set(id,integer(tuple[1],'attack ticks',1,300));
  }
  const attackIds=new Set<string>();for(const item of list(b.attacks,'boss attacks',100)){
    if(!item||typeof item!=='object') fail('attack');const kind=(item as Record<string,unknown>).type;
    const attack=object(item,kind==='tentacle'?['id','type','phase','position','radius','remaining','hit']:['id','type','phase','position','direction','target','radius','remaining'],'boss attack');
    enumValue(kind,['tentacle','ink'],'attack.type');const id=string(attack.id,'attack.id');const match=/^(tentacle|ink)-(\d+)$/.exec(id);
    if(!match||match[1]!==kind||Number(match[2])<1||Number(match[2])>=next||attackIds.has(id)) fail('attack ID');attackIds.add(id);position(attack.position,'attack.position');
    const left=attackClocks.get(id);if(left===undefined) fail('missing attack clock');near(number(attack.remaining,'attack.remaining',STEP,5),left*STEP,'attack remaining');
    if(kind==='tentacle'){
      enumValue(attack.phase,['warning','active'],'tentacle phase');boolean(attack.hit,'tentacle.hit');if(attack.radius!==2||left>(attack.phase==='warning'?72:18)|| (attack.phase==='warning'&&attack.hit)) fail('tentacle state');
    } else {
      if(b.phase!==2) fail('ink in phase1');enumValue(attack.phase,['warning','flying'],'ink phase');if(attack.radius!==BOSS.inkRadius||left>(attack.phase==='warning'?48:300)) fail('ink state');
      const dir=position(attack.direction,'ink direction');near(Math.hypot(dir.x,dir.y,dir.z),1,'ink direction length');position(attack.target,'ink target');
    }
  }
  if(attackClocks.size!==attackIds.size||(b.state==='locked'&&attackIds.size!==0)) fail('attack clocks/state');
  return structuredClone(value) as SaveFile;
}
