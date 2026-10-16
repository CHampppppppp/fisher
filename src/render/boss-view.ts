import * as THREE from 'three';
import type { BossAttack, GameState } from '../game/types.ts';
import { BOSS } from '../game/boss.ts';

function release(group: THREE.Group): void {
  group.traverse(object=>{
    if(!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
    object.geometry.dispose();
    for(const material of Array.isArray(object.material)?object.material:[object.material]) material.dispose();
  });group.removeFromParent();
}

/** All positions, phases and pulses read the production fixed tick; geometry never causes damage. */
export class BossView {
  private root=new THREE.Group();
  private body=new THREE.Group();
  private skin=new THREE.MeshStandardMaterial({color:0x775d91,roughness:.58});
  private models=new Map<string,THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.root.name='boss-and-attacks';scene.add(this.root);this.root.add(this.body);this.body.scale.z=-1;
    const head=new THREE.Mesh(new THREE.SphereGeometry(BOSS.radius,32,20),this.skin);head.castShadow=true;head.name='boss-body-collider';this.body.add(head);
    for(const x of [-.57,.57]) {
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.25,12,8),new THREE.MeshStandardMaterial({color:0xf1e0b7}));eye.position.set(x,.66,-1.81);this.body.add(eye);
      const pupil=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),new THREE.MeshBasicMaterial({color:0x172d36}));pupil.position.set(x,.66,-2.02);this.body.add(pupil);
    }
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4;const x=Math.sin(angle);const z=Math.cos(angle);
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(x*1.15,-.58,z*1.15),new THREE.Vector3(x*2,-.78,z*2),new THREE.Vector3(x*2.8,-.84,z*2.8),new THREE.Vector3(x*3.1,-.44,z*3.1)]);
      const arm=new THREE.Mesh(new THREE.TubeGeometry(curve,16,.17,8,false),new THREE.MeshStandardMaterial({color:0x665276,roughness:.7}));arm.castShadow=true;this.body.add(arm);
      for(let j=0;j<3;j++) {
        const sucker=new THREE.Mesh(new THREE.SphereGeometry(.065,6,4),new THREE.MeshBasicMaterial({color:0xc99cb1}));sucker.position.set(x*(2+j*.3),-.63,z*(2+j*.3));this.body.add(sucker);
      }
    }
  }

  private build(attack: BossAttack): THREE.Group {
    const group=new THREE.Group();group.name=`boss-attack-${attack.id}`;this.root.add(group);
    if(attack.type==='tentacle') {
      const disc=new THREE.Mesh(new THREE.CircleGeometry(attack.radius,48),new THREE.MeshBasicMaterial({color:0xe17152,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide}));
      disc.rotation.x=-Math.PI/2;disc.name='zone-disc';group.add(disc);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(attack.radius,.045,6,48),new THREE.MeshBasicMaterial({color:0xffb889}));ring.rotation.x=-Math.PI/2;group.add(ring);
      const spikes=new THREE.Group();spikes.name='tentacle-rise';group.add(spikes);
      for(let i=0;i<4;i++) {
        const angle=i*Math.PI/2;const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(Math.sin(angle)*1.2,0,Math.cos(angle)*1.2),new THREE.Vector3(Math.sin(angle)*.8,1.1,Math.cos(angle)*.8),new THREE.Vector3(Math.sin(angle)*.3,1.8,Math.cos(angle)*.3)]);
        spikes.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,.12,6,false),new THREE.MeshStandardMaterial({color:0x694869,roughness:.65})));
      }
    } else {
      const sphere=new THREE.Mesh(new THREE.SphereGeometry(attack.radius,12,8),new THREE.MeshStandardMaterial({color:0x172b39,emissive:0x301539,emissiveIntensity:.6,roughness:.4}));sphere.name='ink-shot';group.add(sphere);
      const halo=new THREE.Mesh(new THREE.SphereGeometry(attack.radius*1.5,10,8),new THREE.MeshBasicMaterial({color:0x906398,transparent:true,opacity:.24,depthWrite:false}));halo.name='ink-halo';group.add(halo);
      const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(attack.target.x-attack.position.x,attack.target.y-attack.position.y,-attack.target.z+attack.position.z)]);
      const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xe5b2e1,transparent:true,opacity:.9,depthTest:false}));line.name='ink-direction';group.add(line);
      const marker=new THREE.Mesh(new THREE.ConeGeometry(.12,.40,8),new THREE.MeshBasicMaterial({color:0xe7b7de}));marker.name='ink-aim';
      const direction=new THREE.Vector3(attack.direction.x,attack.direction.y,-attack.direction.z);
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
      marker.position.set(attack.target.x-attack.position.x,attack.target.y-attack.position.y,-attack.target.z+attack.position.z);group.add(marker);
    }
    return group;
  }

  update(state: GameState): void {
    const boss=state.boss;this.body.visible=boss.state!=='locked';this.body.position.set(boss.position.x,boss.position.y,-boss.position.z);
    const defeated=boss.state==='defeated';this.body.scale.set(defeated ? .55 : 1,defeated ? .3 : 1,defeated ? -.55 : -1);
    this.skin.color.setHex(defeated?0x596569:boss.phase===2?0x964b76:0x775d91);
    const damage=state.events.findLast(event=>event.type==='boss_damage');
    this.skin.emissive.setHex(damage && state.simulationTick-damage.tick<9?0x874927:0);this.skin.emissiveIntensity=.8;
    const ids=new Set(boss.attacks.map(attack=>attack.id));
    for(const [id,model] of this.models) if(!ids.has(id)) { release(model);this.models.delete(id); }
    for(const attack of boss.attacks) {
      let model=this.models.get(attack.id);if(!model) { model=this.build(attack);this.models.set(attack.id,model); }
      model.visible=state.gamePhase!=='victory';
      if(attack.type==='tentacle') {
        model.position.set(attack.position.x,1.025,-attack.position.z);
        model.getObjectByName('tentacle-rise')!.visible=attack.phase==='active';
        const material=(model.getObjectByName('zone-disc') as THREE.Mesh<THREE.CircleGeometry,THREE.MeshBasicMaterial>).material;
        material.opacity=attack.phase==='active'?.48:.22+Math.sin(state.simulationTick*.3)*.07;
      } else {
        model.position.set(attack.position.x,attack.position.y,-attack.position.z);
        const warning=attack.phase==='warning';
        model.getObjectByName('ink-direction')!.visible=warning;model.getObjectByName('ink-aim')!.visible=warning;
        model.getObjectByName('ink-shot')!.visible=!warning;model.getObjectByName('ink-halo')!.visible=!warning;
      }
    }
  }

  reset(): void { for(const model of this.models.values()) release(model);this.models.clear();this.body.visible=false; }
  dispose(): void { this.reset();release(this.root); }
}
