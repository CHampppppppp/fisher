import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game/game.ts';

function fishing() {
  const g = new Game();
  g.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}}});
  return g;
}
function hooked() {
  const g = fishing();
  g.dispatch({type:'primaryDown'}); g.advanceTicks(30); g.dispatch({type:'primaryUp'});
  g.advanceTicks(120); g.dispatch({type:'primaryDown'});
  return g;
}
function arena() {
  const g = new Game(); g.reset({seed:1,fixture:'fish-arena'});
  g.dispatch({type:'setMode',mode:'combat'}); return g;
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);

test('v2 charging keeps walking at four metres per second and casts from release position',()=>{
  const g=fishing();
  g.dispatch({type:'move',forward:0,strafe:1,sprint:true});
  g.dispatch({type:'primaryDown'});g.advanceTicks(30);
  near(g.getState().player.position.x,2);
  assert.equal(g.dispatch({type:'jump'}).accepted,false);
  g.dispatch({type:'primaryUp'}); const s=g.getState();
  near(s.fishing.cast!.origin.x,2);near(s.fishing.cast!.position.x,2);near(s.fishing.cast!.distance,10.5);
  g.advanceTicks(30);near(g.getState().player.position.x,2);
  assert.equal(g.dispatch({type:'move',forward:1,strafe:0,sprint:false}).accepted,false);
});

test('v2 counter-pull adds exactly ten progress and fifteen tension without consuming fish RNG',()=>{
  const base=hooked(), counter=hooked(), aligned=hooked();
  const dir=counter.getState().fishing.pullDirection;
  counter.dispatch({type:'pull',x:-dir.x,y:-dir.y});
  aligned.dispatch({type:'pull',x:dir.x,y:dir.y});
  const fishRng=counter.getState().fishRngState;
  base.advanceTicks(60);counter.advanceTicks(60);aligned.advanceTicks(60);
  near(base.getState().fishing.progress,20);near(counter.getState().fishing.progress,30);
  near(counter.getState().fishing.tension,85);near(aligned.getState().fishing.tension,70);
  assert.equal(counter.getState().fishRngState,fishRng);
});

test('v2 invalid pull is atomic and releasing removes the counter-pull gain',()=>{
  const g=hooked(),dir=g.getState().fishing.pullDirection;
  const before=g.getState().fishing;
  assert.equal(g.dispatch({type:'pull',x:2,y:0}).accepted,false);
  assert.deepEqual(g.getState().fishing,before);
  g.dispatch({type:'pull',x:-dir.x,y:-dir.y});g.dispatch({type:'primaryUp'});g.advanceTicks(30);
  near(g.getState().fishing.progress,0);near(g.getState().fishing.tension,30);
});

test('v2 fist hits on tick six and a single buffer joins the opposite hand at tick eighteen',()=>{
  const g=arena();
  g.dispatch({type:'primaryDown'});g.dispatch({type:'primaryUp'});
  const first=g.getState().attack.hand;
  assert.equal(g.getState().fish[0].hp,20);
  g.advanceTicks(5);assert.equal(g.getState().fish[0].hp,20);
  g.advanceTicks(1);assert.equal(g.getState().fish[0].hp,10);
  assert.equal(g.dispatch({type:'primaryDown'}).accepted,true);g.dispatch({type:'primaryUp'});
  assert.equal(g.getState().attack.queued,true);
  assert.equal(g.dispatch({type:'primaryDown'}).accepted,false);g.dispatch({type:'primaryUp'});
  g.advanceTicks(12);assert.equal(g.getState().attack.sequence,2);
  assert.notEqual(g.getState().attack.hand,first);
  g.advanceTicks(6);assert.equal(g.getState().fish[0].state,'groundedDead');
  assert.equal(g.getState().events.filter(e=>e.type==='fish_damage').length,2);
});

test('v2 holding primary never repeats and each real damage stores the actual impact point',()=>{
  const g=arena();g.dispatch({type:'primaryDown'});g.advanceTicks(60);
  assert.equal(g.getState().events.filter(e=>e.type==='fish_damage').length,1);
  const event=g.getState().events.find(e=>e.type==='fish_damage')!;
  assert.ok(event.position);near(event.position!.z,5);
});

test('v2 pause drops the buffered fist but freezes and completes the started fist once',()=>{
  const g=arena();g.dispatch({type:'primaryDown'});g.dispatch({type:'primaryUp'});
  g.dispatch({type:'primaryDown'});g.dispatch({type:'primaryUp'});g.advanceTicks(3);
  g.dispatch({type:'pause'});const frozen=g.getState();g.advanceTicks(600);
  assert.deepEqual(g.getState(),frozen);assert.equal(frozen.attack.queued,false);
  g.dispatch({type:'resume'});g.advanceTicks(30);
  assert.equal(g.getState().events.filter(e=>e.type==='fish_damage').length,1);
});

test('v2 a locked heavy attack keeps its timing after switching to fists',()=>{
  const g=arena();g.reset({seed:1,fixture:'fish-arena',initial:{unlockedWeapons:['hammer'],currentWeapon:'hammer'}});
  g.dispatch({type:'setMode',mode:'combat'});g.dispatch({type:'primaryDown'});g.dispatch({type:'primaryUp'});
  g.dispatch({type:'equip',weaponId:'fist'});g.advanceTicks(19);
  assert.equal(g.getState().fish[0].hp,20);assert.equal(g.dispatch({type:'primaryDown'}).accepted,false);
  g.dispatch({type:'primaryUp'});g.advanceTicks(1);
  assert.equal(g.getState().fish[0].state,'groundedDead');
  assert.equal(g.getState().attack.weaponId,'hammer');
});


test('v2 a rejected cooldown press remains held until its release edge',()=>{
  const g=arena();g.reset({seed:1,fixture:'fish-arena',initial:{unlockedWeapons:['club'],currentWeapon:'club'}});
  g.dispatch({type:'setMode',mode:'combat'});g.dispatch({type:'primaryDown'});g.dispatch({type:'primaryUp'});
  assert.equal(g.dispatch({type:'primaryDown'}).accepted,false);g.advanceTicks(42);
  assert.equal(g.dispatch({type:'primaryDown'}).accepted,false);
  g.dispatch({type:'primaryUp'});assert.equal(g.dispatch({type:'primaryDown'}).accepted,true);
});

test('v2 inconsistent completed-action cooldown save is rejected atomically',()=>{
  const g=arena();const file=g.exportSave();
  file.runtime.attackCooldownTicks=1;file.state.attackCooldownRemaining=1/60;
  const before=g.getState();assert.throws(()=>g.importSave(file));assert.deepEqual(g.getState(),before);
  g.advanceTicks(1);assert.doesNotThrow(()=>g.exportSave());
});
