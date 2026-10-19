import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game/game.ts';
import {BossSimulation,bossInitial} from '../src/game/boss.ts';
import {knockbackPlayer,playerSpace,stepLocomotion} from '../src/game/locomotion.ts';
import {makeWorld} from '../src/game/world.ts';
import type {BossAttack,Player} from '../src/game/types.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('a real landing damages and pushes the player once, with protection and pause preserving position',()=>{
 const g=new Game();g.reset({seed:1,fixture:'boss-arena'});g.advanceTicks(164);
 const before=g.getState();g.advanceTicks(1);const hit=g.getState(),dx=hit.player.position.x-before.player.position.x,dz=hit.player.position.z-before.player.position.z;
 close(before.player.hp-hit.player.hp,15);close(Math.hypot(dx,dz),1.2);
 assert.ok(dx*(before.player.position.x-hit.boss.position.x)+dz*(before.player.position.z-hit.boss.position.z)>0);
 const p=hit.player.position;g.advanceTicks(20);const protectedState=g.getState();close(protectedState.player.position.x,p.x);close(protectedState.player.position.z,p.z);close(protectedState.player.hp,85);
 g.dispatch({type:'pause'});const frozen=g.getState();g.advanceTicks(180);assert.deepEqual(g.getState(),frozen);
});
test('missed landing and ordinary proximity do not push the player',()=>{
 const g=new Game();g.reset({seed:1,fixture:'boss-arena'});g.advanceTicks(120);
 g.dispatch({type:'move',forward:0,strafe:1,sprint:true});g.advanceTicks(40);g.dispatch({type:'move',forward:0,strafe:0,sprint:false});
 const before=g.getState();g.advanceTicks(5);assert.deepEqual(g.getState().player.position,before.player.position);close(g.getState().player.hp,100);
});
test('tentacles, ink and exact-center fallback deliver deterministic finite hit directions only outside protection',()=>{
 for(const type of ['tentacle','ink'] as const)for(const protectedTicks of [0,30]){
  const world=makeWorld('shore'),b=new BossSimulation(world,bossInitial(3));
  const p:Player={position:{x:0,y:1,z:5},yaw:0,pitch:0,hp:100,hunger:100,oxygen:20};
  const attack:BossAttack=type==='tentacle'?{id:'a',type,phase:'active',position:{...p.position},radius:2,remaining:.3,hit:false}:
   {id:'a',type,phase:'flying',position:{x:0,y:1.9,z:4.9},direction:{x:0,y:0,z:1},target:{...p.position},radius:.18,remaining:5};
  b.state.attacks=[attack];b.state.contactProtectionTicks=protectedTicks;
  const restored=BossSimulation.restore(world,b.state,{...b.snapshot(),attackTicks:[['a',type==='tentacle'?18:300]]});
  const hits:{amount:number;direction:{x:number;z:number}}[]=[];
  restored.step(1,p,(amount,direction)=>hits.push({amount,direction}));
  assert.equal(hits.length,protectedTicks?0:1);
  if(hits.length){close(Math.hypot(hits[0].direction.x,hits[0].direction.z),1);assert.ok(type==='ink'?hits[0].direction.z>0:hits[0].direction.z<0);}
 }
 const world=makeWorld('shore'),b=new BossSimulation(world,bossInitial(3));
 const p:Player={position:{x:0,y:1,z:12},yaw:Math.PI/2,pitch:0,hp:100,hunger:100,oxygen:20};
 b.state.attacks=[{id:'a',type:'tentacle',phase:'active',position:{...p.position},radius:2,remaining:.3,hit:false}];
 const restored=BossSimulation.restore(world,b.state,{...b.snapshot(),attackTicks:[['a',18]]});
 restored.step(1,p,(_amount,direction)=>{close(direction.x,-1);close(direction.z,0);});
});
test('knockback sweeps into shop walls, slides along them and respects the world boundary',()=>{
 const world=makeWorld('shore');
 for(const [x,z,dx,dz] of [[-3.9,0,-1,0],[-3.9,-1,-1,1],[63.8,0,1,0]] as const){
  const g=new Game();g.reset({seed:1,fixture:'shore',initial:{player:{position:{x,y:1,z}}}});const s=g.getState();
  knockbackPlayer(world,s,{x:dx,z:dz},1.2);assert.ok(playerSpace(world,s.player.position));
  if(x===63.8)close(s.player.position.x,64);else assert.ok(s.player.position.x>=-4.2-1e-7);
  if(dz)assert.ok(s.player.position.z>z+.5,'blocked horizontal direction should still slide along wall');
 }
});
test('knockback can push off the island and existing gravity carries the player into swimming',()=>{
 const g=new Game();g.reset({seed:1,fixture:'shore',initial:{player:{position:{x:9.9,y:1,z:0}}}});const s=g.getState(),world=makeWorld('shore');
 knockbackPlayer(world,s,{x:1,z:0},1.2);close(s.player.position.x,11.1);assert.equal(s.locomotion,'air');
 let vy=0;for(let i=0;i<60;i++)vy=stepLocomotion(world,s,{forward:0,strafe:0,sprint:false},vy);
 assert.equal(s.locomotion,'swimming');assert.ok(s.player.position.y< -1.35);
});
test('a post-hit save restores the pushed position and continues deterministically without replaying knockback',()=>{
 const g=new Game();g.reset({seed:1,fixture:'boss-arena'});g.advanceTicks(165);const file=g.exportSave(),restored=new Game();restored.importSave(file);restored.dispatch({type:'resume'});
 g.advanceTicks(20);restored.advanceTicks(20);assert.deepEqual(restored.getState().player,g.getState().player);assert.deepEqual(restored.getState().boss,g.getState().boss);
});
test('a hit off the shop roof loses support immediately and that same tick can be saved and restored',()=>{
 for(const x of [-7.4,-7]){
 const g=new Game();g.reset({seed:1,fixture:'shore',initial:{rareCaughtCount:3,
  player:{position:{x,y:4.8,z:0}},boss:{state:'active',hp:600,tentacleRemaining:1/60,inkRemaining:3}}});
 g.advanceTicks(73);const hit=g.getState();assert.equal(hit.player.hp,85);assert.equal(hit.locomotion,x===-7?'ground':'air');
 const restored=new Game();restored.importSave(g.exportSave());assert.deepEqual(restored.getState().player,hit.player);
 restored.dispatch({type:'resume'});g.advanceTicks(10);restored.advanceTicks(10);assert.deepEqual(restored.getState().player,g.getState().player);
 assert.doesNotThrow(()=>restored.importSave(g.exportSave()));
 }
});
