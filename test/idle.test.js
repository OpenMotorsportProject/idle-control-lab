'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model');
const optimizer = require('../optimizer');
const initial = {p:35, i:32, d:4};
function finish(job) {
  let next;
  do { next = job.next(); } while (!next.done);
  return next.value;
}
function advance(engine, cfg, seconds) {
  for (let i=0; i<Math.round(seconds/model.dt); i++) model.step(engine,cfg);
}
test('live model holds idle, recovers a load, and preserves off-idle valve hold', () => {
  const engine = model.createEngine(), cfg = {...model.defaults};
  advance(engine,cfg,2);
  assert.equal(engine.rpm,750);
  cfg.ac=true;
  advance(engine,cfg,0.5);
  assert(engine.rpm < 720);
  advance(engine,cfg,15);
  assert(Math.abs(engine.rpm-750)<1);
  cfg.throttle=8;
  const held=engine.valve;
  advance(engine,cfg,1);
  assert.equal(engine.valve,held);
  assert.equal(engine.idling,false);
  cfg.throttle=0;
  advance(engine,cfg,16);
  assert(engine.idling && Math.abs(engine.rpm-750)<1);
});
test('changing only feedforward changes the A/C event and leaves the other trials identical', () => {
  const a=optimizer.evaluate(initial,750,'balanced',{capture:true});
  const b=optimizer.evaluate(initial,750,'balanced',{capture:true,feedforward:true});
  assert(a.events[0].peak > b.events[0].peak);
  assert.deepEqual(a.events.slice(1),b.events.slice(1));
  assert.equal(a.events[0].trace.at(-1).time,12);
  assert.equal(a.events[2].trace.at(-1).target,850);
  assert.equal(optimizer.evaluate(initial,1100,'balanced',{capture:true}).events[2].trace.at(-1).target,1000);
});
test('search is repeatable, respects actuator and gain bounds, and scores the applied settings', () => {
  const first=finish(optimizer.search(initial,750,'balanced'));
  assert.deepEqual(first,finish(optimizer.search(initial,750,'balanced')));
  for (const [target,priority,ff,gains] of [[750,'balanced',false,initial],[600,'speed',true,{p:0,i:0,d:0}],[1100,'smooth',false,{p:70,i:60,d:14}]]) {
    const out=finish(optimizer.search(gains,target,priority,ff));
    assert(out.trials >= 150);
    assert(out.best.score <= out.baseline.score && Number.isFinite(out.best.score));
    assert.deepEqual(out.best,optimizer.evaluate(out.gains,target,priority,{feedforward:ff}));
    for (const [k,[min,max,step]] of Object.entries(model.bounds)) {
      assert(out.gains[k]>=min && out.gains[k]<=max && out.gains[k]%step===0);
    }
    const captured=optimizer.evaluate(out.gains,target,priority,{capture:true,feedforward:ff});
    for (const e of captured.events) assert(e.trace.every(p=>p.valve>=0 && p.valve<=100 && Number.isFinite(p.rpm)));
  }
});
test('selecting less valve movement changes the tradeoff for the saved tune', () => {
  const speed=finish(optimizer.search(initial,750,'speed'));
  const smooth=finish(optimizer.search(initial,750,'smooth'));
  assert(smooth.best.movement < speed.best.movement);
  assert(speed.best.mean < smooth.best.mean);
});
