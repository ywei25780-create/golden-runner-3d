import test from 'node:test';
import assert from 'node:assert/strict';
import {RunnerGame} from './engine.mjs';
const make=()=>new RunnerGame({random:()=>.5});
function run(g,seconds,dt=1/60){for(let i=0;i<Math.round(seconds/dt);i++)g.step(dt);}

test('start, pause and restart restore the correct state',()=>{
  const g=make();g.start?.();assert.equal(g.phase,'running');
  run(g,.3);const d=g.distance;g.togglePause();run(g,.5);assert.equal(g.distance,d);
  g.togglePause();assert.equal(g.phase,'running');
  g.obstacles=[{id:90,kind:'cactus',x:g.playerX,width:.6,height:1.2,bottom:0}];
  run(g,.05);assert.equal(g.phase,'over');
  g.start();assert.equal(g.phase,'running');assert.equal(g.score,0);assert.equal(g.y,0);
  assert.equal(g.obstacles.length,1);
});
test('jump clears a cactus, rejects a double jump, and lands',()=>{
  const g=make();g.start?.();assert.equal(typeof g.jump,'function');
  g.obstacles=[{id:90,kind:'cactus',x:g.playerX+3.6,width:.6,height:1.35,bottom:0}];
  assert.equal(g.jump(),true);assert.equal(g.jump(),false);
  run(g,.6);assert.equal(g.phase,'running');assert.ok(g.y>0);
  g.obstacles=[];run(g,.7);assert.equal(g.y,0);assert.equal(g.grounded,true);
});
test('collision is detected between rendering frames',()=>{
  const g=make();g.start?.();assert.equal(typeof g.step,'function');
  g.obstacles=[{id:90,kind:'cactus',x:g.playerX+.8,width:.2,height:1.4,bottom:0}];
  g.step(.1);assert.equal(g.phase,'over');
});
test('a brief touch jump is high enough for the tallest cactus',()=>{
  const g=make();g.start();g.obstacles=[{id:90,kind:'cactus',x:g.playerX+3.5,width:.7,height:1.50,bottom:0}];
  g.jump();g.releaseJump();run(g,.7);assert.equal(g.phase,'running');
});
test('ducking passes under a bird which hits a standing player',()=>{
  for(const duck of [false,true]){
    const g=make();g.start?.();assert.equal(typeof g.setDuck,'function');
    g.setDuck(duck);g.obstacles=[{id:90,kind:'bird',x:g.playerX+.8,width:.7,height:.6,bottom:1.55}];
    run(g,.22);assert.equal(g.phase,duck?'running':'over');
  }
});
test('variable frame rates give equivalent motion and safe obstacle spacing',()=>{
  const a=make(),b=make();a.start?.();b.start?.();assert.equal(typeof a.step,'function');
  a.obstacles=[];b.obstacles=[];a.spawnIn=b.spawnIn=50;
  run(a,1,1/60);run(b,1,1/30);
  assert.ok(Math.abs(a.distance-b.distance)<.2);assert.equal(a.score,b.score);
  a.obstacles=[];a.spawnIn=0;run(a,.02);const first=a.obstacles[0];assert.ok(first);
  const delay=a.spawnIn;assert.ok(delay>1.35);assert.ok(a.speed<=17);
});

test('coins are collected once, add points, and every five coins grant a shield',()=>{
  const g=make();g.start();g.obstacles=[];g.spawnIn=99;
  g.pickups=Array.from({length:5},(_,i)=>({id:100+i,x:g.playerX,y:1.1}));
  run(g,.05);assert.equal(g.coins,5);assert.equal(g.shield,true);
  assert.equal(g.bonus,50);assert.ok(g.score>=50);assert.equal(g.pickups.length,0);
  run(g,.1);assert.equal(g.coins,5);
  assert.ok(g.takeEvents().some(e=>e.type==='shield-ready'));
});
test('a shield absorbs one collision, gives brief grace, then normal collisions still end a run',()=>{
  const g=make();g.start();g.shield=true;g.spawnIn=99;g.pickups=[];
  const obstacle=()=>({id:90,kind:'cactus',x:g.playerX,width:.6,height:1.3,bottom:0});
  g.obstacles=[obstacle()];run(g,.05);assert.equal(g.phase,'running');assert.equal(g.shield,false);
  assert.ok(g.takeEvents().some(e=>e.type==='shield-break'));
  g.obstacles=[obstacle()];run(g,.05);assert.equal(g.phase,'running');
  g.obstacles=[];run(g,1.5);g.obstacles=[obstacle()];run(g,.05);assert.equal(g.phase,'over');
  g.start();assert.equal(g.coins,0);assert.equal(g.bonus,0);assert.equal(g.shield,false);
});
