import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.ts';

function meal(hunger=50, hp=100, species='sprat') {
  const g=new Game();g.reset({seed:1,fixture:'shore',initial:{selectedSlot:5,
    player:{hunger,hp},inventory:[{id:'meal',species},{id:'second',species}]}});
  return g;
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('eating commits only on tick120 and a held mouse never consumes a second fish',()=>{
  const g=meal();assert.equal(g.dispatch({type:'primaryDown'}).accepted,true);
  assert.equal(g.getState().eating.fishId,'meal');near(g.getState().player.hunger,50);
  g.advanceTicks(119);assert.equal(g.getState().eating.elapsedTicks,119);
  assert.equal(g.getState().inventory.length,2);assert.equal(g.getState().consumedFish.length,0);
  near(g.getState().player.hunger,50-119/600);
  assert.equal(g.dispatch({type:'eat',fishId:'second'}).accepted,false);
  assert.equal(g.getState().eating.elapsedTicks,119);
  g.advanceTicks(1);near(g.getState().player.hunger,61.8);
  assert.equal(g.getState().consumedFish[0].consumedTick,120);
  assert.equal(g.getState().events.filter(e=>e.type==='eat').length,1);
  g.advanceTicks(240);assert.equal(g.getState().inventory.length,1);
  assert.equal(g.dispatch({type:'primaryDown'}).accepted,false);
  g.dispatch({type:'primaryUp'});g.dispatch({type:'primaryDown'});g.advanceTicks(120);
  assert.equal(g.getState().inventory.length,0);assert.equal(g.getState().consumedFish.length,2);
});

test('release, switching and pause cancel without consuming and resuming requires a fresh full duration',()=>{
  for(const cancel of [{type:'primaryUp'},{type:'selectSlot',index:1},{type:'pause'},{type:'openSettings'}]) {
    const g=meal();g.dispatch({type:'primaryDown'});g.advanceTicks(60);g.dispatch(cancel);
    assert.equal(g.getState().eating.fishId,null);assert.equal(g.getState().inventory.length,2);
    if(g.getState().ui.menu==='settings')g.dispatch({type:'closeSettings'});
    if(g.getState().gamePhase==='paused')g.dispatch({type:'resume'});
    g.advanceTicks(120);assert.equal(g.getState().consumedFish.length,0);
    g.dispatch({type:'selectSlot',index:5});g.dispatch({type:'primaryDown'});g.advanceTicks(119);
    assert.equal(g.getState().consumedFish.length,0);g.advanceTicks(1);
    assert.equal(g.getState().consumedFish.length,1);
  }
});

test('food timing retains four recovery amounts, clamps and full hunger refuses to start',()=>{
  for(const [species,slot,recovery] of [['sprat',5,12],['bass',6,20],['tuna',7,30],['golden',8,40]] as const){
    const g=meal(50,80,species);g.dispatch({type:'selectSlot',index:slot});
    g.dispatch({type:'primaryDown'});g.advanceTicks(120);
    near(g.getState().player.hunger,50+recovery-.2);near(g.getState().player.hp,80);
  }
  const full=meal(100);assert.equal(full.dispatch({type:'primaryDown'}).accepted,false);
  assert.equal(full.getState().eating.fishId,null);assert.equal(full.getState().inventory.length,2);
  const clamp=meal(95);clamp.dispatch({type:'primaryDown'});clamp.advanceTicks(120);
  near(clamp.getState().player.hunger,100-1/600);
});

test('eating allows walking but does not suspend starvation, and death cancels without a meal event',()=>{
  const walking=meal();walking.dispatch({type:'move',forward:1,strafe:0,sprint:false});
  walking.dispatch({type:'primaryDown'});walking.advanceTicks(120);
  near(walking.getState().player.position.z,8);assert.equal(walking.getState().consumedFish.length,1);
  const dead=meal(0,1);dead.dispatch({type:'primaryDown'});dead.advanceTicks(120);
  assert.equal(dead.getState().gamePhase,'dead');assert.equal(dead.getState().eating.fishId,null);
  assert.equal(dead.getState().consumedFish.length,0);assert.equal(dead.getState().inventory.length,2);
});

test('save omits chewing input and restore never completes an unfinished meal',()=>{
  const g=meal();g.dispatch({type:'primaryDown'});g.advanceTicks(80);const save=g.exportSave();
  assert.equal(Object.hasOwn(save.state,'eating'),false);
  const restored=meal();restored.importSave(save);assert.equal(restored.getState().eating.fishId,null);
  restored.dispatch({type:'resume'});restored.advanceTicks(180);
  assert.equal(restored.getState().inventory.length,2);assert.equal(restored.getState().consumedFish.length,0);
});

test('invalid and overlapping actions cannot replace, shorten, or duplicate an eating transaction',()=>{
  const g=meal();assert.equal(g.dispatch({type:'eat',fishId:'meal',duration:0}).accepted,false);
  assert.equal(g.dispatch({type:'eat',fishId:'missing'}).accepted,false);
  assert.equal(g.dispatch({type:'eat',fishId:'meal'}).accepted,true);g.advanceTicks(50);
  for(const action of [{type:'eat',fishId:'meal'},{type:'eat',fishId:'second'},{type:'interact'},{type:'primaryDown'}])
    assert.equal(g.dispatch(action).accepted,false);
  assert.equal(g.getState().eating.elapsedTicks,50);g.advanceTicks(70);
  assert.equal(g.getState().consumedFish.length,1);
});
