export class RunnerGame {
  constructor({random=Math.random}={}) {
    this.random=random;this.playerX=-4.8;this.phase='ready';this.events=[];
    this.y=0;this.vy=0;this.grounded=true;this.duck=false;
    this.distance=0;this.score=0;this.speed=9;this.obstacles=[];
    this.spawnIn=.1;this.accumulator=0;this.serial=0;this.milestone=0;
    this.pickups=[];this.coins=0;this.bonus=0;this.shield=false;this.grace=0;this.jumpBuffer=0;
  }
  emit(type,data={}){this.events.push({type,...data});}
  takeEvents(){const e=this.events;this.events=[];return e;}
  start(){
    this.phase='running';this.y=0;this.vy=0;this.grounded=true;this.duck=false;
    this.distance=0;this.score=0;this.speed=9;this.accumulator=0;this.milestone=0;
    this.obstacles=[this.createObstacle('cactus',13)];this.spawnIn=.1;
    this.coins=0;this.bonus=0;this.shield=false;this.grace=0;this.jumpBuffer=0;
    this.pickups=[0,1,2,3,4].map(i=>({id:++this.serial,x:-.5+i*1.6,y:1.08}));
    this.events=[];this.emit('start');
  }
  jump(){
    if(this.phase==='ready'||this.phase==='over')this.start();
    if(this.phase!=='running')return false;
    if(!this.grounded){this.jumpBuffer=.12;return false;}
    this.jumpBuffer=0;this.duck=false;this.vy=10.4;this.grounded=false;this.emit('jump');return true;
  }
  releaseJump(){if(this.phase==='running'&&this.vy>9.8)this.vy=9.8;}
  setDuck(v){if(this.phase==='running')this.duck=!!v;}
  togglePause(){
    if(this.phase==='running'){this.phase='paused';this.duck=false;this.emit('pause');}
    else if(this.phase==='paused'){this.phase='running';this.emit('resume');}
    this.accumulator=0;this.jumpBuffer=0;
  }
  createObstacle(kind,x=29){
    const bird=kind==='bird';
    return {id:++this.serial,kind,x,width:bird?1.05:.62+this.random()*.42,
      height:bird?.62:1.10+this.random()*.40,bottom:bird?1.62:0,passed:false};
  }
  step(elapsed){
    if(this.phase!=='running')return;
    this.accumulator+=Math.min(Math.max(elapsed,0),.1);
    const dt=1/120;
    while(this.accumulator+1e-9>=dt&&this.phase==='running'){
      this.accumulator-=dt;this.update(dt);
    }
  }
  update(dt){
    this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);
    this.speed=Math.min(17,9+this.distance*.006);
    this.distance+=this.speed*dt;this.score=Math.floor(this.distance*3)+this.bonus;
    this.grace=Math.max(0,this.grace-dt);
    if(!this.grounded){
      this.vy-=(this.duck&&this.vy<0?42:24)*dt;this.y+=this.vy*dt;
      if(this.y<=0){this.y=0;this.vy=0;this.grounded=true;this.emit('land');if(this.jumpBuffer>0)this.jump();}
    }
    this.spawnIn-=dt;
    if(this.spawnIn<=0){
      const kind=this.score>140&&this.random()<.30?'bird':'cactus';
      this.obstacles.push(this.createObstacle(kind));
      // Ground coins precede each obstacle; one extra coin rewards jumping over it.
      this.pickups.push(...[0,1,2].map(i=>({id:++this.serial,x:20+i*1.6,y:1.08})),{id:++this.serial,x:29,y:3.0});
      this.spawnIn=Math.max(1.5,2.05-(this.speed-9)*.045)+this.random()*.6;
    }
    const top=this.y+(this.duck&&this.grounded?1.20:2.30);
    const bottom=this.y+.17;
    for(const c of this.pickups){
      c.x-=this.speed*dt;
      if(!c.collected&&Math.abs(c.x-this.playerX)<.7&&c.y>bottom-.18&&c.y<top+.18){
        c.collected=true;this.coins++;this.bonus+=10;this.score=Math.floor(this.distance*3)+this.bonus;
        this.emit('coin',{x:c.x,y:c.y,coins:this.coins});
        if(this.coins%5===0){this.shield=true;this.emit('shield-ready');}
      }
    }
    this.pickups=this.pickups.filter(c=>!c.collected&&c.x>-13);
    for(const o of this.obstacles){
      o.x-=this.speed*dt;
      const xHit=Math.abs(o.x-this.playerX)<o.width*.5+.40;
      const yHit=bottom<o.bottom+o.height-.04&&top>o.bottom+.06;
      if(xHit&&yHit&&this.grace<=0){
        if(this.shield){this.shield=false;this.grace=1.2;this.emit('shield-break',{obstacle:o.id});o.x=-20;}
        else{this.phase='over';this.duck=false;this.emit('hit',{obstacle:o.id});break;}
      }
      if(!o.passed&&o.x+o.width*.5<this.playerX-.48){o.passed=true;this.emit('passed');}
    }
    this.obstacles=this.obstacles.filter(o=>o.x>-13);
    const milestone=Math.floor(this.score/100);
    if(milestone>this.milestone){this.milestone=milestone;this.emit('milestone',{score:milestone*100});}
  }
}
