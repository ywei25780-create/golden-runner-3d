import fs from 'node:fs';
import * as T from 'three';
import {bindCharacterRig} from './animation.mjs';
export function characterFixture(){
  const bytes=fs.readFileSync(new URL('../assets/golden-character-v08.glb',import.meta.url));
  const jsonLength=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jsonLength).toString()),binary=28+jsonLength;
  const types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  const attr=i=>{const a=j.accessors[i],v=j.bufferViews[a.bufferView],C=types[a.componentType],size=sizes[a.type];return new T.BufferAttribute(new C(bytes.buffer,bytes.byteOffset+binary+(v.byteOffset||0)+(a.byteOffset||0),a.count*size).slice(),size);};
  const nodes=j.nodes.map(n=>{const o=new T.Bone();o.name=T.PropertyBinding.sanitizeNodeName(n.name);if(n.translation)o.position.fromArray(n.translation);return o;});
  j.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));
  const model=new T.Group();model.add(nodes[0]);model.updateMatrixWorld(true);
  const bones=j.skins[0].joints.map(i=>nodes[i]),inverse=attr(j.skins[0].inverseBindMatrices).array;
  const skeleton=new T.Skeleton(bones,bones.map((_,i)=>new T.Matrix4().fromArray(inverse,i*16)));
  const p=j.meshes[0].primitives[0],geometry=new T.BufferGeometry();
  for(const [name,gltf] of [['position','POSITION'],['normal','NORMAL'],['skinIndex','JOINTS_0'],['skinWeight','WEIGHTS_0']])geometry.setAttribute(name,attr(p.attributes[gltf]));
  geometry.setIndex(attr(p.indices));
  const body=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial({color:'#eba30b'}));model.add(body);body.bind(skeleton,new T.Matrix4());
  return {T,model,body,rig:bindCharacterRig(bones)};
}
