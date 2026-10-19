import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game/game.ts';
import { FishingView } from '../src/render/fishing-view.ts';

function setup() {
  const game = new Game();
  game.reset({ seed: 1, fixture: 'shore', initial: { player: { position: { x: 0, y: 1, z: 9 } } } });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.1, 1000);
  camera.position.set(0, 2.62, -9); scene.add(camera);
  const view = new FishingView(scene, camera);
  const update = () => view.update(game.getState());
  update();
  const line = scene.getObjectByName('fishing-line') as THREE.Line<THREE.BufferGeometry>;
  const rod = scene.getObjectByName('fishing-rod')!;
  const bobber = scene.getObjectByName('fishing-bobber')!;
  const point = (index: number) => new THREE.Vector3().fromBufferAttribute(line.geometry.getAttribute('position'), index);
  return { game, scene, camera, view, update, line, rod, bobber, point };
}

test('held rod has a continuous leader before casting, following the camera and charge animation', () => {
  const h = setup();
  try {
    assert.equal(h.line.visible, true);
    assert.equal(h.bobber.visible, true);
    const tip = h.point(5), end = h.point(37);
    assert.ok(tip.y - end.y > 0.8, 'uncast leader must hang below the rod tip');
    const before = Array.from(h.line.geometry.getAttribute('position').array);
    h.camera.position.x = 5; h.camera.rotation.y = 0.7;
    assert.equal(h.game.dispatch({ type: 'primaryDown' }).accepted, true);
    h.game.advanceTicks(30); h.update();
    assert.equal(h.line.visible, true);
    assert.equal(h.bobber.visible, true);
    assert.notDeepEqual(Array.from(h.line.geometry.getAttribute('position').array), before);
    const reelWorld = h.rod.localToWorld(new THREE.Vector3(0.31, -0.44, -0.64));
    assert.ok(h.point(0).distanceTo(reelWorld) < 0.00001);
    assert.ok(h.point(5).distanceTo(h.point(6)) < 0.04, 'no break between guide and leader');
  } finally { h.view.dispose(); }
});

test('one persistent line connects the float after casting and returns to a short leader on cancellation', () => {
  const h = setup();
  const geometry = h.line.geometry;
  try {
    for (let i = 0; i < 3; i++) {
      h.game.dispatch({ type: 'primaryDown' }); h.game.advanceTicks(30);
      assert.equal(h.game.dispatch({ type: 'primaryUp' }).accepted, true); h.update();
      assert.equal(h.bobber.visible, true);
      assert.ok(h.point(37).distanceTo(h.bobber.localToWorld(new THREE.Vector3(0, 0.33, 0))) < 0.00001);
      h.game.advanceTicks(120); h.game.dispatch({ type: 'primaryDown' }); h.game.advanceTicks(10); h.update();
      assert.equal(h.game.getState().fishing.phase, 'reeling');
      assert.ok(h.point(37).distanceTo(h.bobber.localToWorld(new THREE.Vector3(0, 0.33, 0))) < 0.00001);
      h.game.dispatch({ type: 'cancelFishing' }); h.update();
      assert.equal(h.line.visible, true); assert.equal(h.bobber.visible, true);
      assert.ok(h.point(5).distanceTo(h.point(37)) < 1);
      assert.equal(h.line.geometry, geometry);
    }
    let lines = 0; h.scene.traverse(o => { if (o.name === 'fishing-line') lines++; });
    assert.equal(lines, 1);
  } finally { h.view.dispose(); }
  assert.equal(h.line.parent?.parent, null);
});

test('uncast leader hides with a stowed rod, menus or a carried fish', () => {
  const h = setup();
  try {
    assert.equal(h.game.dispatch({ type: 'selectSlot', index: 1 }).accepted, true); h.update();
    assert.equal(h.rod.visible, false); assert.equal(h.line.visible, false); assert.equal(h.bobber.visible, false);
    assert.equal(h.game.dispatch({ type: 'selectSlot', index: 0 }).accepted, true); h.update();
    assert.equal(h.line.visible, true);
    h.game.dispatch({ type: 'pause' }); h.update();
    assert.equal(h.line.visible, false); assert.equal(h.bobber.visible, false);
    h.game.reset({ seed: 1, fixture: 'shore', initial: { fish: [
      { id: 'held', species: 'sprat', state: 'carried', position: { x: 0, y: 1, z: 0 }, jumpTimer: 0 },
    ] } }); h.update();
    assert.equal(h.rod.visible, false); assert.equal(h.line.visible, false); assert.equal(h.bobber.visible, false);
  } finally { h.view.dispose(); }
});


test('the same suspended float follows the free line and launches without teleporting', () => {
  const h = setup();
  try {
    const float = h.bobber;
    const attached = () => {
      h.scene.updateMatrixWorld(true);
      assert.ok(h.point(37).distanceTo(float.localToWorld(new THREE.Vector3(0, .33, 0))) < 1e-5);
      assert.equal(float.getObjectByName('float-ring')!.visible, false);
    };
    attached();
    h.camera.rotation.y = .3;
    h.game.advanceTicks(1); h.update(); attached();
    h.game.dispatch({type:'primaryDown'});
    for(let i=0;i<30;i++){h.game.advanceTicks(1);h.update();attached();}
    const before=float.position.clone();
    h.game.dispatch({type:'primaryUp'});h.update();
    assert.ok(float.position.distanceTo(before)<1e-5,'release must start at the suspended float');
    h.game.advanceTicks(21);h.update();
    h.scene.updateMatrixWorld(true);
    assert.ok(h.point(37).distanceTo(float.localToWorld(new THREE.Vector3(0,.33,0)))<1e-5);
    assert.equal(float.getObjectByName('float-ring')!.visible,true);
    h.game.advanceTicks(99);h.update();h.scene.updateMatrixWorld(true);
    assert.equal(h.game.getState().fishing.phase,'bite');
    assert.ok(h.point(37).distanceTo(float.localToWorld(new THREE.Vector3(0,.33,0)))<1e-5,'bite enlargement must keep the line attached');
    h.game.advanceTicks(60);h.update();
    assert.equal(h.game.getState().fishing.cast,null,'missed bite retrieves the rig');
    attached();assert.equal(float.visible,true);
    h.game.dispatch({type:'selectSlot',index:1});h.update();assert.equal(float.visible,false);
    h.game.dispatch({type:'selectSlot',index:0});h.update();attached();assert.equal(float.visible,true);
    const floats:THREE.Object3D[]=[];h.scene.traverse(o=>{if(o.name==='fishing-bobber')floats.push(o);});
    assert.deepEqual(floats,[float]);
  } finally {h.view.dispose();}
});
