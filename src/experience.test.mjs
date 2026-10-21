import test from 'node:test';
import assert from 'node:assert/strict';
import {RunnerGame} from './engine.mjs';
import {PlayExperience} from './experience.mjs';

test('playing requires an explicit device choice, including after reopening the picker',()=>{
  const s=new PlayExperience();assert.equal(s.allowsPlay,false);
  assert.equal(s.choose('unknown'),false);assert.equal(s.allowsPlay,false);
  s.choose('mobile');assert.equal(s.allowsPlay,true);assert.equal(s.mode,'mobile');
  s.openPicker();assert.equal(s.allowsPlay,false);s.choose('desktop');assert.equal(s.allowsPlay,true);
});

test('a jump pressed just before landing is buffered and starts on contact',()=>{
  const g=new RunnerGame();g.start();g.obstacles=[];g.pickups=[];g.spawnIn=20;
  g.grounded=false;g.y=.08;g.vy=-4;
  assert.equal(g.jump(),false);
  g.step(.05);
  assert.equal(g.grounded,false,'the buffered press must jump on landing');
  assert.ok(g.vy>8);
  assert.equal(g.takeEvents().filter(e=>e.type==='jump').length,1);
});

test('pause clears buffered input instead of triggering a surprise jump on resume',()=>{
  const g=new RunnerGame();g.start();g.obstacles=[];g.spawnIn=20;
  g.grounded=false;g.y=.08;g.vy=-4;g.jump();g.togglePause();g.togglePause();g.step(.05);
  assert.equal(g.grounded,true);assert.equal(g.vy,0);
});
