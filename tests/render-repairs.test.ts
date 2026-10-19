import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {HangingLine} from '../src/render/rod-line.ts';import {createShopShell} from '../src/render/shop-model.ts';
import {FishingView} from '../src/render/fishing-view.ts';import {Game} from '../src/game/game.ts';

test('free line lags an anchor movement, remains attached, freezes and then settles under gravity',()=>{
 const tip=new THREE.Vector3(0,2,0),line=new HangingLine();line.reset(tip);
 tip.x=.5;line.advance(tip,1);assert.deepEqual(line.points[0].toArray(),tip.toArray());
 assert.ok(line.points[32].x<.3,'free end must lag instead of rigidly following the rod');
 const frozen=line.points.map(p=>p.toArray());line.advance(tip,0);assert.deepEqual(line.points.map(p=>p.toArray()),frozen);
 line.advance(tip,240);line.advance(tip,240);assert.ok(Math.abs(line.points[32].x-tip.x)<.035);
 assert.ok(line.points[32].y<tip.y-.85);assert.ok(line.points.every(p=>p.toArray().every(Number.isFinite)));
});
test('shop posts join side walls without coplanar overlapping strips',()=>{
 const shell=createShopShell();shell.updateMatrixWorld(true);
 for(const side of [-1.42,1.42]){
  const post=new THREE.Box3().setFromObject(shell.getObjectByName(`shop-post-${side}`)!);
  const wall=new THREE.Box3().setFromObject(shell.getObjectByName(`shop-side-${side}`)!);
  assert.ok(Math.abs(post.max.z-wall.min.z)<1e-7,'the two wood surfaces must meet, not overlap');
 }
 shell.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}});
});
function view(){const g=new Game();g.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}}});
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,16/9,.05,2000);camera.position.set(0,2.62,-9);scene.add(camera);
 const v=new FishingView(scene,camera);v.update(g.getState());return{g,v,scene,camera,bobber:scene.getObjectByName('fishing-bobber')!};}
test('cast float follows a visible arc for 21 production ticks instead of teleporting to the water',()=>{
 const h=view();try{h.g.dispatch({type:'primaryDown'});h.g.advanceTicks(30);h.v.update(h.g.getState());h.g.dispatch({type:'primaryUp'});h.v.update(h.g.getState());
 const start=h.bobber.position.clone();assert.ok(start.y>1);assert.equal(h.bobber.getObjectByName('float-ring')!.visible,false);
 h.g.advanceTicks(7);h.v.update(h.g.getState());assert.ok(h.bobber.position.y>start.y);assert.ok(h.bobber.position.z<start.z);
 const beforePause=h.bobber.position.clone();h.g.dispatch({type:'pause'});h.g.advanceTicks(60);h.v.update(h.g.getState());assert.ok(h.bobber.position.equals(beforePause));
 h.g.dispatch({type:'resume'});h.g.advanceTicks(14);h.v.update(h.g.getState());const cast=h.g.getState().fishing.cast!;
 assert.ok(Math.abs(h.bobber.position.z+cast.position.z)<1e-6);assert.ok(h.bobber.position.y<.2);assert.equal(h.bobber.getObjectByName('float-ring')!.visible,true);
 }finally{h.v.dispose();}});
test('reeling moves the float along each production direction without modifying gameplay state',()=>{
 for(const [x,y]of [[1,0],[0,1],[-1,0],[0,-1]]){const h=view();try{
 h.g.dispatch({type:'primaryDown'});h.g.advanceTicks(30);h.g.dispatch({type:'primaryUp'});h.g.advanceTicks(120);h.g.dispatch({type:'primaryDown'});
 const s=h.g.getState();s.fishing.pullDirection={x,y};h.v.update(s);const cast=s.fishing.cast!;
 for(let i=0;i<45;i++){s.simulationTick++;h.v.update(s);}
 const dx=h.bobber.position.x-cast.position.x,dz=-h.bobber.position.z-cast.position.z;
 assert.ok(dx*x+dz*y>.8,`float should reveal ${x},${y} visually`);
 const frozen=structuredClone(s);h.v.update(s);assert.deepEqual(s,frozen);
 }finally{h.v.dispose();}}
});
