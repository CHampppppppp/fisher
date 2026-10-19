import * as THREE from 'three';
import { SHOP } from '../game/world.ts';

/** Adjacent walls and posts have no overlapping coplanar face strips. */
export function createShopShell(): THREE.Group {
  const root=new THREE.Group();root.name='shop-shell';
  const {x,z,height,bottom}=SHOP;
  const box=(name:string,w:number,h:number,d:number,color:number,px:number,py:number,pz:number)=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.88,flatShading:true}));
    mesh.name=name;mesh.position.set(px,py,pz);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);return mesh;
  };
  box('shop-back',3,height,.15,0xd8c096,x,bottom+height/2,z+1.42);
  for(const dx of [-1.42,1.42]){
    // A post ends at z=-1.345; the side starts there instead of enclosing it.
    box(`shop-side-${dx}`, .15,height,2.84,0xd8c096,x+dx,bottom+height/2,z+.075);
    box(`shop-post-${dx}`, .15,height,.15,0x635846,x+dx,bottom+height/2,z-1.42);
  }
  box('shop-counter',3,1.05,.32,0x635846,x,1.525,z-1.42);
  box('shop-counter-top',3.2,.12,.65,0xd8c096,x,2.08,z-1.55);
  for(const side of [-1,1]){
    const roof=box(`shop-roof-${side}`,1.83,.14,3.7,0xb96950,x+side*.85,4.96,z);
    roof.rotation.z=-side*.37;
  }
  box('shop-roof-ridge',.12,.16,3.7,0xb96950,x,5.29,z);
  return root;
}
