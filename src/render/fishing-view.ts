import {carriedPosition} from '../game/fishing.ts';
import * as THREE from 'three';
import { STEP } from '../game/types.ts';
import type { GameState } from '../game/types.ts';
import { FISH_SPECIES } from '../game/fish-species.ts';
import type { FishSpecies } from '../game/fish-species.ts';
import { createFishModel } from './fish-model.ts';
import { placementPreview } from '../game/fish-life.ts';
import { landAtCenter, makeWorld } from '../game/world.ts';
import { EAT_DURATION_TICKS } from '../game/survival.ts';
import { HangingLine } from './rod-line.ts';

/** Persistent objects: at most one line and one bobber, across all casts/resets. */
export class FishingView {
  private rod = new THREE.Group();
  private tip = new THREE.Object3D();
  private world = new THREE.Group();
  private bobber = new THREE.Group();
  private preview: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private guides: THREE.Vector3[] = [new THREE.Vector3(0.31, -0.44, -0.64)];
  private points = new Float32Array((6 + 32) * 3);
  private guidePosition = new THREE.Vector3();
  private tipPosition = new THREE.Vector3();
  private endPosition = new THREE.Vector3();
  private leader = new HangingLine();
  private leaderReady = false;
  private castId: number | null = null;
  private launchPosition = new THREE.Vector3();
  private launchRotation = new THREE.Quaternion();
  private uprightRotation = new THREE.Quaternion();
  private floatAxis = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private castBackAngle = 0;
  private drift = new THREE.Vector2();
  private driftTarget = new THREE.Vector2();
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
      // Run along the edge of each guide, clear of the solid rod shaft.
      this.guides.push(ring.position.clone().add(new THREE.Vector3((0.023 - i * 0.002) * 0.85, 0, 0)));
    }
    this.tip.position.copy(this.guides[5]);
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
    floatRing.name='float-ring';floatRing.rotation.x = Math.PI / 2; floatRing.position.y = -0.07; this.bobber.add(floatRing);
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
    const resetVisuals=this.lastTick<0||state.simulationTick<this.lastTick;
    const ticks=resetVisuals?0:state.simulationTick-this.lastTick;
    if(resetVisuals){this.leaderReady=false;this.castId=null;this.drift.set(0,0);}
    const active = state.mode === 'fishing';
    const waiting = fishing.cast !== null;
    const live=state.fish.find(fish=>fish.state==='carried');
    const species=(['sprat','bass','tuna','golden'] as const)[state.selectedSlot-5];
    const corpse=state.inventory.find(f=>f.id===state.eating.fishId)??state.inventory.find(f=>f.species===species);
    const fish=live??(corpse?{...corpse,position:carriedPosition(state.player)}:undefined);
    this.carried.visible = Boolean(fish) && state.gamePhase === 'running';
    for (const [species, model] of this.fishModels) model.visible = fish?.species === species;
    if (fish) {
      this.carried.name = `carried-${fish.id}`;
      this.carried.position.set(fish.position.x, fish.position.y, -fish.position.z);
      this.carried.quaternion.copy(this.camera.quaternion);
      if (state.eating.fishId !== null) {
        const progress = state.eating.elapsedTicks / EAT_DURATION_TICKS;
        const lift = Math.sin(Math.min(1, progress * 5) * Math.PI / 2);
        const chew = Math.sin(state.eating.elapsedTicks * Math.PI / 12);
        this.carried.translateY(lift * 0.18 + chew * 0.015);
        this.carried.translateZ(lift * 0.24);
        this.carried.rotateX(chew * 0.025);
      }
    }
    this.rod.visible = active && !fish && state.attackCooldownRemaining===0 && state.gamePhase === 'running';
    this.line.visible = waiting || this.rod.visible; this.bobber.visible = this.line.visible;
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
    const newCast=fishing.cast!==null&&fishing.cast.id!==this.castId;
    if(newCast)this.castBackAngle=Math.max(.12,this.rod.rotation.x);
    const castSwing=fishing.cast&&castAge>=0&&castAge<.35?this.castBackAngle*(1-castAge/.35)-.48*Math.sin(castAge/.35*Math.PI):0;
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
    if (!this.line.visible) return;
    this.rod.updateWorldMatrix(true, true); this.tip.getWorldPosition(this.tipPosition);
    if (fishing.cast) {
      if(newCast){
        this.castId=fishing.cast.id;
        this.launchPosition.copy(this.leaderReady?this.bobber.position:this.tipPosition);
        this.launchRotation.copy(this.leaderReady?this.bobber.quaternion:this.uprightRotation);
        this.drift.set(0,0);
      }
      this.leaderReady=false;
      const p = fishing.cast.position;
      const wave = Math.sin(state.simulationTick * STEP * (fishing.struggling ? 20 : 2)) * (fishing.struggling ? .055 : .022);
      this.endPosition.set(p.x, (fishing.phase === 'bite' ? -.22 : .12) + wave, -p.z);
      if(fishing.phase==='reeling'){
        const amount=1-Math.exp(-ticks*STEP*8);
        this.drift.lerp(this.driftTarget.set(fishing.pullDirection.x,fishing.pullDirection.y),amount);
        const yaw=fishing.cast.yaw,c=Math.cos(yaw),s=Math.sin(yaw);
        const x=p.x+(c*this.drift.x+s*this.drift.y*1.6)*1.15;
        const z=p.z+(-s*this.drift.x+c*this.drift.y*1.6)*1.15;
        if(!landAtCenter(makeWorld(state.fixture),{x,y:0,z}))this.endPosition.set(x,this.endPosition.y,-z);
      }else this.drift.set(0,0);
      if(castAge>=0&&castAge<.35){
        const t=castAge/.35;this.endPosition.lerpVectors(this.launchPosition,this.endPosition,t);
        this.endPosition.y+=2*Math.sin(Math.PI*t);
        this.bobber.quaternion.slerpQuaternions(this.launchRotation,this.uprightRotation,t);
      }else this.bobber.quaternion.copy(this.uprightRotation);
      this.bobber.getObjectByName('float-ring')!.visible=castAge>=.35;
      this.bobber.position.copy(this.endPosition);
      this.endPosition.add(this.floatAxis.set(0,.33,0).applyQuaternion(this.bobber.quaternion).multiplyScalar(this.bobber.scale.y));
    } else {
      this.castId=null;
      if(!this.leaderReady||this.leader.points[0].distanceTo(this.tipPosition)>5){this.leader.reset(this.tipPosition);this.leaderReady=true;}
      this.leader.advance(this.tipPosition,state.gamePhase==='running'?ticks:0);
      this.endPosition.copy(this.leader.points[32]);
      this.floatAxis.subVectors(this.leader.points[31],this.endPosition).normalize();
      if(this.floatAxis.lengthSq()<1e-10)this.floatAxis.copy(this.up);
      this.bobber.quaternion.setFromUnitVectors(this.up,this.floatAxis);
      this.bobber.position.copy(this.endPosition).addScaledVector(this.floatAxis,-.33);
      this.bobber.getObjectByName('float-ring')!.visible=false;
    }
    for (let i = 0; i < this.guides.length; i++) {
      this.guidePosition.copy(this.guides[i]).applyMatrix4(this.rod.matrixWorld);
      this.guidePosition.toArray(this.points, i * 3);
    }
    const sag = fishing.cast ? Math.min(0.18, fishing.cast.distance * 0.006) * (1 - fishing.tension / 120) : 0.04;
    for (let i = 1; i <= 32; i++) {
      const t = i / 32;
      const index = (this.guides.length + i - 1) * 3;
      if(!fishing.cast)this.leader.points[i].toArray(this.points,index);
      else{
        this.points[index] = THREE.MathUtils.lerp(this.tipPosition.x, this.endPosition.x, t);
        this.points[index + 1] = THREE.MathUtils.lerp(this.tipPosition.y, this.endPosition.y, t) - Math.sin(t * Math.PI) * sag;
        this.points[index + 2] = THREE.MathUtils.lerp(this.tipPosition.z, this.endPosition.z, t);
      }
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.material.color.setHex(fishing.cast && fishing.tension >= 90 ? 0xffb08a : 0xfff1d5);
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
