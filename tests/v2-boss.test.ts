import {bossPathClear} from '../src/game/boss.ts';
import {test} from 'node:test';import assert from 'node:assert/strict';import {Game} from '../src/game/game.ts';
function arena(){const g=new Game();g.reset({seed:1,fixture:'boss-arena'});return g;}
test('v2 boss warning locks a jump, lands on shore and uses its independent random stream',()=>{
 const g=arena(),rng=g.getState().fishRngState;g.advanceTicks(89);assert.equal(g.getState().boss.jumpPhase,'cooldown');g.advanceTicks(1);
 assert.equal(g.getState().boss.jumpPhase,'warning');const target=g.getState().boss.target;assert.ok(target.z<10);
 g.dispatch({type:'move',forward:0,strafe:1,sprint:false});g.advanceTicks(30);assert.equal(g.getState().boss.jumpPhase,'jumping');assert.deepEqual(g.getState().boss.target,target);
 g.advanceTicks(45);assert.equal(g.getState().boss.jumpPhase,'cooldown');assert.equal(g.getState().boss.position.y,3);assert.equal(g.getState().boss.cooldownTicks,60);assert.equal(g.getState().fishRngState,rng);
});
test('v2 boss contact is harmless and a landing shares sixty ticks protection and freezes in menus',()=>{
 const g=arena();g.reset({seed:1,fixture:'boss-arena',initial:{player:{position:{x:0,y:1,z:9.7}}}});
 g.advanceTicks(164);assert.equal(g.getState().player.hp,100);assert.equal(g.getState().boss.contactProtectionTicks,0);
 g.advanceTicks(1);assert.equal(g.getState().player.hp,85);assert.equal(g.getState().boss.contactProtectionTicks,60);
 g.advanceTicks(59);assert.equal(g.getState().player.hp,85);g.advanceTicks(1);assert.equal(g.getState().player.hp,85);
 g.dispatch({type:'pause'});const s=g.getState();g.advanceTicks(600);assert.deepEqual(g.getState(),s);
});
test('v2 a boss mid-jump save restores endpoints clocks and deterministic continuation',()=>{
 const g=arena();g.advanceTicks(130);const file=g.exportSave();const restored=arena();restored.importSave(file);restored.dispatch({type:'resume'});
 g.advanceTicks(20);restored.advanceTicks(20);assert.deepEqual(restored.getState().boss,g.getState().boss);
});

test('v2 illegal boss jump into the shop is rejected before any state changes',()=>{
 const g=arena(),save=g.exportSave(),b=save.state.boss;Object.assign(b,{jumpPhase:'warning',jumpTicks:30,cooldownTicks:0,target:{x:-6,y:3,z:0}});const before=g.getState();assert.throws(()=>g.importSave(save));assert.deepEqual(g.getState(),before);
});

test('v2 boss swept radius rounds shop corners without accepting a colliding path',()=>{
 assert.equal(bossPathClear({x:-3,y:3,z:3},{x:-3,y:3,z:3}),true);
 assert.equal(bossPathClear({x:-3.3,y:3,z:3},{x:-3.3,y:3,z:3}),false);
 assert.equal(bossPathClear({x:0,y:1,z:0},{x:-10,y:3,z:0}),false);
});
test('v2 actual victory rejects every gameplay family without replaying awards',()=>{
 const g=arena();g.reset({seed:1,fixture:'boss-arena',initial:{boss:{state:'active',hp:10,tentacleRemaining:4,inkRemaining:3}}});g.dispatch({type:'selectSlot',index:1});g.dispatch({type:'primaryDown'});g.advanceTicks(6);const won=g.getState();assert.equal(won.gamePhase,'victory');
 for(const action of [{type:'primaryDown'},{type:'resume'},{type:'interact'},{type:'move',forward:1,strafe:0,sprint:false},{type:'selectSlot',index:0},{type:'swim',vertical:-1},{type:'eat',fishId:'missing'},{type:'buy',weaponId:'club'},{type:'openShop'}])assert.equal(g.dispatch(action).accepted,false);
 g.advanceTicks(600);assert.equal(g.getState().simulationTick,won.simulationTick);assert.deepEqual(g.getState().stats,won.stats);assert.deepEqual(g.getState().events,won.events);
});
