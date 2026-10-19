import {test} from 'node:test';import assert from 'node:assert/strict';
import {Game} from '../src/game/game.ts';
import {BossSimulation,bossInitial} from '../src/game/boss.ts';
import {makeWorld} from '../src/game/world.ts';
import {bindingAction,defaultSettings,updateSettings} from '../src/game/settings.ts';
import type {Player} from '../src/game/types.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('selecting another or current hotbar slot preserves held movement and vertical swimming input',()=>{
 for(const index of [0,1]){const g=new Game();g.reset({seed:1,fixture:'shore'});
 g.dispatch({type:'move',forward:1,strafe:0,sprint:true});g.advanceTicks(15);
 assert.equal(g.dispatch({type:'selectSlot',index}).accepted,true);g.advanceTicks(15);near(g.getState().player.position.z,3);}
 const g=new Game();g.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:-3,z:12}}}});
 g.dispatch({type:'swim',vertical:-1});g.dispatch({type:'selectSlot',index:1});g.advanceTicks(30);near(g.getState().player.position.y,-4);
});
test('charging continues across the supported edge, cancelling only when entering the water',()=>{
 const g=new Game();g.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9.8}}}});
 g.dispatch({type:'primaryDown'});g.dispatch({type:'move',forward:1,strafe:0,sprint:false});g.advanceTicks(4);
 assert.equal(g.getState().fishing.phase,'charging');assert.ok(g.getState().player.position.z>10);
 g.advanceTicks(20);assert.equal(g.getState().fishing.phase,'idle');assert.ok(g.getState().player.position.z>=10.3);
});
test('default right Ctrl dives, is reserved by alias conflicts, and disappears after rebinding dive',()=>{
 const defaults=defaultSettings();assert.equal(bindingAction(defaults,'ControlRight'),'dive');
 assert.throws(()=>updateSettings(defaults,{bindings:{slot2:'ControlRight'}}));
 const next=updateSettings(defaults,{bindings:{dive:'KeyC',slot2:'ControlRight'}});
 assert.equal(bindingAction(next,'ControlRight'),'slot2');assert.equal(bindingAction(next,'ControlLeft'),undefined);assert.equal(bindingAction(next,'KeyC'),'dive');
});
function slam(){const player:Player={position:{x:0,y:1,z:9.7},yaw:0,pitch:0,hp:100,hunger:100,oxygen:20};const b=new BossSimulation(makeWorld('shore'),bossInitial(3));const hits:number[]=[];let tick=0;return{b,player,hits,step(n:number){for(let i=0;i<n;i++)b.step(++tick,player,d=>hits.push(d));}};}
test('Boss contact is harmless until the exact landing tick, and landing never repeats damage',()=>{
 const h=slam();h.step(90);assert.deepEqual(h.hits,[]);assert.equal(h.b.state.jumpPhase,'warning');h.step(30);
 h.player.position={x:h.b.state.target.x,y:1,z:h.b.state.target.z};h.step(44);assert.deepEqual(h.hits,[]);
 h.step(1);assert.deepEqual(h.hits,[15]);assert.equal(h.b.state.contactProtectionTicks,60);h.step(59);assert.deepEqual(h.hits,[15]);
});
test('Boss slam radius and vertical boundaries match the player cylinder and visible warning',()=>{
 for(const [offset,y,hit]of [[2.8,1,true],[2.8001,1,false],[0,1.5001,false]] as const){const h=slam();h.step(120);h.player.position={x:h.b.state.target.x+offset,y,z:h.b.state.target.z};h.step(45);assert.equal(h.hits.length,hit?1:0);}
});
test('near-zero starvation health reaches the terminal state without a floating-point ghost HP',()=>{
 // One ULP above ten damage ticks leaves a positive residual without normalization.
 const g=new Game();g.reset({seed:1,fixture:'shore',initial:{player:{hp:1/3+Number.EPSILON/4,hunger:0}}});g.advanceTicks(10);
 assert.equal(g.getState().player.hp,0);assert.equal(g.getState().gamePhase,'dead');assert.equal(g.getState().events.filter(e=>e.type==='game_over').length,1);
});
