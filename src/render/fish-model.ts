import * as THREE from 'three';
import type { FishSpecies } from '../game/fish-species.ts';

const profiles = {
  sprat: { width: .25, height: .075, depth: .055, body: 0xc9dadb, back: 0x648d98, fin: 0xb9d3d1 },
  bass: { width: .24, height: .14, depth: .075, body: 0x929f72, back: 0x3a5745, fin: 0x657354 },
  tuna: { width: .33, height: .09, depth: .06, body: 0xc0d6e6, back: 0x244f94, fin: 0x3f739f },
  golden: { width: .20, height: .165, depth: .07, body: 0xf4bb45, back: 0xca761f, fin: 0xf9d46a },
} as const;

/** Local species silhouettes: spiny bass, fork-tail tuna, long-fin golden, slender sprat. */
export function createFishModel(species: FishSpecies): THREE.Group {
  const group = new THREE.Group(); group.name = `fish-model-${species}`;
  const profile = profiles[species];
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: profile.body, metalness: .38, roughness: .42 }));
  body.scale.set(profile.width, profile.height, profile.depth); group.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12),
    new THREE.MeshStandardMaterial({ color: profile.back, metalness: .30, roughness: .5 }));
  back.scale.set(profile.width * .91, profile.height * .22, profile.depth * .84);
  back.position.y = profile.height * .68; group.add(back);

  const fin = (points: [number, number][], z = 0) => {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: profile.fin, side: THREE.DoubleSide, roughness: .65 }));
    mesh.position.z = z; group.add(mesh);
  };
  if (species === 'sprat') {
    fin([[.20, 0], [.40, .095], [.40, -.095]]);
    fin([[-.07, .06], [.03, .16], [.12, .055]]);
    fin([[-.01, -.055], [.06, -.13], [.13, -.05]], .035);
  } else if (species === 'bass') {
    fin([[.19, 0], [.32, .10], [.37, .07], [.38, 0], [.37, -.07], [.32, -.10]]);
    fin([[-.14, .10], [-.11, .23], [-.07, .15], [-.03, .26], [.01, .16],
      [.05, .24], [.09, .14], [.14, .20], [.18, .09]]);
    fin([[-.03, -.10], [.04, -.21], [.15, -.07]], .045);
    // Three dark flank bars reinforce the perch shape without relying on body color.
    for (const x of [-.07, .025, .12]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(.018, .15, .003),
        new THREE.MeshStandardMaterial({ color: profile.back, roughness: .7 }));
      stripe.position.set(x, 0, profile.depth + .002); stripe.rotation.z = -.18; group.add(stripe);
    }
  } else if (species === 'tuna') {
    fin([[.27, 0], [.49, .17], [.39, .015], [.49, -.17]]);
    fin([[-.10, .075], [-.02, .22], [.04, .08]]);
    fin([[-.11, -.03], [.13, -.15], [.03, -.025]], .045);
    fin([[.11, .064], [.18, .13], [.19, .045]]);
    for (let i = 0; i < 4; i++) {
      const x = .18 + i * .025; const y = .05 - i * .008;
      fin([[x, y], [x + .013, y + .035], [x + .025, y - .006]]);
      fin([[x, -y], [x + .013, -y - .035], [x + .025, -y + .006]]);
    }
  } else {
    fin([[.14, 0], [.26, .14], [.38, .18], [.34, .055], [.38, -.18], [.26, -.14]]);
    fin([[-.12, .10], [-.09, .20], [-.03, .27], [.05, .24], [.14, .10]]);
    fin([[-.07, -.12], [-.025, -.29], [.035, -.22], [.14, -.10]], .045);
    fin([[-.14, -.035], [-.13, -.25], [-.095, -.27], [-.095, -.04]], .055);
    const gill = new THREE.Mesh(new THREE.TorusGeometry(.055, .006, 6, 16, Math.PI * .75),
      new THREE.MeshStandardMaterial({ color: profile.back }));
    gill.position.set(-.065, 0, profile.depth * .96); gill.rotation.z = -.9; group.add(gill);
  }
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.020, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffefd0 }));
  eye.position.set(-profile.width * .72, profile.height * .22, profile.depth * .73); group.add(eye);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(.011, 10, 8), new THREE.MeshBasicMaterial({ color: 0x183138 }));
  pupil.position.copy(eye.position); pupil.position.z += .017; group.add(pupil);
  return group;
}
