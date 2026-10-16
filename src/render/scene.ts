import * as THREE from 'three';
import { BODY, STEP } from '../game/types.ts';
import type { GameState } from '../game/types.ts';
import { SHOP } from '../game/world.ts';
import type { World } from '../game/world.ts';
import { FishingView } from './fishing-view.ts';
import { LiveFishView } from './live-fish-view.ts';
import { FistView } from './fist-view.ts';
import { BossView } from './boss-view.ts';
import { SHOP_COUNTER } from '../game/shop.ts';

const palette = {
  sand: 0xe6cc94, wood: 0xd8c096, darkWood: 0x635846, roof: 0xb96950,
  leaf: 0x497e57, grass: 0x8a9c64, stone: 0x819892,
};

export class IslandView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.05, 2000);
  private island = new THREE.Group();
  private water: THREE.ShaderMaterial;
  private resizeHandler = () => this.resize();
  private target = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private fishing: FishingView;
  private liveFish: LiveFishView;
  private fists: FistView;
  private boss: BossView;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.Fog(0xa5c9c4, 55, 240);
    this.scene.add(new THREE.HemisphereLight(0xd7edeb, 0x9b855e, 2.4));
    const sun = new THREE.DirectionalLight(0xffe0b0, 3.0);
    sun.position.set(35, 55, -25); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 150 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 vPosition;
        void main(){float h=normalize(vPosition).y;vec3 c=mix(vec3(.71,.82,.77),vec3(.24,.57,.65),smoothstep(0.,.8,h));
        vec3 s=normalize(vec3(35.,55.,-25.));float d=dot(normalize(vPosition),s);
        c+=vec3(.5,.35,.17)*pow(max(d,0.),80.);c=mix(c,vec3(1.,.89,.65),smoothstep(.9991,.9995,d));gl_FragColor=vec4(c,1.);}`,
    }));
    this.scene.add(sky);

    this.water = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, square: { value: 0 }, coast: { value: 23 } },
      vertexShader: `uniform float time; varying vec3 vWorld;
        void main(){vec4 p=modelMatrix*vec4(position,1.);p.y+=.055*sin(p.x*.55+time*.9)*cos(p.z*.4+time*.7);
        vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `uniform float time;uniform float square;uniform float coast;varying vec3 vWorld;
        void main(){vec2 p=vWorld.xz;float edge=mix(length(p),max(abs(p.x),abs(p.y)),square)-coast;
        float shallow=1.-smoothstep(0.,17.,edge);vec3 c=mix(vec3(.12,.37,.48),vec3(.25,.69,.65),shallow);
        float ripple=sin(p.x*2.+p.y*1.2+time*1.1)*sin(p.y*2.8-p.x*.5-time*.7);
        c+=ripple*.025;float foam=smoothstep(.86,.99,sin(edge*3.-time*1.5))*(1.-smoothstep(.2,2.8,edge));
        c=mix(c,vec3(.82,.9,.8),foam*.65);
        float glint=pow(max(0.,sin(p.x*.6+p.y*.3+time)*cos(p.y*.7-time*.6)),22.);
        c+=vec3(.4,.37,.26)*glint*.25;
        c=mix(c,vec3(.65,.79,.77),smoothstep(55.,230.,length(p)));gl_FragColor=vec4(c,1.);}`,
    });
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1900, 1900, 180, 180), this.water);
    ocean.rotation.x = -Math.PI / 2; this.scene.add(ocean);
    // Render +Z gameplay coordinates as -Z so +X is screen-right at yaw=0.
    this.island.scale.z = -1;
    this.scene.add(this.island, this.camera); this.rebuild(world);
    this.fishing = new FishingView(this.scene, this.camera);
    this.liveFish = new LiveFishView(this.scene);
    this.fists = new FistView(this.camera);
    this.boss = new BossView(this.scene);
    this.resize(); window.addEventListener('resize', this.resizeHandler);
  }

  private material(color: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true });
  }

  private add(geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color)); mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true; this.island.add(mesh); return mesh;
  }

  private box(w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  }

  private label(text: string, subtitle: string, x: number, y: number, z: number, width = 2.8): void {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#264a45'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#d5c69d'; ctx.lineWidth = 5; ctx.strokeRect(12, 12, 744, 216);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f7e7ba';
    ctx.font = 'bold 72px sans-serif'; ctx.fillText(text, 384, 115);
    ctx.font = '26px sans-serif'; ctx.fillText(subtitle, 384, 178);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    // Counter-mirror the label's UVs after the gameplay-to-render Z reflection.
    texture.repeat.x = -1; texture.offset.x = 1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 240 / 768), new THREE.MeshBasicMaterial({ map: texture }));
    mesh.position.set(x, y, z); mesh.rotation.y = Math.PI; this.island.add(mesh);
  }

  private shop(): void {
    const { x, z, height, bottom } = SHOP;
    this.box(3, height, 3, palette.wood, x, bottom + height / 2, z);
    for (let i = 0; i < 10; i++) this.box(3.01, 0.022, 3.01, 0xb69c76, x, 1.22 + i * 0.35, z);
    for (const dx of [-1.42, 1.42]) for (const dz of [-1.42, 1.42])
      this.box(0.15, height, 0.15, palette.darkWood, x + dx, 2.9, z + dz);
    this.box(0.78, 2.3, 0.05, palette.darkWood, x - 0.7, 2.15, z - 1.52);
    this.box(0.59, 2.1, 0.06, 0x647967, x - 0.7, 2.15, z - 1.55);
    this.add(new THREE.SphereGeometry(0.035, 8, 6), 0xe3bd75, x - 0.49, 2.1, z - 1.6);
    this.box(1.13, 1.0, 0.06, palette.darkWood, x + 0.63, 2.57, z - 1.54);
    this.box(0.96, 0.83, 0.07, 0x416a68, x + 0.63, 2.57, z - 1.58);
    this.box(0.04, 0.84, 0.08, palette.wood, x + 0.63, 2.57, z - 1.62);
    this.box(0.97, 0.04, 0.08, palette.wood, x + 0.63, 2.57, z - 1.62);
    for (const dx of [-0.95, 0.95]) {
      const roof = this.box(2.05, 0.14, 3.7, palette.roof, x + dx * 0.8, 4.96, z);
      roof.rotation.z = -Math.sign(dx) * 0.37;
    }
    this.label('海风补给', 'E · 出售 / 购买武器', SHOP_COUNTER.x, 3.82, SHOP_COUNTER.z, 2.65);
    this.box(3.2, 0.12, 0.7, 0x608677, x, 3.35, z - 1.73).rotation.x = -0.13;
    // Decoration stays beside the building and has no interaction in this stage.
    this.add(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 10), palette.darkWood, x - 1.9, 1.35, z - 0.5);
  }

  private palm(x: number, z: number, height: number, rotation: number): void {
    const trunk = this.add(new THREE.CylinderGeometry(0.13, 0.24, height, 7), 0x938361, x, 1 + height / 2, z);
    trunk.rotation.z = 0.12;
    const topX = x - Math.sin(0.12) * height / 2;
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + rotation;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.quadraticCurveTo(0.6, 1.3, 0, 3.0); shape.quadraticCurveTo(-0.6, 1.3, 0, 0);
      const leaf = new THREE.Mesh(new THREE.ShapeGeometry(shape, 4), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x3e704c : 0x568657, side: THREE.DoubleSide, roughness: 1 }));
      leaf.rotation.set(-Math.PI / 2 + 0.3, 0, angle); leaf.position.set(topX, height + 1, z);
      leaf.castShadow = true; this.island.add(leaf);
    }
  }

  private clearIsland(): void {
    this.island.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose();
        material.dispose();
      }
    });
    this.island.clear();
  }

  rebuild(world: World): void {
    this.clearIsland();
    this.liveFish?.reset();
    this.boss?.reset();
    const square = world.coast.kind === 'square';
    const coast = square ? 10 : 23;
    this.water.uniforms.square.value = square ? 1 : 0;
    this.water.uniforms.coast.value = coast;
    if (square) this.box(20, 1.5, 20, palette.sand, 0, 0.25, 0);
    else {
      this.add(new THREE.CylinderGeometry(23, 24, 1.5, 96), palette.sand, 0, 0.25, 0);
      const grass = this.add(new THREE.CircleGeometry(9, 40), palette.grass, -5, 1.008, -7);
      grass.rotation.x = -Math.PI / 2; grass.scale.set(1.4, 0.9, 1);
      for (const [x, z, h, angle] of [[-13, -11, 6, .3], [-10, -16, 5.4, 1.2], [13, -10, 6.8, .4], [16, 7, 5.6, 2.1], [-17, 8, 5.8, .8]])
        this.palm(x, z, h, angle);
      for (let i = 0; i < 18; i++) {
        const angle = i * 2.4; const radius = 14 + (i % 4) * 1.7;
        const rock = this.add(new THREE.DodecahedronGeometry(0.25 + (i % 3) * 0.14, 0), palette.stone,
          Math.cos(angle) * radius, 1.04, Math.sin(angle) * radius);
        rock.scale.y = 0.65;
      }
      // A clearly marked sandy shore; no pier extending over walkable water.
      for (const x of [3.5, 5.5]) this.box(0.09, 1.4, 0.09, palette.darkWood, x, 1.7, 19.2);
      this.label('钓鱼岸边', 'FISHING SHORE', 4.5, 2.17, 19.25, 2.3);
      const buoy = this.add(new THREE.SphereGeometry(0.22, 10, 8), 0xd88759, 6, 0.12, 28);
      buoy.scale.y = 1.4;
    }
    this.shop();
  }

  render(state: GameState): void {
    const p = state.player;
    this.camera.position.set(p.position.x, p.position.y + BODY.height * 0.9, -p.position.z);
    this.direction.set(Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    this.target.copy(this.camera.position).add(this.direction);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld(true);
    this.fishing.update(state);
    this.liveFish.update(state);
    this.fists.update(state);
    this.boss.update(state);
    this.water.uniforms.time.value = state.simulationTick * STEP;
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.fishing.dispose();
    this.liveFish.dispose();
    this.fists.dispose();
    this.boss.dispose();
    this.clearIsland();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh && object.parent !== this.island) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.renderer.dispose();
  }
}
