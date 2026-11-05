'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  try {
    const {instance} = await WebAssembly.instantiate(neuralBytes);
    const rust = instance.exports;
    const span = rust.lab_span(), side = rust.lab_side(), frames = rust.lab_frames();
    const cameras = {land:{yaw:0.68,tilt:0.52}, motion:{yaw:0.75,tilt:0.52}};
    let kind=0, grid=[], history=[], energyMesh=[], time=0, playing=false, last=0, raf=0;
    let cfg={target:750,p:35,i:32,d:4,feedforward:false};
    try {
      const saved = JSON.parse(localStorage.getItem('idle-control-lab.v1'))?.settings;
      for (const [key, min, max] of [['target',600,1100], ['p',0,70], ['i',0,60], ['d',0,14]]) {
        if (Number.isFinite(saved?.[key])) cfg[key] = Math.max(min,Math.min(max,saved[key]));
      }
      if (typeof saved?.feedforward === 'boolean') cfg.feedforward = saved.feedforward;
    } catch { /* Local storage is optional. */ }
    const compact = n => n===0 ? '0' : Math.abs(n)<1e-12 ? '≈0' : Math.abs(n)<0.001 || Math.abs(n)>=10000 ? n.toExponential(2) : Number(n.toPrecision(4)).toString();
    const signed = n => (n>0?'+':'')+compact(n);
    function copy(ptr,n) {return Array.from(new Float64Array(rust.memory.buffer,ptr,n));}
    function labels() {
      const inputs=kind ? ['position','momentum'] : ['RPM','air torque','load'];
      const names=[];
      for (let i=1;i<=4;i++) {
        for (const input of inputs) names.push('H'+i+' · '+input+' weight');
        names.push('H'+i+' · hidden bias','H'+i+' · output weight');
      }
      return names.concat('Output bias');
    }
    function setAxes(changed) {
      const x=$('axis-x'),y=$('axis-y');
      if (x.value===y.value) {
        const other=changed==='axis-x'?y:x;
        other.value=String((Number(other.value)+1)%other.length);
      }
      rust.lab_axis(Number(x.value),Number(y.value));
      $('dx').value=0;$('dy').value=0;
      grid=copy(rust.lab_grid(),side*side);
      refresh();
    }
    function setModel() {
      kind=Number($('kind').value);
      rust.lab_init(kind);
      $('model-description').textContent=kind?'Learn a scalar energy function from observed position and momentum rates.':'Predict the change in engine speed from RPM, delivered air torque and accessory load.';
      $('phase-title').textContent=kind?'Hamiltonian energy surface':'Engine phase trajectory';
      $('phase-desc').textContent=kind?'Position (m) × momentum (kg·m/s) × learned energy (J)':'RPM error × RPM/s × elapsed time (s)';
      $('scenario-info').textContent=kind?'A 1 kg mass on a 1 N/m spring starts at 0.8 m with zero momentum.':'All three engines receive the reference controller’s air torque and accessory load. Target '+cfg.target+' RPM, P/I/D '+[cfg.p,cfg.i,cfg.d].join(' / ')+'.';
      $('event-label').hidden=Boolean(kind);
      for (const id of ['axis-x','axis-y']) {
        $(id).replaceChildren(...labels().map((label,i)=>new Option(label,i)));
      }
      $('axis-x').value=kind?'3':'4';
      $('axis-y').value=kind?'2':'20';
      rust.lab_event(Number($('event').value),cfg.target,cfg.p,cfg.i,cfg.d,Number(cfg.feedforward));
      time=3.2;
      setAxes();
    }
    function readPath() {
      const raw=copy(rust.lab_path(),frames*10);
      history=Array.from({length:frames},(_,i)=>[1,4,7].map(off=>raw.slice(i*10+off,i*10+off+3)));
    }
    function refresh() {
      readPath();
      const a=rust.lab_metric(0), b=rust.lab_metric(1);
      $('base-loss').textContent=compact(a);$('edit-loss').textContent=compact(b);$('delta-loss').textContent=signed(b-a);
      $('holdout').textContent=compact(Math.sqrt(rust.lab_metric(3))*(kind?1:800))+(kind?' norm.':' RPM/s');
      for (const axis of ['x','y']) {
        const delta=Number($('d'+axis).value), value=rust.lab_value(Number($('axis-'+axis).value))+delta;
        $('out-'+axis).textContent=(delta>=0?'+':'')+delta.toFixed(2)+' → '+value.toFixed(3);
      }
      energyMesh=[];
      if (kind) {
        const n=19;
        for(let j=0;j<n;j++) for(let i=0;i<n;i++) {
          const q=-1+2*i/(n-1),p=-1+2*j/(n-1);
          energyMesh.push([q,p,rust.lab_energy(q,p)]);
        }
      }
      draw();
    }
    function edit() {rust.lab_edit(Number($('dx').value),Number($('dy').value));refresh();}
    function bounds(values,floorSpan=0.1) {
      let lo=Math.min(...values),hi=Math.max(...values);
      const pad=Math.max((hi-lo)*0.04,floorSpan/2);
      return [lo-pad,hi+pad];
    }
    // Orthographic projection of three physical axes. A separate domain for each axis
    // keeps the numeric units explicit; depth sorting is used for the surface tiles.
    function makeView(id,domains) {
      const canvas=$(id),rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;
      if (!w || !h) return null;
      const ratio=Math.min(2,window.devicePixelRatio||1);
      if (canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)) {
        canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
      }
      const ctx=canvas.getContext('2d');
      ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
      const dark=matchMedia('(prefers-color-scheme: dark)').matches;
      const colors={ink:dark?'#e1eee7':'#263e33',muted:dark?'#acbdb2':'#536b60',wire:dark?'#40574a':'#cddad2',
        base:dark?'#94baff':'#285daa',edit:dark?'#ffa58b':'#b53e18',ref:dark?'#d3ddd6':'#455447'};
      const cam=cameras[id], cs=Math.cos(cam.yaw),sn=Math.sin(cam.yaw),st=Math.sin(cam.tilt),ct=Math.cos(cam.tilt);
      const scale=Math.min((w-72)/2.85,(h-55)/2.65);
      const norm=(v,k)=>2*(v-domains[k][0])/(domains[k][1]-domains[k][0])-1;
      function project(p) {
        const x=norm(p[0],0),y=norm(p[1],1),z=norm(p[2],2)*.76;
        const depth=x*sn+y*cs;
        return [w/2+(x*cs-y*sn)*scale,h/2+(depth*st-z*ct)*scale,depth*ct+z*st];
      }
      function stroke(points,color,width=1,dash=[]) {
        if(points.length<2)return;
        ctx.beginPath();ctx.setLineDash(dash);ctx.strokeStyle=color;ctx.lineWidth=width;
        points.forEach((p,i)=>{const [x,y]=project(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
        ctx.stroke();ctx.setLineDash([]);
      }
      function dot(point,color,ring=false) {
        const [x,y]=project(point);ctx.beginPath();ctx.arc(x,y,ring?6:3.8,0,Math.PI*2);
        if(ring){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();}else{ctx.fillStyle=color;ctx.fill();}
      }
      function tileMesh(points,n,light) {
        const faces=[];
        for(let j=0;j<n-1;j++)for(let i=0;i<n-1;i++){
          const a=j*n+i, f=[points[a],points[a+1],points[a+n+1],points[a+n]].map(project);
          faces.push({f,d:f.reduce((sum,p)=>sum+p[2],0),z:norm(points[a][2],2)});
        }
        faces.sort((a,b)=>a.d-b.d);
        for(const {f,z} of faces){
          const level=Math.max(0,Math.min(1,(z+1)/2));
          ctx.beginPath();f.forEach((p,i)=>{if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1]);});ctx.closePath();
          const luminance=dark?24+level*30:85-level*42;
          ctx.fillStyle='hsla('+(166+level*38)+',38%,'+luminance+'%,'+(light ? .33 : .87)+')';
          ctx.fill();ctx.strokeStyle=dark?'rgba(135,182,156,0.32)':'rgba(51,103,89,0.30)';ctx.lineWidth=.6;ctx.stroke();
        }
      }
      function axes(names) {
        const origin=domains.map(d=>d[0]);
        for(let k=0;k<3;k++){
          const endpoint=origin.slice();endpoint[k]=domains[k][1];
          stroke([origin,endpoint],colors.muted,1.15);
          const [px,py]=project(endpoint);
          const label=names[k]+' '+compact(endpoint[k]);
          ctx.font='11px system-ui';ctx.fillStyle=colors.ink;ctx.textAlign='center';
          const half=ctx.measureText(label).width/2+2;
          ctx.fillText(label,Math.max(half,Math.min(w-half,px)),Math.max(13,Math.min(h-4,py+(k===2?-7:14))));
        }
      }
      return {stroke,dot,tileMesh,axes,colors};
    }
    let lossPoints=[];
    function drawLoss() {
      const lo=Math.min(...grid),hi=Math.max(...grid);
      const view=makeView('land',[[-span,span],[-span,span],[0,Math.max(hi,lo+1e-6)*1.06]]);
      if (!view)return;
      if(lossPoints.length!==grid.length || lossPoints.grid!==grid){
        lossPoints=grid.map((z,i)=>[-span+2*span*(i%side)/(side-1),-span+2*span*Math.floor(i/side)/(side-1),z]);
        lossPoints.grid=grid;
      }
      view.tileMesh(lossPoints,side,false);view.axes(['ΔX','ΔY','MSE']);
      view.dot([0,0,rust.lab_metric(0)],view.colors.base,true);
      view.dot([Number($('dx').value),Number($('dy').value),rust.lab_metric(1)],view.colors.edit);
    }
    function drawMotion() {
      const all=history.flat().concat(energyMesh);
      const domains=[0,1,2].map(k=>bounds(all.map(p=>p[k]),kind ? .04 : k===0 ? 10 : k===1 ? 30 : .1));
      if (!kind) domains[2]=[0,12];
      const view=makeView('motion',domains);if(!view)return;
      if(kind)view.tileMesh(energyMesh,19,true);
      view.axes(kind?['q','p','J']:['ΔRPM','RPM/s','s']);
      const frame=Math.max(0,Math.min(frames-1,Math.round(time/.04)));
      const path=history.slice(0,frame+1);
      // Wider underlays keep coincident trajectories visible.
      [0,1,2].forEach((k)=>{
        const line=path.map(s=>s[k]),color=[view.colors.ref,view.colors.base,view.colors.edit][k];
        view.stroke(line,color,[4,3,1.7][k],[[1,5],[6,4],[]][k]);view.dot(line.at(-1),color,k<2);
      });
      const states=history[frame], trained=states[1][0], edited=states[2][0],offset=kind?0:cfg.target;
      const unit=kind?' m':' RPM';
      $('state-reading').textContent='Reference '+compact(states[0][0]+offset)+unit+' · trained '+compact(trained+offset)+unit+' · edited '+compact(edited+offset)+unit;
      $('time').textContent=(frame*.04).toFixed(2)+' s';$('scrub').value=frame*.04;
    }
    function draw(){if(!history.length)return;drawLoss();drawMotion();}
    function animate(stamp){
      if (!playing)return;
      if(last)time=Math.min(12,time+Math.min(.12,(stamp-last)/1000));
      last=stamp;drawMotion();
      if(time>=12){run(false);return;}
      raf=requestAnimationFrame(animate);
    }
    function run(on) {
      playing=on;cancelAnimationFrame(raf);last=0;
      $('play').textContent=on?'Pause':time>=12?'Replay':'Play';
      if(on)raf=requestAnimationFrame(animate);
    }
    for(const id of ['land','motion']){
      const canvas=$(id),cam=cameras[id];
      let drag=null;
      function turn(x,y){cam.yaw+=x;cam.tilt=Math.max(.12,Math.min(1.28,cam.tilt+y));id==='land'?drawLoss():drawMotion();}
      canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
      canvas.addEventListener('pointermove',e=>{if(!drag)return;turn((e.clientX-drag[0])*.009,(e.clientY-drag[1])*.008);drag=[e.clientX,e.clientY];});
      for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
      canvas.addEventListener('keydown',e=>{
        const delta={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.08],ArrowDown:[0,-.08]}[e.key];
        if(delta){e.preventDefault();turn(...delta);}
      });
    }
    $('kind').addEventListener('change',()=>{setModel();if(!playing)run(false);});
    for(const id of ['axis-x','axis-y'])$(id).addEventListener('change',()=>setAxes(id));
    for(const id of ['dx','dy'])$(id).addEventListener('input',edit);
    $('restore').addEventListener('click',()=>{$('dx').value=0;$('dy').value=0;edit();});
    $('event').addEventListener('change',()=>{rust.lab_event(Number($('event').value),cfg.target,cfg.p,cfg.i,cfg.d,Number(cfg.feedforward));readPath();drawMotion();});
    $('scrub').addEventListener('input',()=>{time=Number($('scrub').value);run(false);drawMotion();});
    $('play').addEventListener('click',()=>{if(time>=12)time=0;run(!playing);});
    $('restart').addEventListener('click',()=>{time=0;run(true);drawMotion();});
    $('ready').hidden=false;$('load-status').hidden=true;
    setModel();run(!matchMedia('(prefers-reduced-motion: reduce)').matches);
    new ResizeObserver(draw).observe($('ready'));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change',draw);
  } catch(error) {
    $('ready').hidden=true;$('load-status').hidden=false;$('load-status').textContent='The Rust simulator could not start. '+error.message;
  }
})();
