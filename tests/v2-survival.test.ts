import {test} from 'node:test';import assert from 'node:assert/strict';
import {Game} from '../src/game/game.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function game(initial:unknown={}){const g=new Game();g.reset({seed:1,fixture:'shore',initial});return g;}
test('v2 nine slots share selection, reject locked/carried and eat the first species ID once',()=>{
 const g=game({player:{hunger:50},inventory:[{id:'a',species:'sprat'},{id:'b',species:'sprat'}]});
 assert.equal(g.getState().selectedSlot,0);assert.equal(g.dispatch({type:'selectSlot',index:2}).accepted,false);
 g.dispatch({type:'selectSlot',index:5});g.dispatch({type:'primaryDown'});g.advanceTicks(120);near(g.getState().player.hunger,61.8);assert.equal(g.getState().consumedFish[0].id,'a');
 g.dispatch({type:'primaryUp'});g.dispatch({type:'primaryDown'});g.advanceTicks(120);assert.equal(g.getState().inventory.length,0);
 g.dispatch({type:'cycleSlot',delta:-1});assert.equal(g.getState().selectedSlot,5); // locked hammer leaves selection intact
 g.dispatch({type:'selectSlot',index:0});g.dispatch({type:'cycleSlot',delta:-1});assert.equal(g.getState().selectedSlot,8);
 assert.equal(g.dispatch({type:'openInventory'}).accepted,false);
});
test('v2 walking off shore falls to water, swims and cannot pass through island',()=>{
 const g=game({player:{position:{x:0,y:1,z:9.6}}});g.dispatch({type:'move',forward:1,strafe:0,sprint:false});g.advanceTicks(90);
 assert.equal(g.getState().locomotion,'swimming');assert.ok(g.getState().player.position.y< -1.35);
 g.dispatch({type:'move',forward:-1,strafe:0,sprint:false});g.advanceTicks(120);assert.ok(g.getState().player.position.z>=10.3-1e-6);
 g.dispatch({type:'swim',vertical:1});g.advanceTicks(180);assert.equal(g.getState().locomotion,'ground');near(g.getState().player.position.y,1);
});
test('v2 oxygen exact boundary, combined drowning and pause, surface refill',()=>{
 const g=game({player:{position:{x:0,y:-8,z:12},oxygen:20}});g.dispatch({type:'swim',vertical:-1});g.advanceTicks(1200);
 near(g.getState().player.oxygen,0);near(g.getState().player.hp,100);g.advanceTicks(1);near(g.getState().player.hp,100-1/6);
 g.advanceTicks(59);near(g.getState().player.hp,90);g.dispatch({type:'pause'});const s=g.getState();g.advanceTicks(600);assert.deepEqual(g.getState(),s);
 const surface=game({player:{position:{x:0,y:-1.35,z:12},oxygen:0}});surface.dispatch({type:'swim',vertical:1});surface.advanceTicks(300);near(surface.getState().player.oxygen,20);
});
test('v2 water save restores exact oxygen and swimming state; invalid state rejected atomically',()=>{
 const g=game({player:{position:{x:0,y:-3,z:12},oxygen:7}});g.dispatch({type:'swim',vertical:-1});g.advanceTicks(13);const save=g.exportSave();
 const other=game();other.importSave(save);near(other.getState().player.oxygen,g.getState().player.oxygen);assert.equal(other.getState().verticalInput,0);
 const invalid=structuredClone(save);invalid.state.player.oxygen=21;const before=other.getState();assert.throws(()=>other.importSave(invalid));assert.deepEqual(other.getState(),before);
});

test('v2 malformed wheel and unsupported ground save reject atomically',()=>{
 const g=game();for(const delta of ['1',true,[1],null]){const before=g.getState().selectedSlot;assert.equal(g.dispatch({type:'cycleSlot',delta}).accepted,false);assert.equal(g.getState().selectedSlot,before);}
 const file=g.exportSave();file.state.player.position={x:30,y:8,z:0};file.state.locomotion='ground';const before=g.getState();assert.throws(()=>g.importSave(file));assert.deepEqual(g.getState(),before);
});

test('v2 jump then immediate pause exports legal airborne velocity before the first tick',()=>{
 const g=game();g.dispatch({type:'jump'});g.dispatch({type:'pause'});const saved=g.exportSave();assert.equal(saved.state.locomotion,'air');assert.equal(saved.runtime.velocityY,5);const restored=game();restored.importSave(saved);restored.dispatch({type:'resume'});restored.step();assert.ok(restored.getState().player.position.y>1);
});
test('v2 passive sinking plus horizontal swimming obeys the three-dimensional speed cap',()=>{
 const g=game({player:{position:{x:0,y:-3,z:12}}}),before=g.getState().player.position;g.dispatch({type:'move',forward:1,strafe:0,sprint:false});g.step();const after=g.getState().player.position;assert.ok(Math.hypot(after.x-before.x,after.y-before.y,after.z-before.z)<=2/60+1e-9);
});
test('v2 a surface swimmer within six tenths of a square corner can climb safely',()=>{
 const g=game({player:{position:{x:10.4,y:-1.35,z:10.4},yaw:-3*Math.PI/4}});g.dispatch({type:'move',forward:1,strafe:0,sprint:false});g.dispatch({type:'swim',vertical:1});g.step();assert.equal(g.getState().locomotion,'ground');near(g.getState().player.position.x,9.7);near(g.getState().player.position.z,9.7);
});
test('v2 square and ordinary circle water boundaries actually stop at sixty-four metres',()=>{
 const g=game({player:{position:{x:63.99,y:-1.35,z:12},yaw:Math.PI/2}});g.dispatch({type:'move',forward:1,strafe:0,sprint:true});g.advanceTicks(60);near(g.getState().player.position.x,64);
 const island=new Game();island.dispatch({type:'resume'});island.dispatch({type:'move',forward:1,strafe:1,sprint:true});island.advanceTicks(3600);const p=island.getState().player.position;assert.ok(Math.hypot(p.x,p.z)<=64+1e-8);assert.ok(Math.hypot(p.x,p.z)>63.99);
});
