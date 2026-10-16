import * as THREE from 'three';
import type { GameState } from '../game/types.ts';
import { createFishModel } from './fish-model.ts';

function release(group: THREE.Group): void {
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  group.removeFromParent();
}

/** Models follow active production IDs, with no separate timers or reward entities. */
export class LiveFishView {
  private root = new THREE.Group();
  private models = new Map<string, { root: THREE.Group; body: THREE.Group; warning: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>; shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; deadMarker: THREE.Group; wasDead: boolean }>();

  constructor(scene: THREE.Scene) { this.root.name = 'live-fish'; scene.add(this.root); }

  update(state: GameState): void {
    const alive = new Set(state.fish.filter(fish => fish.state !== 'carried').map(fish => fish.id));
    for (const [id, model] of this.models) if (!alive.has(id)) { release(model.root); this.models.delete(id); }
    for (const fish of state.fish) {
      if (fish.state === 'carried') continue;
      let model = this.models.get(fish.id);
      if (!model) {
        const root = new THREE.Group(); root.name = `live-${fish.id}`;
        const body = createFishModel(fish.species); body.scale.setScalar(.65); body.position.y = .065;
        const warning = new THREE.Mesh(new THREE.TorusGeometry(.36, .018, 6, 32),
          new THREE.MeshBasicMaterial({ color: 0xb36534, transparent: true, opacity: .95 }));
        warning.rotation.x = -Math.PI / 2; warning.position.y = .015;
        const shadow = new THREE.Mesh(new THREE.CircleGeometry(.21, 24), new THREE.MeshBasicMaterial({ color: 0x37483c, transparent: true, opacity: .18, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        const deadMarker = new THREE.Group(); deadMarker.position.y = .12;
        for(const angle of [-Math.PI/4,Math.PI/4]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(.15,.014,.027),new THREE.MeshBasicMaterial({color:0x253f3b}));
          bar.rotation.y = angle; deadMarker.add(bar);
        }
        root.add(body, warning, shadow, deadMarker); this.root.add(root); model = { root, body, warning, shadow, deadMarker, wasDead: false }; this.models.set(fish.id, model);
      }
      model.root.position.set(fish.position.x, fish.position.y, -fish.position.z);
      model.root.rotation.y = -Math.atan2(fish.jumpDirection.x, fish.jumpDirection.z) - Math.PI / 2;
      model.body.rotation.x = -Math.PI / 2 + (fish.jumpPhase === 'jumping' ? Math.sin(fish.jumpElapsed / .4 * Math.PI) * .35 : 0);
      model.body.rotation.z = fish.jumpPhase === 'warning' ? Math.sin(fish.jumpTimer * 80) * .12 : 0;
      model.warning.visible = fish.jumpPhase === 'warning';
      model.warning.scale.setScalar(1 + Math.sin(fish.jumpTimer * 40) * .12);
      model.shadow.position.y = 1 - fish.position.y + .008;
      model.shadow.scale.setScalar(1 - (fish.position.y - 1) * .4);
      const dead = fish.state === 'groundedDead'; model.deadMarker.visible = dead;
      const damage = state.events.findLast(event => event.type === 'fish_damage' && event.entityId === fish.id);
      const flash = damage && state.simulationTick - damage.tick < 9;
      model.body.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
        if (dead && !model!.wasDead) object.material.color.lerp(new THREE.Color(0x87918a), .75);
        object.material.emissive.setHex(flash ? 0x8c432d : 0); object.material.emissiveIntensity = .7;
      });
      model.wasDead = dead;
    }
  }

  reset(): void { for (const model of this.models.values()) release(model.root); this.models.clear(); }
  dispose(): void { this.reset(); this.root.removeFromParent(); }
}
