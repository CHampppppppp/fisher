import {BODY,PHYSICS,STEP} from './types.ts';
import type {GameState,Position} from './types.ts';
import {SHOP,intersectsShop} from './world.ts';import type {World} from './world.ts';
export function inBounds(world:World,p:Position):boolean{return world.coast.kind==='square'?Math.abs(p.x)<=64&&Math.abs(p.z)<=64:Math.hypot(p.x,p.z)<=64;}
export function overlapsIsland(world:World,p:Position):boolean {
 const c=world.coast;return c.kind==='circle'?Math.hypot(p.x,p.z)<c.radius+BODY.radius-1e-9:
 Math.hypot(Math.max(0,Math.abs(p.x)-c.halfSize),Math.max(0,Math.abs(p.z)-c.halfSize))<BODY.radius-1e-9;
}
export function playerSpace(world:World,p:Position):boolean{return inBounds(world,p)&&p.y>=-8&&!intersectsShop(p)&&(p.y>=1||!overlapsIsland(world,p));}
export function overShopRoof(p:Position):boolean {
 return intersectsShop({...p,y:SHOP.bottom});
}
function slide(world:World,p:Position,dx:number,dz:number):Position {
 const next={...p};for(const [key,d]of [['x',dx],['z',dz]]as const){if(!d)continue;
 if(playerSpace(world,{...next,[key]:next[key]+d})){next[key]+=d;continue;}
 let lo=0,hi=1;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(playerSpace(world,{...next,[key]:next[key]+d*m}))lo=m;else hi=m;}next[key]+=d*lo;
 }return next;
}
/** Short collision-tested segments prevent a hit from teleporting through solid walls. */
export function knockbackPlayer(world:World,state:GameState,direction:{x:number;z:number},distance:number):void {
 const length=Math.hypot(direction.x,direction.z);
 if(length<1e-10||!Number.isFinite(length)||!Number.isFinite(distance)||distance<=0)return;
 const steps=Math.ceil(distance/.05),dx=direction.x/length*distance/steps,dz=direction.z/length*distance/steps;
 for(let i=0;i<steps;i++)state.player.position=slide(world,state.player.position,dx,dz);
 const p=state.player.position;
 const supported=Math.abs(p.y-world.surface)<1e-8&&overlapsIsland(world,p)||
  Math.abs(p.y-SHOP.bottom-SHOP.height)<1e-8&&overShopRoof(p);
 if(state.locomotion==='ground'&&!supported)state.locomotion='air';
}
function shorePoint(world:World,p:Position):Position {
 const c=world.coast;if(c.kind==='square')return{x:Math.max(-c.halfSize+BODY.radius,Math.min(c.halfSize-BODY.radius,p.x)),y:1,z:Math.max(-c.halfSize+BODY.radius,Math.min(c.halfSize-BODY.radius,p.z))};
 const length=Math.hypot(p.x,p.z)||1,scale=(c.radius-BODY.radius)/length;return{x:p.x*scale,y:1,z:p.z*scale};
}
export function stepLocomotion(world:World,state:GameState,input:{forward:number;strafe:number;sprint:boolean},velocityY:number):number {
 const p=state.player,old=p.position;const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
 let x=input.forward*sin+input.strafe*cos,z=input.forward*cos-input.strafe*sin;
 if(state.locomotion==='swimming'){
  const target=shorePoint(world,old),coast=world.coast;
  const dist=coast.kind==='circle'?Math.max(0,Math.hypot(old.x,old.z)-coast.radius):Math.hypot(Math.max(0,Math.abs(old.x)-coast.halfSize),Math.max(0,Math.abs(old.z)-coast.halfSize));
  if(state.verticalInput>0&&!state.submerged&&dist<=.6+1e-8&&x*(target.x-old.x)+z*(target.z-old.z)>0&&!intersectsShop(target)){
   p.position=target;state.locomotion='ground';state.submerged=false;return 0;
  }
  const speed=state.submerged?2:2.5,vertical=state.verticalInput;
  const drift=-.35,change=1.8*STEP;
  const desiredY=vertical?vertical*2:velocityY+Math.max(-change,Math.min(change,drift-velocityY));
  const length=Math.max(1,Math.hypot(x,z,desiredY/speed));x=x/length*speed*STEP;z=z/length*speed*STEP;
  p.position=slide(world,old,x,z);
  const vy=desiredY/length;
  const nextY=old.y+vy*STEP;
  p.position.y=Math.max(-8,Math.min(-1.35,nextY));
  velocityY=nextY<=-8||nextY>=-1.35?0:vy;
 }else{
  const speed=input.sprint&&state.fishing.phase!=='charging'?PHYSICS.sprint:PHYSICS.walk;
  const length=Math.max(1,Math.hypot(x,z));p.position=slide(world,old,x/length*speed*STEP,z/length*speed*STEP);
  const supported=overlapsIsland(world,p.position);
  if(velocityY!==0||p.position.y>1||!supported){
   const next=p.position.y+velocityY*STEP-.5*PHYSICS.gravity*STEP*STEP;velocityY-=PHYSICS.gravity*STEP;
   if(supported&&next<=1){p.position.y=1;velocityY=0;}else if(!supported&&next<=-1.35){p.position.y=-1.35;velocityY=0;state.locomotion='swimming';}else{p.position.y=next;state.locomotion='air';}
   if(velocityY<0&&old.y>=SHOP.bottom+SHOP.height&&p.position.y<SHOP.bottom+SHOP.height&&overShopRoof(p.position)){
    p.position.y=SHOP.bottom+SHOP.height;velocityY=0;state.locomotion='ground';
   }
  }else state.locomotion='ground';
 }
 state.submerged=p.position.y+1.62<0;return velocityY;
}
