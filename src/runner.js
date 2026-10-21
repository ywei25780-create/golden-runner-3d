import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RunnerGame} from './engine.mjs';
import {bindCharacterRig, samplePose, ActionDirector,plantedFootWeight} from './animation.mjs';
import {createLaughFace, makeFaceSurface, fitBellyHands, plantLaughFeet} from './face.mjs';
import {PlayExperience,renderProfile} from './experience.mjs';

const $=s=>document.querySelector(s),game=new RunnerGame();
const experience=new PlayExperience();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer,scene,camera,hero,model,rig,laughFace,shieldBubble,keyLight,ready=false,frames=0,runPhase=0,clockTime=0,visualY=0,landing=0;
let last=performance.now(),toastUntil=0,lastPhase='ready',birdHint=false,newRecord=false;
const director=new ActionDirector(),obstacleMeshes=new Map(),coinMeshes=new Map(),scenery=[],dust=[],sparks=[],morphs=[];
const referenceFrames=JSON.parse($('#reference-frames').textContent);
let review=false,reviewHeld=false,reviewShape=false,reviewFloor,reviewBackground,reviewFog,lastReference=-1;
const reviewHidden=[];
const touchDevice=matchMedia('(pointer: coarse)').matches||innerWidth<760;
$('#mobile-recommend').hidden=!touchDevice;$('#desktop-recommend').hidden=touchDevice;
function applyProfile(){
  if(!renderer)return;
  const p=renderProfile(experience.mode|| (touchDevice?'mobile':'desktop'),devicePixelRatio);
  renderer.setPixelRatio(p.pixelRatio);
  if(keyLight&&keyLight.shadow.mapSize.x!==p.shadowSize){keyLight.shadow.mapSize.set(p.shadowSize,p.shadowSize);keyLight.shadow.map?.dispose();keyLight.shadow.map=null;}
  resize();
}
function chooseMode(mode){
  if(!experience.choose(mode))return;
  document.body.classList.remove('choosing-mode','mode-mobile','mode-desktop');document.body.classList.add(`mode-${mode}`);
  $('#mode-switch').textContent=mode==='mobile'?'手机版 ↔':'电脑版 ↔';
  $('#welcome-help').textContent=mode==='mobile'?'轻点起跳 · 按住伏身':'空格 / ↑ 起跳 · ↓ / S 伏身 · P 暂停';
  $('#game').setAttribute('aria-label',mode==='mobile'?'3D 游戏画面，轻点跳跃，按住伏身按钮躲飞鸟':'3D 游戏画面，空格、上箭头或 W 跳跃，下箭头或 S 伏身，P 暂停');
  releaseInput();applyProfile();syncUI();if(ready)$('#start').focus({preventScroll:true});
}
function openModePicker(){
  exitReview();releaseInput();if(game.phase==='running')game.togglePause();
  experience.openPicker();document.body.classList.add('choosing-mode');syncUI();resize();
  $('#choose-'+(experience.mode|| (touchDevice?'mobile':'desktop'))).focus({preventScroll:true});
}
function openHelp(){releaseInput();if(game.phase==='running'){game.togglePause();syncUI();}$('#help-dialog').showModal();}
for(const mode of ['mobile','desktop'])$('#choose-'+mode).addEventListener('click',()=>chooseMode(mode));
for(const id of ['mode-switch','pause-mode','over-mode'])$('#'+id).addEventListener('click',openModePicker);
for(const id of ['help-open','pause-help'])$('#'+id).addEventListener('click',openHelp);
$('#help-close').addEventListener('click',()=>$('#help-dialog').close());
$('#help-dialog').addEventListener('close',()=>{if(experience.pickerOpen)$('#choose-'+(touchDevice?'mobile':'desktop')).focus();else if(game.phase==='paused')$('#resume').focus();else $('#game').focus({preventScroll:true});});
function enterReview(){
  if(!ready||!experience.allowsPlay)return;
  if(!review){
    review=true;document.body.classList.add('review');reviewBackground=scene.background;reviewFog=scene.fog.color.clone();
    scene.traverse(o=>{if(!o.isMesh&&!o.isPoints)return;let p=o;while(p&&p!==hero)p=p.parent;if(p===hero||o===reviewFloor)return;reviewHidden.push([o,o.visible]);o.visible=false;});
    reviewFloor.visible=true;scene.background=new THREE.Color('#f6f5f0');scene.fog.color.set('#f6f5f0');
  }
  reviewHeld=false;reviewShape=false;announceAction(director.play('laugh'));syncUI();resize();$('#game').focus({preventScroll:true});
}
function exitReview(){
  if(!review)return;review=false;reviewHeld=false;reviewShape=false;document.body.classList.remove('review');
  for(const [o,v] of reviewHidden)o.visible=v;reviewHidden.length=0;reviewFloor.visible=false;scene.background=reviewBackground;scene.fog.color.copy(reviewFog);director.reset();syncUI();resize();
}
let best=0,soundOn=false,audio;
try{best=Math.max(0,Number(localStorage.getItem('golden-runner-best'))||0);soundOn=localStorage.getItem('golden-runner-sound')==='1';}catch{}
const bestBefore={value:best};
function pad(n){return String(Math.floor(n)).padStart(5,'0');}
$('#best').textContent=pad(best);
function soundUI(){
  $('#sound').setAttribute('aria-label',soundOn?'关闭声音':'开启声音');$('#sound').setAttribute('aria-pressed',String(soundOn));
  $('#sound').innerHTML=`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5M16 ${soundOn?'8c3 2 3 6 0 8m3-11c5 4 5 10 0 14':'9l5 6m0-6-5 6'}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
soundUI();
function beep(kind){
  if(!soundOn)return;
  try{
    audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});
    const time=audio.currentTime,o=audio.createOscillator(),gain=audio.createGain();
    const notes={jump:[420,850,.13],land:[150,90,.06],hit:[170,60,.25],milestone:[700,1050,.19],start:[450,660,.10],coin:[1100,1600,.08],shield:[520,1500,.24],giggle:[480,730,.09]};
    const [a,b,d]=notes[kind]||notes.start;o.type=kind==='hit'?'triangle':'sine';
    o.frequency.setValueAtTime(a,time);o.frequency.exponentialRampToValueAtTime(b,time+d);
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(kind==='land'?.025:.065,time+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,time+d);o.connect(gain);gain.connect(audio.destination);o.start(time);o.stop(time+d+.02);
  }catch{}
}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('on');toastUntil=performance.now()+2200;}
function saveBest(){if(game.score>best){best=game.score;try{localStorage.setItem('golden-runner-best',String(best));}catch{}}$('#best').textContent=pad(best);}
function anchorGameplay(){if(!hero)return;hero.position.set(game.playerX,game.y,0);hero.scale.setScalar(1);visualY=game.y;}
function continueGame(){if(game.phase!=='paused'||!experience.allowsPlay||$('#help-dialog').open)return;game.togglePause();anchorGameplay();syncUI();resize();$('#game').focus({preventScroll:true});}
function start(){if(!ready||!experience.allowsPlay||$('#help-dialog').open)return;exitReview();bestBefore.value=best;newRecord=false;birdHint=false;game.start();anchorGameplay();syncUI();resize();$('#game').focus({preventScroll:true});beep('start');}
function jump(){
  if(!ready||!experience.allowsPlay||review||$('#help-dialog').open)return;
  if(game.phase==='paused'){continueGame();return;}
  if(game.phase==='ready'||game.phase==='over'){start();}
  game.jump();$('#game').focus({preventScroll:true});syncUI();
}
function pause(){if(!ready||!experience.allowsPlay||review||$('#help-dialog').open)return;releaseInput();if(game.phase==='paused'){continueGame();return;}game.togglePause();syncUI();$('#game').focus({preventScroll:true});}
function announceAction(e){if(!e)return;$('#action-label').textContent=e.label;$('#action-label').classList.add('on');}
$('#trick').addEventListener('click',()=>{if(!ready||!experience.allowsPlay||review)return;$('#game').focus({preventScroll:true});if(game.phase==='paused'){toast('继续跑酷后，小黄再表演');return;}director.request();if(director.active){director.active=null;director.wait=0;}});
$('#preview-laugh').addEventListener('click',enterReview);
$('#over-theatre').addEventListener('click',enterReview);
$('#review-close').addEventListener('click',exitReview);
$('#review-play').addEventListener('click',()=>{reviewHeld=false;reviewShape=false;director.play('laugh');for(const b of document.querySelectorAll('[data-review-time]'))b.setAttribute('aria-pressed','false');});
for(const button of document.querySelectorAll('[data-review-time]'))button.addEventListener('click',()=>{reviewHeld=true;const time=Number(button.dataset.reviewTime);reviewShape=time<0;director.play('laugh');director.active.time=Math.max(0,time);for(const b of document.querySelectorAll('[data-review-time]'))b.setAttribute('aria-pressed',String(b===button));});
function syncUI(){
  const phase=game.phase;
  const gate=experience.pickerOpen;
  $('#device-gate').hidden=!gate;
  $('#welcome').hidden=phase!=='ready'||review||gate;$('#paused').hidden=phase!=='paused'||gate||review;$('#over').hidden=phase!=='over'||review||gate;$('#review-panel').hidden=!review;$('#review-close').hidden=!review;$('#review-stage-label').hidden=!review;
  $('#pause').disabled=gate||review||phase==='ready'||phase==='over';$('#pause').setAttribute('aria-label',phase==='paused'?'继续游戏':'暂停游戏');
  $('#preview-laugh').disabled=!ready;document.body.dataset.mode=experience.mode||'choose';document.body.dataset.screen=gate?'choose':review?'theatre':phase;
  $('#status').textContent={ready:'沙漠，准备出发',running:'向前跑，别忘了起跳',paused:'已暂停 · 等你继续',over:'这次旅程，暂时到这里'}[phase];
  if(phase==='over'){
    saveBest();$('#final-score').textContent=game.score;$('#final-best').textContent=best;
    $('#result-note').textContent=`${newRecord?'新纪录！':'这次收获'} ${game.coins} 枚金币 · 金币加分 +${game.bonus}`;
  }
  document.body.classList.toggle('running',phase==='running');lastPhase=phase;
}
$('#start').addEventListener('click',start);$('#restart').addEventListener('click',start);
$('#resume').addEventListener('click',continueGame);
$('#pause').addEventListener('click',pause);
$('#sound').addEventListener('click',()=>{soundOn=!soundOn;soundUI();try{localStorage.setItem('golden-runner-sound',soundOn?'1':'0');}catch{}beep('start');if(ready)$('#game').focus({preventScroll:true});});
const held=new Set();
document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.altKey||e.metaKey)return;
  if($('#help-dialog').open||experience.pickerOpen)return;
  if(review&&e.code==='Escape'){e.preventDefault();exitReview();return;}
  if(review&&e.code==='Space'&&!e.repeat&&!e.target.closest('button,a,input,select')){e.preventDefault();if(reviewShape){reviewShape=false;reviewHeld=false;director.play('laugh');}else reviewHeld=!reviewHeld;return;}
  if(review)return;
  if(e.target.closest('button,a,input,select')&&['Space','Enter'].includes(e.code))return;
  if(['Space','ArrowUp','KeyW','ArrowDown','KeyS','KeyP','Escape','KeyR'].includes(e.code))e.preventDefault();
  if(e.repeat||held.has(e.code))return;held.add(e.code);
  if(['Space','ArrowUp','KeyW'].includes(e.code))jump();
  if(['ArrowDown','KeyS'].includes(e.code))game.setDuck(true);
  if(['KeyP','Escape'].includes(e.code))pause();
  if(e.code==='KeyR'&&game.phase==='over')start();
});
document.addEventListener('keyup',e=>{
  held.delete(e.code);
  if(['Space','ArrowUp','KeyW'].includes(e.code))game.releaseJump();
  if(['ArrowDown','KeyS'].includes(e.code))game.setDuck(false);
});
function releaseInput(){held.clear();game.setDuck(false);game.releaseJump();document.querySelectorAll('.pressed').forEach(e=>e.classList.remove('pressed'));}
window.addEventListener('blur',()=>{releaseInput();if(game.phase==='running'){game.togglePause();syncUI();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseInput();if(game.phase==='running'){game.togglePause();syncUI();}}last=performance.now();});
function bindPress(element,down,up){
  const release=()=>{element.classList.remove('pressed');up();};
  element.addEventListener('pointerdown',e=>{if(e.button!==0||!experience.allowsPlay||review||$('#help-dialog').open)return;e.preventDefault();element.setPointerCapture?.(e.pointerId);element.classList.add('pressed');down();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,release);
  if(element.tagName==='BUTTON')element.addEventListener('click',e=>{if(e.detail===0&&experience.allowsPlay&&!review&&!$('#help-dialog').open){down();up();}});
}
bindPress($('#jump'),jump,()=>game.releaseJump());
bindPress($('#duck'),()=>game.setDuck(true),()=>game.setDuck(false));
bindPress($('#game'),()=>{if(game.phase==='running')jump();},()=>game.releaseJump());

const sand=new THREE.MeshStandardMaterial({color:'#e5d7a9',roughness:1});
const cactusMat=new THREE.MeshStandardMaterial({color:'#6d8c60',roughness:.86});
const birdMat=new THREE.MeshStandardMaterial({color:'#68735a',roughness:.87});
const eyeMat=new THREE.MeshStandardMaterial({color:'#26392e',roughness:.7});
const beakMat=new THREE.MeshStandardMaterial({color:'#c5a454',roughness:.8});
function mesh(geometry,material,position,scale){const m=new THREE.Mesh(geometry,material);if(position)m.position.set(...position);if(scale)m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;return m;}
function combine(parts,material){const geos=parts.map(p=>{p.updateMatrix();const g=p.geometry.clone().applyMatrix4(p.matrix);p.geometry.dispose();return g;});const g=mergeGeometries(geos,false);geos.forEach(x=>x.dispose());return mesh(g,material);}
function cactus(height=1.4,width=.9,material=cactusMat){
  const r=Math.min(.17,width*.19),parts=[];
  parts.push(mesh(new THREE.CapsuleGeometry(r,Math.max(.1,height-2*r),4,8),material,[0,height/2,0]));
  for(const [side,level] of [[-1,.48],[1,.62]]){
    const endX=side*(width*.40-r*.25),endY=height*(level+.24);
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,height*level,0),new THREE.Vector3(endX*.72,height*level,0),new THREE.Vector3(endX,height*(level+.08),0),new THREE.Vector3(endX,endY,0)]);
    parts.push(mesh(new THREE.TubeGeometry(curve,9,r*.64,6,false),material));
    parts.push(mesh(new THREE.SphereGeometry(r*.64,7,5),material,[endX,endY,0]));
  }
  return combine(parts,material);
}
function makeBird(o){
  const g=new THREE.Group();g.add(mesh(new THREE.SphereGeometry(1,12,8),birdMat,[0,.23,0],[.40,.21,.23]));
  g.add(mesh(new THREE.SphereGeometry(1,10,7),birdMat,[-.34,.34,0],[.19,.18,.18]));
  const beak=mesh(new THREE.ConeGeometry(.085,.20,6),beakMat,[-.54,.32,0]);beak.rotation.z=Math.PI/2;g.add(beak);
  for(const side of [-1,1])g.add(mesh(new THREE.SphereGeometry(.026,6,4),eyeMat,[-.39,.39,side*.151]));
  const wings=[];
  for(const side of [-1,1]){
    const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute([.15,0,0,.22,.02,side*.68,-.13,.0,side*.93,-.24,0,side*.34],3));
    geom.setIndex([0,1,2,0,2,3]);geom.computeVertexNormals();
    const wing=mesh(geom,new THREE.MeshStandardMaterial({color:'#738263',roughness:.9,side:THREE.DoubleSide}),[0,.29,side*.12]);
    g.add(wing);wings.push({wing,side});
  }
  g.userData.wings=wings;g.userData.seed=o.id;return g;
}
function addObstacle(o){
  const node=o.kind==='bird'?makeBird(o):cactus(o.height,o.width);node.position.set(o.x,o.bottom,0);scene.add(node);obstacleMeshes.set(o.id,node);
  if(o.kind==='bird'&&!birdHint){birdHint=true;toast(experience.mode==='mobile'?'飞鸟来了，按住“伏身”躲过':'飞鸟来了，按住 ↓ / S 伏身躲过');}
}
function removeObstacle(id){const node=obstacleMeshes.get(id);if(!node)return;scene.remove(node);node.traverse(m=>{if(m.isMesh){m.geometry.dispose();if(m.material!==cactusMat&&m.material!==birdMat&&m.material!==eyeMat&&m.material!==beakMat)m.material.dispose();}});obstacleMeshes.delete(id);}
function syncObstacles(){
  const ids=new Set(game.obstacles.map(o=>o.id));for(const id of obstacleMeshes.keys())if(!ids.has(id))removeObstacle(id);
  for(const o of game.obstacles){if(!obstacleMeshes.has(o.id))addObstacle(o);const m=obstacleMeshes.get(o.id);m.position.x=o.x;m.visible=!experience.pickerOpen&&!review;
    m.userData.wings?.forEach(({wing,side})=>{wing.rotation.x=-side*(.25+Math.abs(Math.sin(clockTime*8+o.id))*.65);});}
}
let dustPoints,dustPositions;
let sparkPoints,sparkPositions;
const coinGeometry=new THREE.CylinderGeometry(.235,.235,.095,16),coinMaterial=new THREE.MeshStandardMaterial({color:'#ffc83d',metalness:.65,roughness:.28});
const coinStampGeometry=new THREE.TorusGeometry(.15,.022,5,14),coinStampMaterial=new THREE.MeshStandardMaterial({color:'#fff1a0',metalness:.4,roughness:.3});
function syncCoins(){
  const ids=new Set(game.pickups.map(c=>c.id));
  for(const [id,n] of coinMeshes)if(!ids.has(id)){scene.remove(n);coinMeshes.delete(id);}
  for(const c of game.pickups){
    if(!coinMeshes.has(c.id)){
      const g=new THREE.Group(),disc=mesh(coinGeometry,coinMaterial);disc.rotation.x=Math.PI/2;g.add(disc);
      for(const side of [-1,1])g.add(mesh(coinStampGeometry,coinStampMaterial,[0,0,side*.052]));
      scene.add(g);coinMeshes.set(c.id,g);
    }
    const g=coinMeshes.get(c.id);g.visible=!experience.pickerOpen&&!review;g.position.set(c.x,c.y+Math.sin(clockTime*3+c.id)*.07,0);g.rotation.y=clockTime*2.8+c.id;
  }
}
function sparkle(x,y,count=12){
  if(reduced)return;
  for(let i=0;i<count;i++)sparks.push({x,y,z:0,vx:(Math.random()-.5)*4,vy:1+Math.random()*3,vz:(Math.random()-.5)*2,life:.5+Math.random()*.35});
  if(sparks.length>100)sparks.splice(0,sparks.length-100);
}
function puff(count=8){if(reduced)return;for(let i=0;i<count;i++)dust.push({x:game.playerX-.15-Math.random()*.5,y:.07,z:(Math.random()-.5)*.65,vx:-1-Math.random()*2,vy:.5+Math.random(),life:.45+Math.random()*.25});}
function setupScene(){
  scene=new THREE.Scene();
  const sky=document.createElement('canvas');sky.width=8;sky.height=256;const ctx=sky.getContext('2d'),grad=ctx.createLinearGradient(0,0,0,256);
  grad.addColorStop(0,'#e3e9d6');grad.addColorStop(.7,'#ebe8d2');grad.addColorStop(1,'#eee3c5');ctx.fillStyle=grad;ctx.fillRect(0,0,8,256);
  const skyTexture=new THREE.CanvasTexture(sky);skyTexture.colorSpace=THREE.SRGBColorSpace;scene.background=skyTexture;
  scene.fog=new THREE.Fog('#e8e4c9',30,95);
  const pmrem=new THREE.PMREMGenerator(renderer);const env=new RoomEnvironment();scene.environment=pmrem.fromScene(env,.08).texture;scene.environmentIntensity=.40;env.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#fffbea','#b7aa75',1.25));
  const key=keyLight=new THREE.DirectionalLight('#fff0c7',2.3);key.position.set(-8,16,9);key.castShadow=true;const profile=renderProfile(touchDevice?'mobile':'desktop',devicePixelRatio);key.shadow.mapSize.set(profile.shadowSize,profile.shadowSize);
  key.shadow.camera.left=-14;key.shadow.camera.right=20;key.shadow.camera.top=12;key.shadow.camera.bottom=-10;
  key.shadow.camera.near=1;key.shadow.camera.far=60;key.shadow.normalBias=.035;key.shadow.bias=-.00015;key.shadow.radius=5;key.target.position.set(1,0,0);scene.add(key,key.target);
  const fill=new THREE.DirectionalLight('#f4f6e4',.8);fill.position.set(5,5,-8);scene.add(fill);
  const floor=mesh(new THREE.PlaneGeometry(500,180),sand,[0,-.045,-25]);floor.rotation.x=-Math.PI/2;floor.castShadow=false;scene.add(floor);
  const path=mesh(new THREE.PlaneGeometry(420,3.6),new THREE.MeshStandardMaterial({color:'#ddcc9f',roughness:1}),[0,-.025,0]);path.rotation.x=-Math.PI/2;path.castShadow=false;scene.add(path);
  for(const z of [-1.83,1.83]){
    const border=mesh(new THREE.PlaneGeometry(420,.055),new THREE.MeshStandardMaterial({color:'#f2e8c9',roughness:1}),[0,-.018,z]);border.rotation.x=-Math.PI/2;border.castShadow=false;scene.add(border);
  }
  const rng=mulberry(489);
  const pebbleGeo=new THREE.IcosahedronGeometry(1,0),pebbleMat=new THREE.MeshStandardMaterial({color:'#c4bc8f',roughness:1});
  for(let i=0;i<65;i++){
    const z=(rng()>.5?1:-1)*(2.1+rng()*4.5),x=-20+rng()*90;
    const p=mesh(pebbleGeo,pebbleMat,[x,.04,z],[.05+rng()*.12,.04+rng()*.08,.05+rng()*.1]);p.rotation.y=rng()*6;
    p.castShadow=false;scene.add(p);scenery.push({node:p,x,z,speed:1,span:90});
  }
  for(let i=0;i<28;i++){
    const p=mesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshStandardMaterial({color:i%2?'#ded1a4':'#f1e6c5',roughness:1}),[-15+i*2.7,.001,(i%2?1:-1)*1.85],[.08,.012,.025]);
    p.castShadow=false;scene.add(p);scenery.push({node:p,x:p.position.x,z:p.position.z,speed:1,span:76});
  }
  for(let i=0;i<13;i++){
    const z=-9-rng()*15,x=-25+rng()*105,h=.7+rng()*2.0;
    const c=cactus(h,.7+rng()*.4,new THREE.MeshStandardMaterial({color:i%2?'#abb490':'#a3ad88',roughness:1}));c.position.set(x,0,z);c.rotation.y=rng()*1.8;scene.add(c);
    c.castShadow=false;scenery.push({node:c,x,z,speed:.28,span:105});
  }
  for(let i=0;i<10;i++){
    const h=2+rng()*5,w=8+rng()*14;
    const dune=mesh(new THREE.SphereGeometry(1,18,10),new THREE.MeshStandardMaterial({color:i%2?'#d7d5b3':'#dcd7b6',roughness:1}),[-50+i*13,-1.5,-25-rng()*23],[w,h,w*.5]);
    dune.castShadow=false;scene.add(dune);
  }
  const sun=mesh(new THREE.SphereGeometry(2.0,20,14),new THREE.MeshBasicMaterial({color:'#f5ebbc'}),[22,16,-56]);sun.castShadow=false;scene.add(sun);
  dustPositions=new Float32Array(180);dustPositions.fill(1000);const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
  dustPoints=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#c7b47e',size:.075,transparent:true,opacity:.40,depthWrite:false}));scene.add(dustPoints);
  sparkPositions=new Float32Array(300);sparkPositions.fill(1000);const sparkGeo=new THREE.BufferGeometry();sparkGeo.setAttribute('position',new THREE.BufferAttribute(sparkPositions,3));
  sparkPoints=new THREE.Points(sparkGeo,new THREE.PointsMaterial({color:'#ffdf63',size:.12,transparent:true,opacity:.95,depthWrite:false}));scene.add(sparkPoints);
  reviewFloor=mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#eae9e5',roughness:1}),[0,-.02,0]);reviewFloor.rotation.x=-Math.PI/2;reviewFloor.castShadow=false;reviewFloor.visible=false;scene.add(reviewFloor);
}
function mulberry(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function updatePose(dt){
  if(!model||(game.phase==='paused'&&!experience.pickerOpen))return;
  if(game.phase==='running')runPhase+=dt*(game.speed*.98+2);
  if(!reviewHeld&&!experience.pickerOpen)announceAction(director.step(dt,game));
  if(review&&!director.active)director.play('laugh');
  const poseGame=experience.pickerOpen?{...game,phase:'ready'}:game;
  const p=samplePose(poseGame,reviewShape?0:clockTime,runPhase,(reviewShape||experience.pickerOpen)?null:director.active,landing),lerp=1-Math.exp(-dt*18),lerpSlow=1-Math.exp(-dt*6);
  if(reviewShape){p.belly=1;p.blink=0;p.rootY=0;}
  landing=Math.max(0,landing-dt*5);
  const showcase=game.phase==='ready'||game.phase==='over'||experience.pickerOpen;
  const portrait=$('#arena').clientWidth<600;
  const reviewHeight=Math.max(6.1,6.5/camera.aspect);
  const showcaseX=portrait?0:experience.pickerOpen?6.2:3.9;
  hero.position.x=THREE.MathUtils.lerp(hero.position.x,review?0:showcase?showcaseX:game.playerX,lerpSlow);
  const targetSize=review&&camera.aspect<1?1.45:review?1.60:showcase?1.45:1;
  const size=THREE.MathUtils.lerp(hero.scale.x,targetSize,lerpSlow);hero.scale.setScalar(size);
  const heading=review?-Math.atan2(hero.position.x,camera.position.z)+(reviewShape?-.99:-.72+.15*p.laughFace):(showcase?.10:1.12)+p.yaw;
  model.rotation.y=THREE.MathUtils.lerp(model.rotation.y,heading,lerpSlow);
  model.rotation.x=THREE.MathUtils.lerp(model.rotation.x,p.tiltX,lerp);
  model.rotation.z=THREE.MathUtils.lerp(model.rotation.z,p.tiltZ,lerp);
  model.position.x=THREE.MathUtils.lerp(model.position.x,p.modelX,lerp);
  model.position.y=THREE.MathUtils.lerp(model.position.y,p.modelY,lerp);
  model.scale.set(.78*p.scaleXZ,THREE.MathUtils.lerp(model.scale.y,.78*p.scaleY,lerp),.78*p.scaleXZ);
  for(const [name,angles] of Object.entries(p.rot)){
    const {bone,rotation}=rig[name];
    for(const [i,axis] of ['x','y','z'].entries())bone.rotation[axis]=THREE.MathUtils.lerp(bone.rotation[axis],rotation[axis]+angles[i],lerp);
  }
  rig.root.bone.position.y=rig.root.position.y+p.rootY;
  fitBellyHands(THREE,rig,p.belly,p.bow,p.handLift);
  plantLaughFeet(THREE,model,rig,plantedFootWeight(game,director.active,p));
  laughFace.setExpression(p.laughFace,p.mouth);
  for(const o of morphs){
    o.visible=p.laughFace<=.08;
    o.morphTargetInfluences[0]=o.name.startsWith('Eye')?p.blink:p.mouth;
  }
  visualY=THREE.MathUtils.lerp(visualY,showcase?0:game.y,showcase?lerpSlow:1);hero.position.y=visualY;
  shieldBubble.visible=game.phase==='running'&&(game.shield||(game.grace>0&&Math.sin(clockTime*35)>0));
  shieldBubble.material.opacity=game.shield?.11+.025*Math.sin(clockTime*5):.25;
  $('#action-label').classList.toggle('on',!!director.active);
  if(review&&referenceFrames.length){
    const sourceTime=3.4+(reviewShape?0:director.active?.time||0);let index=0;
    referenceFrames.forEach((f,i)=>{if(Math.abs(f.time-sourceTime)<Math.abs(referenceFrames[index].time-sourceTime))index=i;});
    if(lastReference!==index){lastReference=index;$('#reference-image').src=referenceFrames[index].image;}
    $('#reference-caption').textContent=`参考视频 · ${referenceFrames[index].time.toFixed(1)} 秒`;
    $('#review-stage-label').textContent=`当前 3D ${reviewShape?'外形 · 静态对照':`动作 · ${reviewHeld?'定格对照':'连贯播放'}`}`;
  }
  if(review&&!referenceFrames.length)$('#review-stage-label').textContent=`小黄剧场 · ${reviewShape?'站立':reviewHeld?'定格欣赏':'捧腹大笑'}`;
  // A small DOM diagnostic lets manual QA verify real loaded bones rather than a mock rig.
  if(frames%12===0){const c=$('#game');c.dataset.action=director.active?.name||'idle';c.dataset.pose=JSON.stringify({time:director.active?.time,spine:rig.spine.bone.rotation.x,head:rig.head.bone.rotation.x,leftThigh:rig['thigh.L'].bone.rotation.x,rightThigh:rig['thigh.R'].bone.rotation.x,leftArm:rig['upper_arm.L'].bone.rotation.z,tilt:model.rotation.z,mouth:p.mouth});}
}
function resize(){
  if(!renderer)return;const r=$('#arena').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;
  const recommendMobile=matchMedia('(pointer: coarse)').matches||innerWidth<760;$('#mobile-recommend').hidden=!recommendMobile;$('#desktop-recommend').hidden=recommendMobile;
  if(review){camera.fov=28;const h=camera.aspect<1?6.5:5.8,distance=h/(2*Math.tan(THREE.MathUtils.degToRad(14)));camera.position.set(0,2.5,distance);camera.lookAt(0,1.9,0);camera.updateProjectionMatrix();return;}
  if(r.width<600&&(experience.pickerOpen||game.phase==='ready')){camera.fov=32;const h=experience.pickerOpen?9.7:7.0,distance=h/(2*Math.tan(THREE.MathUtils.degToRad(16)));camera.position.set(0,experience.pickerOpen?2.3:4,distance);camera.lookAt(0,experience.pickerOpen?-1.1:.6,0);camera.updateProjectionMatrix();return;}
  camera.fov=36;
  const width=Math.min(23.5,Math.max(14.5,r.width/50));
  const distance=width/(2*Math.tan(THREE.MathUtils.degToRad(36/2))*camera.aspect);
  const offset=new THREE.Vector3(4.6,5.0,17).normalize().multiplyScalar(distance);
  const targetX=game.playerX+width*.30;
  camera.position.copy(offset).add(new THREE.Vector3(targetX,1.0,0));camera.lookAt(targetX,1.0,0);camera.updateProjectionMatrix();
}
function updateEvents(){for(const e of game.takeEvents()){
  if(e.type==='jump'){beep('jump');director.active=null;}if(e.type==='land'){beep('land');puff(10);landing=1;}
  if(e.type==='start'){for(const id of [...obstacleMeshes.keys()])removeObstacle(id);dust.length=0;sparks.length=0;runPhase=0;visualY=0;director.reset();director.wait=6;}
  if(e.type==='milestone'){beep('milestone');toast(`${e.score} 分！继续向前跑。`);}
  if(e.type==='coin'){beep('coin');sparkle(e.x,e.y);}
  if(e.type==='shield-ready'){beep('shield');toast('攒满 5 枚金币！护盾替你挡一次碰撞');sparkle(game.playerX,1.4,24);}
  if(e.type==='shield-break'){beep('shield');toast('护盾挡住啦！继续向前');sparkle(game.playerX,1.5,32);}
  if(e.type==='hit'){newRecord=game.score>bestBefore.value;beep('hit');puff(16);saveBest();announceAction(director.play('roll'));}
}}
function animate(now){
  requestAnimationFrame(animate);if(document.hidden){last=now;return;}
  if((game.phase!=='running'||reviewHeld)&&now-last<1000/30-1)return;
  const dt=Math.min((now-last)/1000,.05);last=now;
  if(game.phase!=='paused'&&!reviewHeld)clockTime+=dt;
  if(ready){if(!review&&!experience.pickerOpen)game.step(dt);updateEvents();if(lastPhase!==game.phase){syncUI();resize();}updatePose(dt);syncObstacles();syncCoins();}
  for(const s of scenery)s.node.position.x=((s.x-game.distance*s.speed+26)%s.span+s.span)%s.span-26;
  if(game.phase==='running'&&game.grounded&&!reduced&&Math.random()<dt*20)puff(1);
  if(game.phase!=='paused'){
    for(let i=dust.length-1;i>=0;i--){const p=dust[i];p.life-=dt;if(p.life<=0){dust.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy-=2*dt;}
    for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.life-=dt;if(p.life<=0){sparks.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=5*dt;}
  }
  dustPositions.fill(1000);dust.slice(-60).forEach((p,i)=>{dustPositions[i*3]=p.x;dustPositions[i*3+1]=Math.max(.01,p.y);dustPositions[i*3+2]=p.z;});dustPoints.geometry.attributes.position.needsUpdate=true;
  sparkPositions.fill(1000);sparks.forEach((p,i)=>{sparkPositions[i*3]=p.x;sparkPositions[i*3+1]=Math.max(.02,p.y);sparkPositions[i*3+2]=p.z;});sparkPoints.geometry.attributes.position.needsUpdate=true;
  $('#score').textContent=pad(game.score);$('#distance').textContent=`${Math.floor(game.distance)} m · ${(game.speed/9).toFixed(1)}×`;
  $('#coins').textContent=game.coins;$('#shield').textContent=game.shield?'护盾已就绪':`护盾 ${game.coins%5} / 5`;
  $('#shield').classList.toggle('charged',game.shield);
  if(frames%6===0)$('#game').dataset.world=JSON.stringify({phase:game.phase,y:game.y,heroX:hero.position.x,heroY:hero.position.y,duck:game.duck,grounded:game.grounded,shield:game.shield,grace:game.grace,obstacles:game.obstacles.map(o=>({kind:o.kind,gap:o.x-game.playerX}))});
  if(performance.now()>toastUntil)$('#toast').classList.remove('on');
  renderer.render(scene,camera);frames++;
  if(frames%30===0){$('#game').dataset.drawCalls=renderer.info.render.calls;$('#game').dataset.pixelRatio=renderer.getPixelRatio();}
}
Object.defineProperty(window,'runnerState',{get:()=>({phase:game.phase,score:game.score,best,y:game.y,grounded:game.grounded,duck:game.duck,speed:game.speed,
  distance:game.distance,obstacles:game.obstacles.map(o=>({kind:o.kind,x:o.x,bottom:o.bottom,height:o.height})),characterLoaded:ready,frames,
  geometries:renderer?.info.memory.geometries,drawCalls:renderer?.info.render.calls})});
async function boot(){
  renderer=new THREE.WebGLRenderer({canvas:$('#game'),antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(renderProfile(touchDevice?'mobile':'desktop',devicePixelRatio).pixelRatio);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
  $('#game').addEventListener('webglcontextlost',e=>{e.preventDefault();if(game.phase==='running'){game.togglePause();syncUI();}$('#error').hidden=false;$('#error').textContent='画面暂时中断，请刷新页面重新进入。你的最高分已经保存。';});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  camera=new THREE.PerspectiveCamera(36,1,.1,180);setupScene();resize();new ResizeObserver(resize).observe($('#arena'));
  hero=new THREE.Group();hero.position.x=4.5;hero.scale.setScalar(1.5);scene.add(hero);
  const b64=$('#embedded-model').textContent.trim();let bytes;
  if(b64){bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));}else{
    const response=await fetch('./assets/golden-character-v08.glb');if(!response.ok)throw Error('角色资源暂时无法下载');bytes=new Uint8Array(await response.arrayBuffer());
  }
  $('#loading').textContent='正在准备角色动作…';
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');model=gltf.scene;model.scale.setScalar(.78);model.rotation.y=.20;hero.add(model);
  const loadedBones=[];
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(o.morphTargetInfluences)morphs.push(o);}if(o.isBone)loadedBones.push(o);});
  rig=bindCharacterRig(loadedBones);$('#game').dataset.rigBones=Object.keys(rig).join(',');
  let body;model.traverse(o=>{if(o.isMesh&&o.name==='Body')body=o;});
  laughFace=createLaughFace(THREE,rig.head.bone,makeFaceSurface(THREE,body),{body,model,rig});
  shieldBubble=mesh(new THREE.SphereGeometry(1,24,18),new THREE.MeshBasicMaterial({color:'#a8e6cf',transparent:true,opacity:.13,depthWrite:false,wireframe:true}),[0,1.18,0],[1.05,1.46,.90]);shieldBubble.castShadow=false;shieldBubble.visible=false;hero.add(shieldBubble);
  ready=true;$('#start').disabled=false;$('#loading').hidden=true;document.body.classList.add('ready');syncUI();
  last=performance.now();requestAnimationFrame(animate);
}
syncUI();
boot().catch(e=>{$('#error').hidden=false;$('#error').textContent='小黄还没准备好。请检查网络，使用支持 WebGL 的现代浏览器，再刷新页面试试。';$('#loading').textContent='加载未完成，请刷新重试';console.error(e);});
