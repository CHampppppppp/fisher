import * as THREE from 'three';
import type {GameState, Position} from '../game/types.ts';
interface Effect {
  root:THREE.Group; particles:THREE.Mesh[]; rings:THREE.Mesh[];
  foam:THREE.MeshBasicMaterial; blood:THREE.MeshBasicMaterial; ripple:THREE.MeshBasicMaterial;
  kind:'water'|'blood'; tick:number; sequence:number; position:Position; active:boolean;
}

/** Bounded visual pool, driven only by real event sequences and simulation ticks. */
export class ImpactView {
  private root=new THREE.Group();
  private sphere=new THREE.SphereGeometry(1,7,5);
  private ring=new THREE.TorusGeometry(1,.025,5,40);
  private pool:Effect[]=[];
  private next=0;
  private lastSequence=0;
  private lastTick=-1;
  constructor(scene:THREE.Scene) {
    this.root.name='fish-impacts';scene.add(this.root);
    for(let i=0;i<24;i++) {
      const root=new THREE.Group(),foam=new THREE.MeshBasicMaterial({color:0xd9fff5,transparent:true}),
        blood=new THREE.MeshBasicMaterial({color:0xbb1426,transparent:true}),
        ripple=new THREE.MeshBasicMaterial({color:0xc5f7ef,transparent:true,depthWrite:false});
      const particles=Array.from({length:10},()=>new THREE.Mesh(this.sphere,foam));
      const rings=Array.from({length:2},()=>new THREE.Mesh(this.ring,ripple));
      for(const mesh of particles)root.add(mesh);
      for(const mesh of rings){mesh.rotation.x=Math.PI/2;root.add(mesh);}
      root.visible=false;this.root.add(root);
      this.pool.push({root,particles,rings,foam,blood,ripple,kind:'water',tick:0,sequence:0,position:{x:0,y:0,z:0},active:false});
    }
  }
  reset():void {
    this.lastSequence=0;this.lastTick=-1;this.next=0;
    for(const effect of this.pool){effect.active=false;effect.root.visible=false;}
  }
  update(state:GameState):void {
    if(state.simulationTick<this.lastTick)this.reset();
    this.lastTick=state.simulationTick;
    for(const event of state.events) {
      if(event.sequence<=this.lastSequence)continue;
      this.lastSequence=event.sequence;
      if(!event.position||!['fish_escape','fish_damage'].includes(event.type))continue;
      const maxAge=event.type==='fish_escape'?120:36;
      if(state.simulationTick-event.tick>=maxAge)continue;
      const effect=this.pool[this.next++%this.pool.length];
      Object.assign(effect,{kind:event.type==='fish_escape'?'water':'blood',tick:event.tick,
        sequence:event.sequence,position:{...event.position},active:true});
      effect.root.name='impact-'+event.sequence;
    }
    for(const effect of this.pool) {
      if(!effect.active)continue;
      const age=(state.simulationTick-effect.tick)/60,water=effect.kind==='water',duration=water?2:.6;
      if(age>=duration){effect.active=false;effect.root.visible=false;continue;}
      effect.root.visible=true;
      effect.root.position.set(effect.position.x,effect.position.y,-effect.position.z);
      effect.foam.opacity=Math.max(0,1-age);effect.blood.opacity=1-age/.6;
      effect.ripple.opacity=Math.max(0,.7*(1-age/2));
      for(const [i,particle] of effect.particles.entries()) {
        const angle=i/10*Math.PI*2+effect.sequence*.7;
        const speed=.5+(i%3)*.25;
        particle.visible=water?age<1:true;
        particle.material=water?effect.foam:effect.blood;
        particle.position.set(Math.cos(angle)*age*speed,
          (water?2.4:1.1)*age-(water?3:2.4)*age*age,Math.sin(angle)*age*speed);
        particle.scale.setScalar((water?.05:.045)*(1-age/duration));
      }
      for(const [i,ring] of effect.rings.entries()) {
        const delayed=Math.max(0,age-i*.18);
        ring.visible=water&&age>=i*.18;
        ring.position.set(0,.035+i*.003,0);ring.scale.setScalar(.1+delayed*(1.4+i*.2));
      }
    }
  }
  dispose():void {
    this.root.removeFromParent();this.sphere.dispose();this.ring.dispose();
    for(const e of this.pool){e.foam.dispose();e.blood.dispose();e.ripple.dispose();}
  }
}
