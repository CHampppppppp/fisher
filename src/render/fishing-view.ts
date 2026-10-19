import {carriedPosition} from '../game/fishing.ts';
import * as THREE from 'three';
import { STEP } from '../game/types.ts';
import type { GameState } from '../game/types.ts';
import { FISH_SPECIES } from '../game/fish-species.ts';
import type { FishSpecies } from '../game/fish-species.ts';
import { createFishModel } from './fish-model.ts';
import { placementPreview } from '../game/fish-life.ts';
import { makeWorld } from '../game/world.ts';

/** Persistent objects: at most one line and one bobber, across all casts/resets. */
export class FishingView {
  private rod = new THREE.Group();
  private tip = new THREE.Object3D();
  private world = new THREE.Group();
  private bobber = new THREE.Group();
  private preview: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private points = new Float32Array(33 * 3);
  private tipPosition = new THREE.Vector3();
  private endPosition = new THREE.Vector3();
  private lastTick = -1;
  private bend = 0;
  private carried = new THREE.Group();
  private fishModels = new Map<FishSpecies, THREE.Group>();
  private camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    this.rod.name = 'fishing-rod'; this.bobber.name = 'fishing-bobber'; this.world.name = 'fishing-visuals';
    const base = new THREE.Vector3(0.32, -0.49, -0.52);
    const tip = new THREE.Vector3(0.56, 0.48, -1.85);
    const axis = tip.clone().sub(base);
    this.tip.position.copy(tip); this.rod.add(this.tip);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.019, axis.length(), 8),
      new THREE.MeshBasicMaterial({ color: 0x715346 }));
    shaft.position.copy(base).add(tip).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    this.rod.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0x3a4c43 }));
    grip.position.copy(base).add(axis.clone().normalize().multiplyScalar(0.06)); grip.quaternion.copy(shaft.quaternion); this.rod.add(grip);
    for (let i = 1; i <= 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.023 - i * 0.002, 0.004, 5, 10),
        new THREE.MeshBasicMaterial({ color: 0xe0c38a }));
      ring.position.copy(base).lerp(tip, i / 5);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize()); this.rod.add(ring);
    }
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.09, 14), new THREE.MeshBasicMaterial({ color: 0xc6a570 }));
    reel.position.set(0.31, -0.44, -0.64); reel.rotation.z = Math.PI / 2; this.rod.add(reel);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: 0x586e62 }));
    handle.position.set(0.25, -0.40, -0.64); this.rod.add(handle);
    camera.add(this.rod);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.22, 12), new THREE.MeshBasicMaterial({ color: 0xfff2d6 }));
    body.position.y = 0.10;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.065, 0.12, 12), new THREE.MeshBasicMaterial({ color: 0xe16a4c }));
    cap.position.y = 0.27; this.bobber.add(body, cap);
    const floatRing = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.015, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0xf9e3a7, transparent: true, opacity: 0.6 }));
    floatRing.rotation.x = Math.PI / 2; floatRing.position.y = -0.07; this.bobber.add(floatRing);
    this.world.add(this.bobber);

    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(this.points, 3));
    this.line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xfff1d5, transparent: true, opacity: 0.88 }));
    this.line.name = 'fishing-line'; this.line.frustumCulled = false; this.world.add(this.line);
    this.preview = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.026, 6, 32), new THREE.MeshBasicMaterial({ color: 0x8af0c3 }));
    this.preview.name = 'cast-preview'; this.preview.rotation.x = Math.PI / 2; this.world.add(this.preview);
    scene.add(this.world);
    for (const species of Object.keys(FISH_SPECIES) as FishSpecies[]) {
      const model = createFishModel(species); model.visible = false;
      this.fishModels.set(species, model); this.carried.add(model);
    }
    for(const side of [-1,1]) {
      const palm=new THREE.Mesh(new THREE.BoxGeometry(.16,.10,.22),new THREE.MeshBasicMaterial({color:0xd7a57c}));
      palm.position.set(side*.23,-.14,.04);palm.rotation.z=side*.22;this.carried.add(palm);
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.35),new THREE.MeshBasicMaterial({color:0x365e54}));
      arm.position.set(side*.27,-.19,.27);arm.rotation.x=-.18;this.carried.add(arm);
      for(let i=0;i<3;i++) {
        const finger=new THREE.Mesh(new THREE.BoxGeometry(.04,.08,.12),new THREE.MeshBasicMaterial({color:0xe7b58b}));
        finger.position.set(side*(.14+i*.045),-.08,-.05);this.carried.add(finger);
      }
    }
    this.world.add(this.carried);
  }

  update(state: GameState): void {
    const { fishing } = state;
    const active = state.mode === 'fishing';
    const waiting = fishing.cast !== null;
    const live=state.fish.find(fish=>fish.state==='carried');
    const species=(['sprat','bass','tuna','golden'] as const)[state.selectedSlot-5];
    const corpse=state.inventory.find(f=>f.species===species);
    const fish=live??(corpse?{...corpse,position:carriedPosition(state.player)}:undefined);
    this.carried.visible = Boolean(fish) && state.gamePhase === 'running';
    for (const [species, model] of this.fishModels) model.visible = fish?.species === species;
    if (fish) {
      this.carried.name = `carried-${fish.id}`;
      this.carried.position.set(fish.position.x, fish.position.y, -fish.position.z);
      this.carried.quaternion.copy(this.camera.quaternion);
    }
    this.rod.visible = active && !fish && state.attackCooldownRemaining===0 && state.gamePhase === 'running';
    this.bobber.visible = waiting; this.line.visible = waiting;
    this.preview.visible = (Boolean(live) || (active && !waiting)) && state.gamePhase === 'running';
    const targetBend = fishing.phase === 'charging' ? fishing.chargeSeconds * 0.32
      : fishing.phase === 'reeling' ? 0.10 + fishing.tension * 0.003 + (fishing.struggling ? 0.045 : 0) : 0;
    if (state.simulationTick < this.lastTick || this.lastTick < 0) this.bend = targetBend;
    else {
      const delta = Math.min(0.1, (state.simulationTick - this.lastTick) * STEP);
      this.bend += (targetBend - this.bend) * (1 - Math.exp(-delta * 15));
    }
    this.lastTick = state.simulationTick;
    const castAge=(state.simulationTick-fishing.lastCastTick)*STEP;
    const castSwing=castAge>=0&&castAge<.35?-.36*Math.sin(castAge/.35*Math.PI):0;
    this.rod.rotation.x = fishing.phase==='charging'?this.bend:castSwing+
      (fishing.phase==='reeling'?-.08+fishing.rodOffset.y*.24+fishing.pullDirection.y*fishing.tension/100*.18:0);
    this.rod.rotation.y = fishing.phase==='reeling'?-(fishing.rodOffset.x*.32+fishing.pullDirection.x*fishing.tension/100*.20):0;
    this.bobber.scale.setScalar(fishing.phase==='bite'?1.45:1);
    this.rod.rotation.z = fishing.phase === 'reeling' ? Math.sin(fishing.reelElapsed * (fishing.struggling ? 30 : 12)) * (fishing.struggling ? .022 : .008) : 0;
    if (this.preview.visible) {
      const target = fish ? placementPreview(makeWorld(state.fixture), state.player) : fishing.preview;
      const p = target.position;
      this.preview.position.set(p.x, fish ? 1.035 : fishing.preview.reason === 'land' ? 1.035 : 0.075, -p.z);
      this.preview.material.color.setHex(target.valid ? 0x8af0c3 : 0xff9274);
    }
    if (!fishing.cast) return;
    const p = fishing.cast.position;
    const wave = Math.sin(state.simulationTick * STEP * (fishing.struggling ? 20 : 2)) * (fishing.struggling ? .055 : .022);
    this.endPosition.set(p.x, (fishing.phase === 'bite' ? -.22 : .12) + wave, -p.z);
    this.bobber.position.copy(this.endPosition);
    this.rod.updateWorldMatrix(true, true); this.tip.getWorldPosition(this.tipPosition);
    for (let i = 0; i < 33; i++) {
      const t = i / 32;
      this.points[i * 3] = THREE.MathUtils.lerp(this.tipPosition.x, this.endPosition.x, t);
      this.points[i * 3 + 1] = THREE.MathUtils.lerp(this.tipPosition.y, this.endPosition.y + 0.30, t)
        - Math.sin(t * Math.PI) * Math.min(0.18, fishing.cast.distance * 0.006) * (1 - fishing.tension / 120);
      this.points[i * 3 + 2] = THREE.MathUtils.lerp(this.tipPosition.z, this.endPosition.z, t);
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.material.color.setHex(fishing.tension >= 90 ? 0xffb08a : 0xfff1d5);
  }

  dispose(): void {
    for (const root of [this.rod, this.world]) {
      root.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
        }
      });
      root.removeFromParent();
    }
  }
}
