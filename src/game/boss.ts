import { BODY, STEP } from './types.ts';
import type { BossAttack, BossState, InitialBoss, Player, Position } from './types.ts';
import type { World } from './world.ts';
import { shopBlocks } from './fishing.ts';

export const BOSS = Object.freeze({ id: 'octopus', hp: 600, radius: 2, tentacleTicks: 240, warningTicks: 72,
  activeTicks: 18, tentacleDamage: 15, inkTicks: 180, inkWarningTicks: 48, inkSpeed: 6, inkLifeTicks: 300, inkRadius: .18, inkDamage: 10 });

export function bossInitial(rareCaughtCount: number, value?: unknown): InitialBoss {
  if (value === undefined) return rareCaughtCount < 3
    ? {state:'locked',hp:0,tentacleRemaining:0,inkRemaining:0}
    : {state:'active',hp:BOSS.hp,tentacleRemaining:4,inkRemaining:3};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid initial boss');
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !['state','hp','tentacleRemaining','inkRemaining'].includes(key)) ||
    typeof item.state!=='string' || !['locked','active','defeated'].includes(item.state) ||
    typeof item.hp !== 'number' || !Number.isFinite(item.hp) ||
    typeof item.tentacleRemaining !== 'number' || !Number.isFinite(item.tentacleRemaining) || item.tentacleRemaining < 0 || item.tentacleRemaining > 4 ||
    typeof item.inkRemaining !== 'number' || !Number.isFinite(item.inkRemaining) || item.inkRemaining < 0 || item.inkRemaining > 3)
    throw new TypeError('Invalid initial boss fields');
  if ((rareCaughtCount < 3) !== (item.state === 'locked') ||
    (item.state === 'active' ? item.hp <= 0 || item.hp > BOSS.hp : item.hp !== 0)) throw new RangeError('Boss state, HP and rare count disagree');
  return {state:item.state as InitialBoss['state'],hp:item.hp,tentacleRemaining:item.tentacleRemaining,inkRemaining:item.inkRemaining};
}

/** Swept sphere vs the same standing cylinder used by the player; catches fast/diagonal shots. */
function hitsPlayer(from: Position, to: Position, player: Player): boolean {
  const dx=to.x-from.x;const dz=to.z-from.z;const dy=to.y-from.y;
  const x=from.x-player.position.x;const z=from.z-player.position.z;const r=BODY.radius+BOSS.inkRadius;
  const a=dx*dx+dz*dz;const c=x*x+z*z-r*r;let low=0;let high=1;
  if(a<1e-12) { if(c>0) return false; }
  else {
    const b=2*(x*dx+z*dz);const discriminant=b*b-4*a*c;if(discriminant<0) return false;
    const root=Math.sqrt(discriminant);low=Math.max(low,(-b-root)/(2*a));high=Math.min(high,(-b+root)/(2*a));
  }
  const bottom=player.position.y-BOSS.inkRadius;const top=player.position.y+BODY.height+BOSS.inkRadius;
  if(Math.abs(dy)<1e-12) { if(from.y<bottom || from.y>top) return false; }
  else { const first=(bottom-from.y)/dy;const last=(top-from.y)/dy;low=Math.max(low,Math.min(first,last));high=Math.min(high,Math.max(first,last)); }
  return low<=high+1e-9;
}

/** Production state and integer tick clocks; render/test both read state, never another simulation. */
export class BossSimulation {
  readonly state: BossState;
  private tentacleTicks: number;
  private inkTicks: number;
  private attackTicks = new Map<string, number>();
  private nextAttack = 1;

  constructor(world: World, initial = bossInitial(0), private bornTick = 0) {
    this.tentacleTicks=Math.ceil(initial.tentacleRemaining/STEP-1e-9);this.inkTicks=Math.ceil(initial.inkRemaining/STEP-1e-9);
    this.state={...initial,id:BOSS.id,position:{x:0,y:world.surface,z:(world.coast.kind==='square'?world.coast.halfSize:world.coast.radius)+BOSS.radius},
      radius:BOSS.radius,phase:initial.state==='locked'||initial.hp>300?1:2,attacks:[]};
  }

  damage(amount: number): number {
    if(this.state.state!=='active') return 0;
    const dealt=Math.min(this.state.hp,amount);this.state.hp-=dealt;
    if(this.state.hp===0) { this.state.state='defeated';this.state.phase=2; }
    return dealt;
  }

  snapshot(): { tentacleTicks: number; inkTicks: number; nextAttack: number; bornTick: number; attackTicks: [string, number][] } {
    return { tentacleTicks: this.tentacleTicks, inkTicks: this.inkTicks, nextAttack: this.nextAttack,
      bornTick: this.bornTick, attackTicks: [...this.attackTicks] };
  }

  static restore(world: World, state: BossState, clocks: ReturnType<BossSimulation['snapshot']>): BossSimulation {
    const result = new BossSimulation(world, state, clocks.bornTick);
    Object.assign(result.state, structuredClone(state));
    result.tentacleTicks = clocks.tentacleTicks; result.inkTicks = clocks.inkTicks;
    result.nextAttack = clocks.nextAttack; result.attackTicks = new Map(clocks.attackTicks);
    return result;
  }

  private add(attack: BossAttack, ticks: number): void {
    this.attackTicks.set(attack.id,ticks);this.state.attacks.push(attack);
  }

  step(tick: number, player: Player, damage: (amount:number)=>void): void {
    if(this.state.state==='locked'||tick===this.bornTick) return;
    const enteringPhase2=this.state.state==='active' && this.state.hp<=300 && this.state.phase===1;
    if(enteringPhase2) { this.state.phase=2;this.inkTicks=BOSS.inkTicks;this.state.inkRemaining=3; }
    this.state.attacks=this.state.attacks.filter(attack=>{
      let left=this.attackTicks.get(attack.id)!;let fired=false;
      if(attack.phase==='warning') {
        if(--left===0) {
          if(attack.type==='tentacle') { attack.phase='active';left=BOSS.activeTicks; }
          else { attack.phase='flying';left=BOSS.inkLifeTicks;fired=true; }
        }
      } else if(attack.type==='tentacle') left--;
      if(attack.type==='tentacle' && attack.phase==='active' && left>0 && !attack.hit &&
        Math.hypot(player.position.x-attack.position.x,player.position.z-attack.position.z)<=attack.radius+1e-9) {
        attack.hit=true;damage(BOSS.tentacleDamage);
      }
      if(attack.type==='ink' && attack.phase==='flying' && !fired) {
        const from=attack.position;const distance=BOSS.inkSpeed*STEP;
        const to={x:from.x+attack.direction.x*distance,y:from.y+attack.direction.y*distance,z:from.z+attack.direction.z*distance};attack.position=to;
        if(shopBlocks(from,to)) { this.attackTicks.delete(attack.id);return false; }
        if(hitsPlayer(from,to,player)) { damage(BOSS.inkDamage);this.attackTicks.delete(attack.id);return false; }
        left--;
      }
      if(left<=0) { this.attackTicks.delete(attack.id);return false; }
      this.attackTicks.set(attack.id,left);attack.remaining=left*STEP;return true;
    });
    // Existing hazards resolve in the lethal step, but a defeated body launches nothing new.
    if(this.state.state!=='active') return;
    if(--this.tentacleTicks<=0) {
      this.add({id:`tentacle-${this.nextAttack++}`,type:'tentacle',phase:'warning',position:{...player.position},radius:2,remaining:1.2,hit:false},BOSS.warningTicks);
      this.tentacleTicks=BOSS.tentacleTicks;
    }
    this.state.tentacleRemaining=this.tentacleTicks*STEP;
    if(this.state.phase===2 && !enteringPhase2) {
      if(--this.inkTicks<=0) {
        const position={...this.state.position,y:this.state.position.y+BODY.height/2};const target={...player.position,y:player.position.y+BODY.height/2};
        const delta={x:target.x-position.x,y:target.y-position.y,z:target.z-position.z};const length=Math.hypot(delta.x,delta.y,delta.z)||1;
        this.add({id:`ink-${this.nextAttack++}`,type:'ink',phase:'warning',position,direction:{x:delta.x/length,y:delta.y/length,z:delta.z/length},target,radius:BOSS.inkRadius,remaining:.8},BOSS.inkWarningTicks);
        this.inkTicks=BOSS.inkTicks;
      }
      this.state.inkRemaining=this.inkTicks*STEP;
    }
  }
}
