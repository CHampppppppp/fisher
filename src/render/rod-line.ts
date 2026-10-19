import * as THREE from 'three';
import { STEP } from '../game/types.ts';

/** A pinned, damped rope. Reuses its particles and advances only on production ticks. */
export class HangingLine {
  readonly points=Array.from({length:33},()=>new THREE.Vector3());
  private previous=this.points.map(()=>new THREE.Vector3());
  private lastTip=new THREE.Vector3();
  private anchor=new THREE.Vector3();
  private old=new THREE.Vector3();
  private offset=new THREE.Vector3();
  reset(tip:THREE.Vector3):void {
    this.lastTip.copy(tip);
    for(let i=0;i<33;i++){
      this.points[i].copy(tip);this.points[i].y-=i*.92/32;
      this.previous[i].copy(this.points[i]);
    }
  }
  advance(tip:THREE.Vector3,ticks:number):void {
    const steps=Math.min(240,Math.max(0,ticks));
    for(let step=1;step<=steps;step++){
      this.anchor.copy(this.lastTip).lerp(tip,step/steps);this.points[0].copy(this.anchor);
      for(let i=1;i<33;i++){
        const p=this.points[i];this.old.copy(p);
        p.addScaledVector(this.offset.copy(p).sub(this.previous[i]),.975);p.y-=9.8*STEP*STEP;
        this.previous[i].copy(this.old);
      }
      for(let pass=0;pass<12;pass++)for(let i=1;i<33;i++){
        const a=this.points[i-1],b=this.points[i];this.offset.copy(b).sub(a);const length=this.offset.length();
        if(length<1e-10)continue;
        this.offset.multiplyScalar((length-.92/32)/length);
        if(i===1)b.sub(this.offset);else{this.offset.multiplyScalar(.5);a.add(this.offset);b.sub(this.offset);}
      }
    }
    this.points[0].copy(tip);this.lastTip.copy(tip);
  }
}
