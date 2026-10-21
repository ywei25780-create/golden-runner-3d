import test from 'node:test';
import assert from 'node:assert/strict';
import {characterFixture} from './character-fixture.mjs';
import {makeFaceSurface,createLaughFace,plantLaughFeet,fitBellyHands} from './face.mjs';
import {samplePose} from './animation.mjs';

test('an open laugh deforms the actual jaw and uses a cavity behind the skin, restoring the closed face',()=>{
  const {T,model,body,rig}=characterFixture(),surface=makeFaceSurface(T,body);
  const face=createLaughFace(T,rig.head.bone,surface,{body,model,rig});
  face.setExpression(1,.95);
  assert.ok(body.morphTargetInfluences?.[0]>.9,'the body itself must have a jaw morph');
  const pos=body.geometry.attributes.position,delta=body.geometry.morphAttributes.position[0];let jawMoved=false;
  for(let i=0;i<pos.count;i++)if(Math.abs(pos.getX(i))<.1&&pos.getY(i)>2.5&&pos.getY(i)<2.7&&pos.getZ(i)>.35&&delta.getY(i)<-.06)jawMoved=true;
  assert.ok(jawMoved,'the lower jaw must actually drop');
  const cavity=face.root.getObjectByName('LaughCavity');
  assert.equal(cavity.isSkinnedMesh,true,'new face must share body skinning');
  const c=new T.Vector3().fromBufferAttribute(cavity.geometry.attributes.position,0);
  assert.ok(c.z<surface(c.x,c.y)-.025,'the cavity must be behind the front skin');
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <clipping_planes_fragment>'};
  body.material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/discard/);assert.ok(shader.uniforms.uLaughOpen.value>.9);
  face.setExpression(0,0);assert.equal(body.morphTargetInfluences[0],0);assert.equal(shader.uniforms.uLaughOpen.value,0);assert.equal(face.root.visible,false);
});

test('laugh knees bend while both feet stay on the same ground points',()=>{
  const {T,model,rig}=characterFixture();rig.root.bone.position.y-=.09;model.rotation.y=-.4;
  model.updateMatrixWorld(true);plantLaughFeet(T,model,rig,1);
  model.updateMatrixWorld(true);
  for(const [side,s] of [['L',1],['R',-1]]){
    const point=rig[`foot.${side}`].bone.getWorldPosition(new T.Vector3());model.worldToLocal(point);
    assert.ok(point.distanceTo(new T.Vector3(s*.49,.15,.08))<.015,`${side}: ${point.toArray()}`);
  }
  assert.ok(Math.abs(rig['shin.L'].bone.rotation.x)>.3);
});

test('the reference bow lowers the actual head and shoulders while the feet stay planted',()=>{
  const {T,model,rig}=characterFixture(),state={phase:'ready',grounded:true,duck:false};
  const apply=time=>{
    const p=samplePose(state,0,0,{name:'laugh',time});
    for(const [name,angles] of Object.entries(p.rot))rig[name].bone.rotation.set(...angles);
    rig.root.bone.position.y=rig.root.position.y+p.rootY;
    plantLaughFeet(T,model,rig,1);model.updateMatrixWorld(true);
    return rig.head.bone.getWorldPosition(new T.Vector3());
  };
  const upright=apply(2.05),bow=apply(2.6);
  assert.ok(upright.y-bow.y>.34,`head lowered only ${upright.y-bow.y}`);
  assert.ok(bow.z-upright.z>.7,'the head and shoulders must hinge forward');
  for(const [side,s] of [['L',1],['R',-1]]){
    const foot=rig[`foot.${side}`].bone.getWorldPosition(new T.Vector3());
    assert.ok(foot.distanceTo(new T.Vector3(s*.49,.15,.08))<.015);
  }
});

test('moving the arms does not pull the front of the belly into a hard crease',()=>{
  const {T,model,body,rig}=characterFixture();createLaughFace(T,rig.head.bone,makeFaceSurface(T,body),{body,model,rig});
  const pos=body.geometry.attributes.position;let chosen=0,distance=Infinity;
  for(let i=0;i<pos.count;i++){const d=new T.Vector3().fromBufferAttribute(pos,i).distanceTo(new T.Vector3(.52,2.08,.45));if(d<distance){distance=d;chosen=i;}}
  const before=body.getVertexPosition(chosen,new T.Vector3());fitBellyHands(T,rig,1);model.updateMatrixWorld(true);body.skeleton.update();
  const after=body.getVertexPosition(chosen,new T.Vector3());assert.ok(after.distanceTo(before)<.055,`belly moved ${after.distanceTo(before)}`);
});
