const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// The same displacement is applied to the original skin and the new lip geometry.
function sculpt(x,y,z){
  const front=smooth((z-.16)/.20),lower=smooth((2.88-y)/.21)*smooth((y-2.28)/.20)*Math.exp(-Math.pow(x/.39,4));
  const cheek=Math.exp(-Math.pow((Math.abs(x)-.27)/.15,2)-Math.pow((y-2.96)/.18,2))*front;
  return [Math.sign(x)*cheek*.015,-.085*lower*front+.020*cheek,.032*lower*front+.018*cheek];
}

export function createSculptedFace(T,surface,{body,model,rig}){
  const openUniform={value:0},root=new T.Group();root.name='VideoLaughFace';model.add(root);root.visible=false;
  const bodyGeometry=body.geometry,source=bodyGeometry.attributes.position,jaw=new Float32Array(source.count*3);
  for(let i=0;i<source.count;i++)jaw.set(sculpt(source.getX(i),source.getY(i),source.getZ(i)),i*3);
  bodyGeometry.morphTargetsRelative=true;bodyGeometry.morphAttributes.position=[new T.BufferAttribute(jaw,3)];
  const shaped=bodyGeometry.clone(),normalDelta=new Float32Array(source.count*3),originalNormal=bodyGeometry.attributes.normal;
  for(let i=0;i<source.count;i++)for(let k=0;k<3;k++)shaped.attributes.position.array[i*3+k]=source.array[i*3+k]+jaw[i*3+k];
  shaped.computeVertexNormals();
  for(let i=0;i<normalDelta.length;i++)normalDelta[i]=shaped.attributes.normal.array[i]-originalNormal.array[i];
  bodyGeometry.morphAttributes.normal=[new T.BufferAttribute(normalDelta,3)];shaped.dispose();body.updateMorphTargets();body.morphTargetDictionary={LaughJaw:0};
  function cutout(shader){
    shader.uniforms.uLaughOpen=openUniform;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vLaughRest;').replace('#include <begin_vertex>','#include <begin_vertex>\nvLaughRest=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vLaughRest;\nuniform float uLaughOpen;').replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
      if(uLaughOpen>0.01 && vLaughRest.z>0.20){
        float nx=vLaughRest.x/(0.265*(0.85+0.15*uLaughOpen));
        float ny=(vLaughRest.y-2.79)/(0.185*uLaughOpen);
        if(nx*nx+ny*ny<0.997)discard;
      }`);
  }
  body.material.onBeforeCompile=cutout;body.material.customProgramCacheKey=()=> 'sculpted-laugh-v2';body.material.needsUpdate=true;
  body.customDepthMaterial=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});body.customDepthMaterial.onBeforeCompile=cutout;
  const material=(color,roughness=.65)=>new T.MeshStandardMaterial({color,roughness,side:T.DoubleSide});
  const dark=material('#170807'),lip=material('#98600b'),teeth=material('#fff1d9',.54),tongue=material('#713632',.8),gold=material('#eaa00d',.64),crease=material('#4c300b');
  const parts=[],centers=[1.42,2.07,2.47,2.81],indices=['spine','chest','neck','head'].map(n=>body.skeleton.bones.indexOf(rig[n].bone));
  const assignWeights=(g,rest)=>{
    const joints=new Uint16Array(rest.length/3*4),weights=new Float32Array(rest.length/3*4);
    for(let i=0;i<rest.length/3;i++){
      const w=centers.map(c=>Math.exp(-Math.pow((rest[i*3+1]-c)/.31,2))),sum=w.reduce((a,b)=>a+b,0);
      for(let k=0;k<4;k++){joints[i*4+k]=indices[k];weights[i*4+k]=w[k]/sum;}
    }
    g.setAttribute('skinIndex',new T.BufferAttribute(joints,4));g.setAttribute('skinWeight',new T.BufferAttribute(weights,4));
  };
  function add(geometry,mat,name,mouth=true,parent=root){
    const rest=geometry.attributes.position.array.slice();assignWeights(geometry,rest);
    const m=new T.SkinnedMesh(geometry,mat);m.name=name;m.frustumCulled=false;parent.add(m);m.bind(body.skeleton,body.bindMatrix);
    parts.push({mesh:m,rest,mouth});return m;
  }
  const n=64,rings=8,positions=[0,2.79,surface(0,2.79)-.13],tri=[];
  const ringPoint=(theta,r=1)=>{const x=.265*Math.cos(theta)*r,y=2.79+.185*Math.sin(theta)*r;return new T.Vector3(x,y,surface(x,y)-.13*(1-r*r)+.003);};
  for(let k=1;k<=rings;k++)for(let i=0;i<n;i++)positions.push(...ringPoint(i/n*Math.PI*2,k/rings).toArray());
  for(let i=0;i<n;i++)tri.push(0,1+i,1+(i+1)%n);
  for(let k=1;k<rings;k++)for(let i=0;i<n;i++){const a=1+(k-1)*n+i,b=1+(k-1)*n+(i+1)%n,c=a+n,d=b+n;tri.push(a,c,b,b,c,d);}
  const cavity=new T.BufferGeometry();cavity.setAttribute('position',new T.Float32BufferAttribute(positions,3));cavity.setIndex(tri);cavity.computeVertexNormals();add(cavity,dark,'LaughCavity');
  const outline=new T.CatmullRomCurve3(Array.from({length:n},(_,i)=>ringPoint(i/n*Math.PI*2)),true);
  add(new T.TubeGeometry(outline,80,.009,6,true),lip,'LaughLip');
  const upperTeeth=new T.Group();upperTeeth.name='LaughUpperTeeth';root.add(upperTeeth);
  const lowerTeeth=new T.Group();lowerTeeth.name='LaughLowerTeeth';root.add(lowerTeeth);
  // Follow both lip arches; smaller end teeth tuck into the mouth corners.
  for(const [upper,count,parent] of [[true,9,upperTeeth],[false,9,lowerTeeth]]){
    for(let i=0;i<count;i++){
      const x=(i-(count-1)/2)*.051,arc=Math.sqrt(1-Math.pow(x/.265,2));
      const y=2.79+(upper?1:-1)*(.185*arc-.023),z=surface(x,y)-.025;
      const taper=1-.22*Math.pow(Math.abs(x)/.22,2);
      const shape=new T.Shape(),w=.027,h=(upper?.035:.025)*taper,r=.007;
      shape.moveTo(-w+r,-h);shape.lineTo(w-r,-h);shape.quadraticCurveTo(w,-h,w,-h+r);
      shape.lineTo(w,h-r);shape.quadraticCurveTo(w,h,w-r,h);shape.lineTo(-w+r,h);
      shape.quadraticCurveTo(-w,h,-w,h-r);shape.lineTo(-w,-h+r);shape.quadraticCurveTo(-w,-h,-w+r,-h);
      const g=new T.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.003,bevelThickness:.003,curveSegments:4});
      g.rotateZ((upper?-1:1)*Math.atan(.185*x/(.265*.265*arc)));
      g.translate(x,y,z);add(g,teeth,`${upper?'LaughTooth':'LaughLowerTooth'}${i}`,true,parent);
    }
  }
  const tongueGeo=new T.SphereGeometry(1,18,10);tongueGeo.scale(.085,.019,.028);tongueGeo.translate(0,2.663,surface(0,2.663)-.070);add(tongueGeo,tongue,'LaughTongue');
  for(const [side,s] of [['L',1],['R',-1]]){
    const x=s*.230,y=3.012,z=surface(x,y)+.018;
    const lid=new T.SphereGeometry(1,20,12);lid.scale(.108,.048,.030);lid.translate(x,y,z);add(lid,gold,`LaughLid.${side}`,false);
    const points=Array.from({length:17},(_,i)=>{const dx=-.082+i/16*.164,xx=x+dx,yy=3.020+.040*(1-Math.pow(dx/.082,2));return new T.Vector3(xx,yy,surface(xx,yy)+.057);});
    add(new T.TubeGeometry(new T.CatmullRomCurve3(points),30,.0075,7,false),crease,`LaughEye.${side}`,false);
  }
  const restPoint=new T.Vector3();
  return {root,setExpression(intensity,open){
    const amount=intensity>.08?Math.max(0,Math.min(1,open)):0;
    root.visible=amount>0;openUniform.value=amount;body.morphTargetInfluences[0]=amount;
    if(!root.visible)return;
    for(const {mesh,rest,mouth} of parts){
      const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const bx=rest[i*3],by=rest[i*3+1],bz=rest[i*3+2];
        const x=mouth?bx*(.85+.15*amount):bx,y=mouth?2.79+(by-2.79)*amount:by;
        const z=surface(x,y)+(bz-surface(bx,by));
        const d=sculpt(x,y,z);restPoint.set(x+d[0]*amount,y+d[1]*amount,z+d[2]*amount);p.setXYZ(i,...restPoint.toArray());
      }
      p.needsUpdate=true;
      if(mesh.name==='LaughCavity')mesh.geometry.computeVertexNormals();
    }
  }};
}
