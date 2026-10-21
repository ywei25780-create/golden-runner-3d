import {REFERENCE_MOTION} from './reference-motion.mjs';
export const BONE_NAMES=['root','pelvis','spine','chest','neck','head','upper_arm.L','forearm.L','hand.L','thigh.L','shin.L','foot.L','upper_arm.R','forearm.R','hand.R','thigh.R','shin.R','foot.R','tail'];
function referenceAt(t){
  let lo=0,hi=REFERENCE_MOTION.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(REFERENCE_MOTION[mid][0]<t)lo=mid;else hi=mid;}
  const a=REFERENCE_MOTION[lo],b=REFERENCE_MOTION[hi],w=Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  return a.slice(1).map((v,i)=>v+(b[i+1]-v)*w);
}
export function plantedFootWeight(state,action,pose){return state.phase!=='running'&&action?.name==='laugh'?pose.laughFace:0;}
const key=name=>name.replace(/[\s_.:[\]/]/g,'').toLowerCase();
export function bindCharacterRig(nodes){
  const lookup=new Map(nodes.map(b=>[key(b.name),b])),rig={};
  for(const name of BONE_NAMES){
    const bone=lookup.get(key(name));
    if(!bone)throw Error(`角色骨骼缺失: ${name}`);
    rig[name]={bone,rotation:bone.rotation.clone(),position:bone.position.clone()};
  }
  return rig;
}
export const ACTIONS={
  laugh:{duration:5.0,label:'哈哈哈…笑到直不起腰'},
  roll:{duration:2.2,label:'笑倒了，蹬蹬小短腿'},
  wave:{duration:2.5,label:'嘿！一起跑呀'},
};
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export class ActionDirector{
  constructor({random=Math.random}={}){this.random=random;this.previous='';this.reset();}
  reset(){this.active=null;this.wait=1.5;this.pending=false;}
  request(){this.pending=true;}
  play(name){this.active={name,time:0};this.previous=name;this.pending=false;return {name,label:ACTIONS[name].label};}
  step(dt,state){
    if(state.phase==='paused')return null;
    const running=state.phase==='running';
    if(running&&(!state.grounded||state.duck))this.active=null;
    if(this.active){
      this.active.time+=dt;
      if(this.active.time>=ACTIONS[this.active.name].duration){this.active=null;this.wait=5+this.random()*4;}
      return null;
    }
    this.wait-=dt;
    const safe=!running||(state.grounded&&!state.duck&&!state.obstacles.some(o=>o.x>state.playerX-1&&o.x<state.playerX+state.speed*1.8));
    if(!safe||(!this.pending&&this.wait>0))return null;
    const choices=(running?['laugh','wave']:Object.keys(ACTIONS)).filter(n=>n!==this.previous);
    return this.play(choices[Math.floor(this.random()*choices.length)]);
  }
}

// The same pose sampler drives the live skinned mesh and the animation regression tests.
export function samplePose(state,time,runPhase,action=null,landing=0){
  const running=state.phase==='running',air=running&&!state.grounded,duck=running&&state.duck&&state.grounded;
  const p={rot:Object.fromEntries(BONE_NAMES.map(n=>[n,[0,0,0]])),rootY:0,scaleY:1,scaleXZ:1,modelX:0,modelY:0,tiltX:0,tiltZ:0,yaw:0,mouth:0,blink:0,belly:0,laughFace:0,bow:0,handLift:[0,0]};
  const r=(n,x=0,y=0,z=0)=>p.rot[n]=[x,y,z];
  const s=running&&state.grounded&&!duck?Math.sin(runPhase):0;
  r('thigh.L',air?-.72:s*.88);r('thigh.R',air?-.40:-s*.88);
  r('shin.L',air?1.13:Math.max(0,s)*1.05);r('shin.R',air?1.0:Math.max(0,-s)*1.05);
  r('foot.L',air?-.38:-s*.22);r('foot.R',air?-.30:s*.22);
  r('upper_arm.L',air?-1.05:-s*.76,0,air?.30:.06);r('upper_arm.R',air?-1.05:s*.76,0,air?-.30:-.06);
  r('forearm.L',-.48);r('forearm.R',-.48);
  r('chest',running?.06:Math.sin(time*1.6)*.022);r('head',running?-.05:Math.sin(time*.8)*.035,Math.sin(time*.7)*.045);
  r('pelvis',0,0,running&&state.grounded?s*.035:0);r('tail',Math.sin(time*3)*.13);
  p.rootY=running&&state.grounded&&!duck?Math.abs(Math.cos(runPhase))*.08:Math.sin(time*1.6)*.012;
  if(air){p.tiltX=-.10;p.mouth=.22;}
  if(duck){p.scaleY=.53;p.scaleXZ=1.10;r('chest',.24);r('thigh.L',-.36);r('thigh.R',-.36);r('shin.L',.70);r('shin.R',.70);}
  if(landing>0&&!air){p.scaleY-=landing*.14;p.scaleXZ+=landing*.06;}
  const blink=time%4.1;p.blink=blink<.18?Math.sin(blink/.18*Math.PI):0;
  if(!action)return p;
  const {name,time:t}=action,d=ACTIONS[name].duration;
  const w=smooth(t/.38)*smooth((d-t)/.42),pulse=Math.sin(t*17),sway=Math.sin(t*6);
  const set=(n,x=0,y=0,z=0)=>{p.rot[n]=p.rot[n].map((v,i)=>v*(1-w)+[x,y,z][i]*w);};
  p.mouth=Math.max(p.mouth,(.68+.22*Math.sin(t*12))*w);p.yaw=running?-.32*w:-.20*w;
  if(name==='laugh'){
    set('upper_arm.L',-.60,-.40,-.20);set('upper_arm.R',-.60,.40,.20);
    set('forearm.L',-.95,-.35,-1.10);set('forearm.R',-.95,.35,1.10);
    set('hand.L',.14,0,.12);set('hand.R',.14,0,-.12);
    const [bow,rebound,nearLift,farLift]=referenceAt(t);
    const recover=smooth(nearLift/.40);
    set('spine',-.10*(1-recover*.9)+bow*.68+rebound*.30);set('chest',-.05*(1-recover)+bow*.17+rebound*.40,-nearLift*.06);
    set('neck',-.12*(1-recover*.7)+bow*.24);set('head',-.24*(1-recover*.75)+bow*.35+rebound*.40);
    p.handLift=[nearLift*.72,farLift*.72];
    p.belly=w;p.laughFace=w;p.bow=bow;p.mouth=(.94-.30*bow+.035*Math.sin(t*13)+.015*Math.sin(t*21))*w;p.blink=Math.max(p.blink,w);
    p.yaw=running?-.30*w:-.48*w;
    if(!running){
      p.tiltZ=0;p.rootY=(rebound-.012-bow*.18)*w;
      set('thigh.L',-bow*.23);set('thigh.R',-bow*.23);set('shin.L',bow*.46);set('shin.R',bow*.46);set('foot.L',-bow*.23);set('foot.R',-bow*.23);
    }
  }else if(name==='roll'&&!running){
    const down=smooth(t/.32)*smooth((d-t)/.65),kick=Math.sin(t*Math.PI*2*3.2);
    p.tiltZ=-1.43*down;p.modelY=.72*down;p.modelX=-1.05*down;p.yaw=-.30*down;
    set('thigh.L',-.30+kick*.45);set('thigh.R',-.30-kick*.45);
    set('shin.L',.75+kick*.4);set('shin.R',.75-kick*.4);
    set('upper_arm.L',-.72,0,.18);set('upper_arm.R',-.72,0,-.18);
    set('forearm.L',-1.05,-.3,-.85);set('forearm.R',-1.05,.3,.85);set('head',-.16);
    p.tiltX=Math.sin(t*10)*.07*down;p.blink=Math.max(p.blink,.5*w);
    p.laughFace=w;p.mouth=(.88+.08*Math.sin(t*14))*w;p.belly=w;
  }else if(name==='wave'){
    set('upper_arm.L',-.30,0,1.75);set('forearm.L',-.15,0,.25+Math.sin(t*14)*.5);
    set('hand.L',0,.3*Math.sin(t*14),.2);set('head',-.04,-.18,.08*Math.sin(t*4));
    if(!running)p.tiltZ=.035*sway*w;
    p.mouth=.35*w;
  }
  return p;
}
