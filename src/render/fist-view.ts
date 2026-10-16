import * as THREE from 'three';
import type { GameState } from '../game/types.ts';
import { WEAPONS } from '../game/weapons.ts';
import type { WeaponId } from '../game/weapons.ts';

/** Camera-local geometry; the swing reads production elapsed time and freezes with it. */
export class FistView {
  private root = new THREE.Group();
  private fists = [new THREE.Group(), new THREE.Group()];
  private tools: Record<Exclude<WeaponId, 'fist'>, THREE.Group> = { club: new THREE.Group(), spear: new THREE.Group(), hammer: new THREE.Group() };

  constructor(camera: THREE.Camera) {
    this.root.name = 'punch-fists'; camera.add(this.root);
    for (const [index, fist] of this.fists.entries()) {
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(.125,.14,.33), new THREE.MeshBasicMaterial({color:0x365e54}));
      sleeve.position.set(0,-.055,.19); fist.add(sleeve);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(.18,.13,.17), new THREE.MeshBasicMaterial({color:0xc39570}));
      fist.add(palm);
      for(let finger=0;finger<4;finger++) {
        const knuckle=new THREE.Mesh(new THREE.BoxGeometry(.039,.065,.09),new THREE.MeshBasicMaterial({color:0xe3b38a}));
        knuckle.position.set(-.066+finger*.044,.04,-.075); fist.add(knuckle);
      }
      fist.position.set(index===0?-.30:.34,-.35,-.60); this.root.add(fist);
    }
    const wood = 0x98704b; const steel = 0xa9c4c5;
    this.mesh(this.tools.club, new THREE.CylinderGeometry(.08,.045,.8,8), wood, 0,.27,0);
    for (const y of [-.04,.03,.1]) this.mesh(this.tools.club, new THREE.CylinderGeometry(.048,.048,.025,8), 0x40392c,0,y,0);
    this.mesh(this.tools.spear, new THREE.CylinderGeometry(.028,.033,1.1,8),wood,0,.35,0);
    this.mesh(this.tools.spear, new THREE.BoxGeometry(.30,.045,.045),steel,0,.92,0);
    for (const x of [-.13,0,.13]) {
      this.mesh(this.tools.spear, new THREE.CylinderGeometry(.012,.016,.18,6),steel,x,1.02,0);
      this.mesh(this.tools.spear, new THREE.ConeGeometry(.023,.12,6),steel,x,1.17,0);
    }
    this.mesh(this.tools.hammer, new THREE.CylinderGeometry(.04,.045,.72,8),wood,0,.22,0);
    this.mesh(this.tools.hammer, new THREE.BoxGeometry(.50,.27,.27),0x63797e,0,.61,0);
    for (const x of [-.25,.25]) this.mesh(this.tools.hammer,new THREE.BoxGeometry(.035,.29,.29),steel,x,.61,0);
    for (const [id,tool] of Object.entries(this.tools)) {
      tool.name = `weapon-${id}`;
      this.mesh(tool,new THREE.BoxGeometry(.11,.14,.10),0xc39570,0,0,0);
      this.root.add(tool);
    }
  }

  private mesh(group: THREE.Group, geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number): void {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color})); mesh.position.set(x,y,z); group.add(mesh);
  }

  update(state: GameState): void {
    this.root.visible=state.mode==='combat';
    const active = state.attack.result !== 'none' && state.attack.elapsed < WEAPONS[state.attack.weaponId].animationSeconds - 1e-9;
    const id = active ? state.attack.weaponId : state.currentWeapon;
    for (const fist of this.fists) fist.visible = id === 'fist';
    for (const [key,tool] of Object.entries(this.tools)) tool.visible = id === key;
    const swing=state.attack.elapsed<.22 ? Math.sin(state.attack.elapsed/.22*Math.PI) : 0;
    this.fists[0].position.set(-.30+swing*.19,-.35+swing*.14,-.60-swing*.48);
    this.fists[0].rotation.z=-swing*.28;
    this.fists[1].rotation.z=.1;
    if (id !== 'fist') {
      const tool = this.tools[id];
      const t = active ? state.attack.elapsed / WEAPONS[id].animationSeconds : 1;
      const strike = Math.sin(Math.min(1,t)*Math.PI);
      if (id === 'club') {
        tool.position.set(.36-strike*.30,-.43+strike*.1,-.82-strike*.25);
        tool.rotation.set(-.25-strike*.8,0,-.32+strike*1.5);
      } else if (id === 'spear') {
        tool.position.set(.36,-.45+strike*.05,-.88-strike*.72);
        tool.rotation.set(-.75-strike*.60,0,-.25);
      } else {
        // A slower lift, downward blow, then recovery; elapsed remains simulation-owned.
        const lift = t < .3 ? Math.sin(t/.3*Math.PI/2) : Math.cos((t-.3)/.7*Math.PI/2);
        tool.position.set(.42-strike*.18,-.50+lift*.20,-.82-strike*.35);
        tool.rotation.set(-.35-strike*1.45,0,-.25+lift*.20);
      }
    }
  }

  dispose(): void {
    this.root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for(const material of Array.isArray(object.material)?object.material:[object.material]) material.dispose();
    });
    this.root.removeFromParent();
  }
}
