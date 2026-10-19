import { BODY, STEP } from './types.ts';
import type { BossAttack, BossState, InitialBoss, Player, Position } from './types.ts';
import type { World } from './world.ts';
import {SHOP,landAtCenter} from './world.ts';
import { shopBlocks } from './fishing.ts';

export const BOSS = Object.freeze({ id: 'octopus', hp: 600, radius: 2, tentacleTicks: 240, warningTicks: 72,
  activeTicks: 18, tentacleDamage: 15, slamRadius: 2.5, slamDamage: 15, playerKnockback: 1.2, inkTicks: 180, inkWarningTicks: 48, inkSpeed: 6, inkLifeTicks: 300, inkRadius: .18, inkDamage: 10 });

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

export function bossPathClear(from:Position,to:Position):boolean {
  const dx=to.x-from.x,dz=to.z-from.z,minX=SHOP.x-SHOP.halfWidth,maxX=SHOP.x+SHOP.halfWidth,minZ=SHOP.z-SHOP.halfDepth,maxZ=SHOP.z+SHOP.halfDepth;
  let low=0,high=1,intersects=true;
  for(const [start,delta,min,max]of [[from.x,dx,minX,maxX],[from.z,dz,minZ,maxZ]]){
    if(Math.abs(delta)<1e-12){if(start<min||start>max)intersects=false;}
    else{const a=(min-start)/delta,b=(max-start)/delta;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));}
  }
  if(intersects&&low<=high)return false;
  const pointBox=(p:Position)=>Math.hypot(Math.max(minX-p.x,0,p.x-maxX),Math.max(minZ-p.z,0,p.z-maxZ));
  let distance=Math.min(pointBox(from),pointBox(to));const length=dx*dx+dz*dz;
  for(const x of [minX,maxX])for(const z of [minZ,maxZ]){const t=length?Math.max(0,Math.min(1,((x-from.x)*dx+(z-from.z)*dz)/length)):0;distance=Math.min(distance,Math.hypot(x-from.x-dx*t,z-from.z-dz*t));}
  return distance>=BOSS.radius-1e-9;
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

  constructor(private world: World, initial = bossInitial(0), private bornTick = 0, seed=1) {
    this.tentacleTicks=Math.ceil(initial.tentacleRemaining/STEP-1e-9);this.inkTicks=Math.ceil(initial.inkRemaining/STEP-1e-9);
    this.state={...initial,id:BOSS.id,position:{x:0,y:world.surface,z:(world.coast.kind==='square'?world.coast.halfSize:world.coast.radius)+BOSS.radius},
      radius:BOSS.radius,phase:initial.state==='locked'||initial.hp>300?1:2,attacks:[],jumpPhase:'cooldown',jumpTicks:0,start:{x:0,y:1,z:(world.coast.kind==='square'?world.coast.halfSize:world.coast.radius)+2},target:{x:0,y:1,z:(world.coast.kind==='square'?world.coast.halfSize:world.coast.radius)+2},cooldownTicks:90,contactProtectionTicks:0,bossRngState:((seed^0x85ebca6b)>>>0)||1};
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

  private leap(player:Player):void {
    const b=this.state;
    if(b.jumpPhase==='cooldown'){
      if(--b.cooldownTicks>0)return;
      let r=b.bossRngState;r^=r<<13;r^=r>>>17;r^=r<<5;b.bossRngState=r>>>0;
      const jitter=b.bossRngState/4294967296*2-1,dx=player.position.x-b.position.x,dz=player.position.z-b.position.z;
      const dist=Math.hypot(dx,dz),length=dist||1;let x=dx/length*Math.min(6,dist)+dz/length*jitter,z=dz/length*Math.min(6,dist)-dx/length*jitter;
      let target:Position|null=null;
      for(const angle of [0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2]){
        const point={x:b.position.x+x*Math.cos(angle)-z*Math.sin(angle),y:1,z:b.position.z+x*Math.sin(angle)+z*Math.cos(angle)};
        if(Math.hypot(point.x,point.z)>64||!bossPathClear(b.position,point))continue;
        point.y=landAtCenter(this.world,point)?3:1;target=point;break;
      }
      if(!target){b.cooldownTicks=60;return;}
      b.start={...b.position};b.target=target;b.jumpPhase='warning';b.jumpTicks=30;
    }else if(b.jumpPhase==='warning'){
      if(--b.jumpTicks===0){b.jumpPhase='jumping';b.jumpTicks=45;}
    }else{
      const t=(45- --b.jumpTicks)/45;b.position={x:b.start.x+(b.target.x-b.start.x)*t,y:b.start.y+(b.target.y-b.start.y)*t+3*Math.sin(Math.PI*t),z:b.start.z+(b.target.z-b.start.z)*t};
      if(b.jumpTicks===0){b.position={...b.target};b.jumpPhase='cooldown';b.cooldownTicks=60;}
    }
  }

  step(tick: number, player: Player, applyDamage: (amount:number,direction:{x:number;z:number})=>void): void {
    if(this.state.state==='locked'||tick===this.bornTick) return;
    const damage=(amount:number,source:Position,incoming?:Position)=>{
      if(this.state.contactProtectionTicks>0)return;
      let x=incoming?.x??player.position.x-source.x,z=incoming?.z??player.position.z-source.z;
      let length=Math.hypot(x,z);
      if(length<1e-10){x=player.position.x-this.state.position.x;z=player.position.z-this.state.position.z;length=Math.hypot(x,z);}
      if(length<1e-10){x=-Math.sin(player.yaw);z=-Math.cos(player.yaw);length=1;}
      applyDamage(amount,{x:x/length,z:z/length});this.state.contactProtectionTicks=60;
    };
    if(this.state.contactProtectionTicks>0)this.state.contactProtectionTicks--;
    if(this.state.state==='active'){
      const wasJumping=this.state.jumpPhase==='jumping';
      this.leap(player);const p=this.state.position,q=player.position;
      const surface=landAtCenter(this.world,p)?1:0;
      if(wasJumping&&this.state.jumpPhase==='cooldown'&&
        Math.hypot(p.x-q.x,p.z-q.z)<=BOSS.slamRadius+BODY.radius+1e-9&&
        q.y<=surface+.5+1e-9&&q.y+BODY.height>=surface-1e-9)damage(BOSS.slamDamage,p);
    }
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
        attack.hit=true;damage(BOSS.tentacleDamage,attack.position);
      }
      if(attack.type==='ink' && attack.phase==='flying' && !fired) {
        const from=attack.position;const distance=BOSS.inkSpeed*STEP;
        const to={x:from.x+attack.direction.x*distance,y:from.y+attack.direction.y*distance,z:from.z+attack.direction.z*distance};attack.position=to;
        if(shopBlocks(from,to)) { this.attackTicks.delete(attack.id);return false; }
        if(hitsPlayer(from,to,player)) { damage(BOSS.inkDamage,from,attack.direction);this.attackTicks.delete(attack.id);return false; }
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
