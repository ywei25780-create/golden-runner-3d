import {createSculptedFace} from './facial-sculpt.mjs';
// Fit a two-bone arm in chest space. The wrist target is on the belly,
// rather than guessing Euler rotations that leave the palms in the air.
export function fitBellyHands(T,rig,weight,bow=0,handLift=[0,0]){
  for(const [side,s] of [['L',1],['R',-1]]){
    const upper=rig[`upper_arm.${side}`],lower=rig[`forearm.${side}`],hand=rig[`hand.${side}`];
    upper.bone.position.copy(upper.position);
    if(weight<=0)continue;
    const lift=handLift[side==='L'?0:1],shoulder=upper.bone.position.clone();
    const target=new T.Vector3(s*(.42-.12*bow-.10*lift),-.20-.04*bow+lift,.85-.01*bow-.36*lift);
    const a=lower.position.clone(),b=hand.position.clone(),l1=a.length(),l2=b.length();
    const line=target.clone().sub(shoulder),distance=Math.max(.001,Math.min(line.length(),l1+l2-.0001)),axis=line.normalize();
    target.copy(shoulder).addScaledVector(axis,distance);
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const hint=new T.Vector3(s*.35,-1,0);hint.addScaledVector(axis,-hint.dot(axis)).normalize();
    const elbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(hint,height);
    const upperQ=new T.Quaternion().setFromUnitVectors(a.normalize(),elbow.clone().sub(shoulder).normalize());
    const lowerWorldQ=new T.Quaternion().setFromUnitVectors(b.normalize(),target.clone().sub(elbow).normalize());
    const lowerQ=upperQ.clone().invert().multiply(lowerWorldQ);
    const gesture=side==='L'?Math.min(1,Math.max(0,lift/.30)):0;
    const palmQ=lowerWorldQ.clone().invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-s*(1.30+.15*bow+1.55*gesture)));
    upper.bone.quaternion.slerp(upperQ,weight);lower.bone.quaternion.slerp(lowerQ,weight);hand.bone.quaternion.slerp(palmQ,weight);
  }
}

export function plantLaughFeet(T,model,rig,weight){
  if(weight<=0)return;
  model.updateMatrixWorld(true);
  const parent=rig.pelvis.bone,parentQ=parent.getWorldQuaternion(new T.Quaternion()),modelQ=model.getWorldQuaternion(new T.Quaternion());
  const desired=parentQ.invert().multiply(modelQ);
  for(const [side,s] of [['L',1],['R',-1]]){
    const upper=rig[`thigh.${side}`],lower=rig[`shin.${side}`],foot=rig[`foot.${side}`];
    const target=parent.worldToLocal(model.localToWorld(new T.Vector3(s*.49,.15,.08)));
    const origin=upper.position,a=lower.position.clone(),b=foot.position.clone(),l1=a.length(),l2=b.length();
    const line=target.clone().sub(origin),d=Math.max(.01,Math.min(line.length(),l1+l2-.00001)),axis=line.normalize();
    const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const bend=new T.Vector3(0,0,1);bend.addScaledVector(axis,-bend.dot(axis)).normalize();
    const knee=origin.clone().addScaledVector(axis,along).addScaledVector(bend,height);
    const upperQ=new T.Quaternion().setFromUnitVectors(a.normalize(),knee.clone().sub(origin).normalize());
    const lowerQ=new T.Quaternion().setFromUnitVectors(b.normalize(),target.clone().sub(knee).normalize());
    upper.bone.quaternion.slerp(upperQ,weight);
    lower.bone.quaternion.slerp(upperQ.clone().invert().multiply(lowerQ),weight);
    foot.bone.quaternion.slerp(lowerQ.clone().invert().multiply(desired),weight);
  }
}

export function makeFaceSurface(T,body){
  const probe=new T.Mesh(body.geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));probe.updateMatrixWorld(true);
  const ray=new T.Raycaster(),values=[],n=12,x0=-.40,x1=.40,y0=2.46,y1=3.17;
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    ray.set(new T.Vector3(x0+(x1-x0)*i/n,y0+(y1-y0)*j/n,2),new T.Vector3(0,0,-1));
    const hits=ray.intersectObject(probe,false);values.push(hits[0]?.point.z??.32);
  }
  probe.material.dispose();
  return (x,y)=>{
    const u=Math.max(0,Math.min(n-.00001,(x-x0)/(x1-x0)*n)),v=Math.max(0,Math.min(n-.00001,(y-y0)/(y1-y0)*n));
    const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,at=(xx,yy)=>values[yy*(n+1)+xx];
    return (at(i,j)*(1-a)+at(i+1,j)*a)*(1-b)+(at(i,j+1)*(1-a)+at(i+1,j+1)*a)*b;
  };
}

export function createLaughFace(T,head,surface,context){
  if(context?.body)return createSculptedFace(T,surface,context);
  const root=new T.Group();root.name='VideoLaughFace';root.position.y=-2.81;head.add(root);
  const centerY=2.72,mouth=new T.Group();mouth.position.y=centerY;root.add(mouth);
  const material=(color,roughness=.7)=>new T.MeshStandardMaterial({color,roughness,side:T.DoubleSide});
  const dark=material('#250b08'),lipMat=material('#bc820f'),teethMat=material('#fff3d3',.35),tongueMat=material('#d97163',.48),crease=material('#38240d');
  const make=(geometry,mat,name,parent=mouth)=>{const m=new T.Mesh(geometry,mat);m.name=name;m.frustumCulled=false;parent.add(m);return m;};
  const point=(angle,r=1)=>{
    const sy=Math.sin(angle),x=.282*Math.cos(angle)*(1+.06*sy)*r,y=.235*sy*r;
    return new T.Vector3(x,y,surface(x,centerY+y)+.015+.045*r*r);
  };
  const positions=[0,0,surface(0,centerY)+.015],indices=[],rings=8,segments=64;
  for(let k=1;k<=rings;k++)for(let i=0;i<segments;i++)positions.push(...point(i/segments*Math.PI*2,k/rings).toArray());
  for(let i=0;i<segments;i++)indices.push(0,1+i,1+(i+1)%segments);
  for(let k=1;k<rings;k++)for(let i=0;i<segments;i++){
    const a=1+(k-1)*segments+i,b=1+(k-1)*segments+(i+1)%segments,c=a+segments,d=b+segments;indices.push(a,c,b,b,c,d);
  }
  const cavity=new T.BufferGeometry();cavity.setAttribute('position',new T.Float32BufferAttribute(positions,3));cavity.setIndex(indices);cavity.computeVertexNormals();make(cavity,dark,'LaughCavity');
  const outline=new T.CatmullRomCurve3(Array.from({length:64},(_,i)=>point(i/64*Math.PI*2)),true);
  make(new T.TubeGeometry(outline,80,.011,6,true),lipMat,'LaughLip');
  const teeth=new T.Group();teeth.name='LaughUpperTeeth';mouth.add(teeth);
  for(let i=0;i<9;i++){
    const x=(i-4)*.049,y=.139+.048*(1-(x/.25)**2),z=surface(x,centerY+y)+.074;
    const tooth=make(new T.SphereGeometry(1,10,8),teethMat,`LaughTooth${i}`,teeth);
    tooth.position.set(x,y,z);tooth.scale.set(.029,.041,.019);tooth.rotation.z=-x*.55;
  }
  const tongue=make(new T.SphereGeometry(1,20,12),tongueMat,'LaughTongue');tongue.position.set(0,-.164,surface(0,centerY-.164)+.054);tongue.scale.set(.106,.045,.020);
  const lower=make(new T.SphereGeometry(1,16,8),teethMat,'LaughLowerTeeth');lower.position.set(0,-.205,surface(0,centerY-.205)+.067);lower.scale.set(.125,.012,.012);
  const eyes=new T.Group();root.add(eyes);
  for(const [side,s] of [['L',1],['R',-1]]){
    const points=Array.from({length:13},(_,i)=>{
      const dx=-.085+i/12*.17,x=s*.223+dx,y=3.015+.085*(1-(dx/.085)**2);
      return new T.Vector3(x,y,surface(x,y)+.070);
    });
    make(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.009,7,false),crease,`LaughEye.${side}`,eyes);
  }
  root.visible=false;
  return {root,setExpression(intensity,open){
    root.visible=intensity>.08;mouth.visible=intensity>.08;
    mouth.scale.y=.18+.82*open;mouth.scale.x=.90+.10*open;mouth.position.y=2.84-.12*open;
  }};
}
