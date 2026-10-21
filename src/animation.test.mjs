import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {bindCharacterRig, samplePose, ActionDirector, ACTIONS,plantedFootWeight} from './animation.mjs';
import {createLaughFace, fitBellyHands} from './face.mjs';

test('the shipped GLB binds every limb after GLTFLoader sanitizes node names',()=>{
  const b=fs.readFileSync(new URL('../assets/golden-character-v08.glb',import.meta.url));
  const gltf=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const nodes=gltf.skins[0].joints.map(i=>{
    const bone=new THREE.Bone();bone.name=THREE.PropertyBinding.sanitizeNodeName(gltf.nodes[i].name);return bone;
  });
  const rig=bindCharacterRig(nodes);
  assert.equal(Object.keys(rig).length,19);
  assert.equal(rig['thigh.L'].bone.name,'thighL');
  assert.equal(rig['upper_arm.R'].bone.name,'upper_armR');
  assert.throws(()=>bindCharacterRig(nodes.filter(b=>b.name!=='thighL')),/thigh.L/);
});

test('gait visibly alternates limbs, jumping tucks knees, ducking lowers the body',()=>{
  const state={phase:'running',grounded:true,duck:false,vy:0};
  const a=samplePose(state,1,Math.PI/2),b=samplePose(state,1,3*Math.PI/2);
  assert.ok(a.rot['thigh.L'][0]>.65&&b.rot['thigh.L'][0]<-.65);
  assert.ok(Math.abs(a.rot['upper_arm.L'][0]-b.rot['upper_arm.L'][0])>1);
  const air=samplePose({...state,grounded:false,vy:3},1,0);
  assert.ok(air.rot['shin.L'][0]>.7&&air.rot['shin.R'][0]>.7);
  assert.ok(samplePose({...state,duck:true},1,0).scaleY<.6);
});

test('video gestures have distinct full poses and smoothly return to neutral',()=>{
  const state={phase:'ready',grounded:true,duck:false};
  for(const name of ['laugh','roll']){
    const p=samplePose(state,1,0,{name,time:ACTIONS[name].duration*.45});
    assert.ok(p.mouth>.4,name);
    if(name==='roll')assert.ok(Math.abs(p.tiltZ)>1.1);
    if(name==='laugh')assert.ok(Math.abs(p.rot['forearm.L'][0])>.6);
    const end=samplePose(state,1,0,{name,time:ACTIONS[name].duration});
    assert.ok(Math.abs(end.tiltZ)<.01&&end.mouth<.01);
  }
});

test('random actions do not repeat immediately, freeze on pause, and avoid unsafe running moments',()=>{
  const d=new ActionDirector({random:()=>.25});
  const idle={phase:'ready',grounded:true,duck:false,obstacles:[],speed:9,playerX:-4.8};
  let names=[];
  for(let i=0;i<6;i++){d.request();const e=d.step(.1,idle);assert.ok(e);names.push(e.name);d.step(10,idle);}
  assert.ok(names.every((n,i)=>!i||n!==names[i-1]));
  d.request();d.step(.1,idle);const t=d.active.time;
  d.step(1,{...idle,phase:'paused'});assert.equal(d.active.time,t);
  d.reset();d.request();
  const danger={...idle,phase:'running',obstacles:[{x:-2,width:1}]};
  assert.equal(d.step(.1,danger),null);
  const e=d.step(.1,{...danger,obstacles:[]});assert.ok(e);assert.notEqual(e.name,'roll');
  d.step(.1,{...danger,grounded:false});assert.equal(d.active,null);
});

test('laugh has a sustained head-back phase followed by a real bow, with hands held to the belly',()=>{
  const state={phase:'ready',grounded:true,duck:false};
  const back=samplePose(state,1,0,{name:'laugh',time:1.4});
  const bow=samplePose(state,1,0,{name:'laugh',time:2.6});
  assert.ok(back.rot.spine[0]<-.05&&back.rot.head[0]<-.15);
  assert.ok(bow.rot.spine[0]>.35&&bow.rot.neck[0]>.05);
  assert.ok(back.belly>.9&&bow.belly>.9);
  assert.ok(back.laughFace>.9&&back.mouth>.75);
});

test('the reference gesture lifts one hand before the bow instead of holding both hands still',()=>{
  const state={phase:'ready',grounded:true,duck:false};
  const steady=samplePose(state,1,0,{name:'laugh',time:1});
  const lift=samplePose(state,1,0,{name:'laugh',time:2.0});
  const bow=samplePose(state,1,0,{name:'laugh',time:2.6});
  assert.ok(lift.handLift[0]-steady.handLift[0]>.25);
  assert.ok(lift.handLift[0]-lift.handLift[1]>.20);
  assert.ok(bow.bow>.9&&bow.handLift[0]<.05);
});
test('foot planting preserves both running gait and side-lying kicks',()=>{
  const state={phase:'ready',grounded:true,duck:false};
  const roll=samplePose(state,1,0,{name:'roll',time:1});
  assert.equal(plantedFootWeight(state,{name:'roll'},roll),0);
  const laugh=samplePose(state,1,0,{name:'laugh',time:1});
  assert.ok(plantedFootWeight(state,{name:'laugh'},laugh)>.9);
  assert.equal(plantedFootWeight({...state,phase:'running'},{name:'laugh'},laugh),0);
});

test('the shipped arm proportions can place both wrists at the belly targets',()=>{
  const b=fs.readFileSync(new URL('../assets/golden-character-v08.glb',import.meta.url));
  const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  const nodes=j.nodes.map(n=>{const o=new THREE.Bone();o.name=THREE.PropertyBinding.sanitizeNodeName(n.name);if(n.translation)o.position.fromArray(n.translation);return o;});
  j.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));
  const rig=bindCharacterRig(j.skins[0].joints.map(i=>nodes[i]));
  fitBellyHands(THREE,rig,1);nodes[0].updateMatrixWorld(true);
  for(const [side,s] of [['L',1],['R',-1]]){
    const wrist=rig[`hand.${side}`].bone.getWorldPosition(new THREE.Vector3());
    rig.chest.bone.worldToLocal(wrist);
    assert.ok(wrist.distanceTo(new THREE.Vector3(s*.42,-.20,.85))<.025,`${side} wrist ${wrist.toArray()}`);
  }
  fitBellyHands(THREE,rig,0);
  for(const side of ['L','R'])assert.ok(rig[`upper_arm.${side}`].bone.position.equals(rig[`upper_arm.${side}`].position));
});

test('laugh face has a large curved mouth with visible separate teeth, tongue and closed smile eyes',()=>{
  const bone=new THREE.Bone(),face=createLaughFace(THREE,bone,(x,y)=>.5-x*x*.8);
  face.setExpression(1,1);
  const mouth=face.root.getObjectByName('LaughCavity');mouth.geometry.computeBoundingBox();
  const box=mouth.geometry.boundingBox;
  assert.ok(box.max.y-box.min.y>.43&&box.max.x-box.min.x>.5);
  assert.ok(box.max.z-box.min.z>.04);
  assert.ok(face.root.getObjectByName('LaughTongue').visible);
  assert.ok(face.root.getObjectByName('LaughUpperTeeth').children.length>=7);
  assert.ok(face.root.getObjectByName('LaughEye.L'));
  face.setExpression(0,0);assert.equal(face.root.visible,false);
});
