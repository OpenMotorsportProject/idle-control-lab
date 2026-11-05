'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../model');

test('the distributed Rust runtime matches idle bench reference events and runs real parameter edits', async () => {
  const loader = fs.readFileSync(path.join(__dirname,'../neural-wasm.js'),'utf8');
  const bytes = vm.runInNewContext(loader+'\nneuralBytes',{atob,Uint8Array});
  const {instance:{exports:lab}} = await WebAssembly.instantiate(bytes);
  lab.lab_init(0);
  for (const cfg of [model.defaults, {...model.lastSession,target:1000,feedforward:true}]) {
    for (const blip of [false,true]) {
      lab.lab_event(Number(blip),cfg.target,cfg.p,cfg.i,cfg.d,Number(cfg.feedforward));
      const trace = new Float64Array(lab.memory.buffer,lab.lab_path(),lab.lab_frames()*10);
      const engine = model.createEngine();
      for (let n=0; n<=1200; n++) {
        if (n%4===0) assert(Math.abs(trace[n/4*10+1]-(engine.rpm-cfg.target))<1e-8);
        if(n<1200) model.step(engine,{...cfg,ac:!blip && n>=200 && n<700},blip && n>=200 && n<260 ? 8 : 0);
      }
    }
  }
  lab.lab_axis(4,20);lab.lab_edit(0,0.25);
  const edited = new Float64Array(lab.memory.buffer,lab.lab_path(),lab.lab_frames()*10);
  assert(lab.lab_metric(1)>lab.lab_metric(0)+0.05);
  assert(Math.abs(edited[17]-edited[14]-8)<1); // 0.04 s at roughly +200 RPM/s.
  lab.lab_init(1);lab.lab_axis(3,16);const baseline=lab.lab_metric(0);lab.lab_edit(0,0.25);
  assert.equal(lab.lab_metric(1),baseline);
});
