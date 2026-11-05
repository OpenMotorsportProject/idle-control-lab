'use strict';

(() => {
  const root = document.getElementById('live-idle-control');
  const $ = selector => root.querySelector(selector);
  const sliders = Array.from(root.querySelectorAll('input[data-key]'));
  const defaultSettings = IdleModel.defaults;
  const cfg = {...IdleModel.lastSession};
  const {dt, clamp} = IdleModel;
  const historySeconds = 12, sampleSteps = 4;
  let engine, samples, tick, splitPhase, blipUntil;
  let running = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, previous = null, carry = 0, lastPaint = 0;
  const outputs = Object.fromEntries(sliders.map(el => [el.dataset.key,$('[data-value="' + el.dataset.key + '"]')]));
  const runButton = $('[data-run]'), blipButton = $('[data-blip]'), acSwitch = $('[data-ac]');
  const liveRpm = $('[data-rpm]'), liveValve = $('[data-valve]'), liveMode = $('[data-mode]'), liveStatus = $('[data-status]');
  function physicalThrottle() {
    return Math.min(20, cfg.throttle + (tick < blipUntil ? 8 : 0));
  }
  function sample() {
    return {time:tick * dt, rpm:engine.rpm, target:cfg.target, rate:engine.rate,
      error:engine.rpm - cfg.target, gap:splitPhase};
  }
  function record() {
    samples.push(sample());
    splitPhase = false;
    while (samples.length > 2 && samples[1].time < tick * dt - historySeconds - dt) samples.shift();
  }
  function step() {
    IdleModel.step(engine, cfg, physicalThrottle());
    tick++;
    if (tick % sampleSteps === 0) record();
  }
  function startEngine(preview) {
    tick = 0; blipUntil = 0; splitPhase = false;
    engine = IdleModel.createEngine();
    samples = [];
    record();
    if (preview) {
      for (let n=0; n<100; n++) step();
      blipUntil = tick + 60;
      for (let n=0; n<90; n++) step();
    }
    carry = 0; previous = null;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const fg = 'var(--muted-foreground)', activeColor = 'var(--viz-series-1)';
  function svgNode(parent,type,attrs,content) {
    const el = document.createElementNS(ns,type);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);
    if (content !== undefined) el.textContent = content;
    parent.append(el);
    return el;
  }
  function makeChart(svg,phase) {
    const backdrop = svgNode(svg,'g',{}), axes = svgNode(svg,'g',{});
    const target = phase ? null : svgNode(svg,'path',{fill:'none',stroke:fg,'stroke-dasharray':'5 4','stroke-width':1.5});
    const path = svgNode(svg,'path',{fill:'none',stroke:activeColor,'stroke-linejoin':'round','stroke-width':2.2});
    const dot = svgNode(svg,'circle',{r:4,fill:activeColor,stroke:'var(--background)','stroke-width':1});
    return {svg,phase,backdrop,axes,target,path,dot,width:0,cacheKey:''};
  }
  const charts = [makeChart($('[data-chart=speed]'),false),makeChart($('[data-chart=phase]'),true)];
  function tickStep(rough) {
    const decade = Math.pow(10,Math.floor(Math.log10(Math.max(1,rough))));
    const step = [1,2,2.5,5,10].find(n => n * decade >= rough);
    return (step || 10) * decade;
  }
  function axisRange(low,high,parts) {
    const stride = tickStep((high-low) / parts);
    const start = Math.floor(low/stride)*stride, end = Math.ceil(high/stride)*stride;
    const ticks = [];
    for (let v=start; v<=end+stride/10; v+=stride) ticks.push(v);
    return {start,end,ticks};
  }
  function pathData(points,x,y,phase) {
    return points.map((p,i) => ((i === 0 || (phase && p.gap)) ? 'M' : 'L') + x(p).toFixed(1) + ',' + y(p).toFixed(1)).join('');
  }
  function drawChart(chart,data,now,limits) {
    const {svg,axes,backdrop,phase} = chart;
    const w = chart.width, h = 203;
    if (!w) return;
    const left = 64, right = w-9, top = 12, bottom = h-43;
    const xRange = phase ? limits.error : {start:-historySeconds,end:0,ticks:[-12,-8,-4,0]};
    const yRange = phase ? limits.rate : limits.rpm;
    const buffer = 6;
    const x = v => left+buffer + (v-xRange.start)/(xRange.end-xRange.start)*(right-left-2*buffer);
    const y = v => bottom-buffer - (v-yRange.start)/(yRange.end-yRange.start)*(bottom-top-2*buffer);
    const key = [w,xRange.start,xRange.end,yRange.start,yRange.end].join('|');
    if (chart.cacheKey !== key) {
      chart.cacheKey = key; backdrop.replaceChildren(); axes.replaceChildren();
      svg.setAttribute('viewBox','0 0 '+w+' '+h);
      svgNode(backdrop,'rect',{x:left,y:top,width:right-left,height:bottom-top,fill:'none',stroke:'var(--border)','data-chart-frame':''});
      const label = (x,y,str,props={}) => svgNode(axes,'text',{x,y,'text-anchor':'middle',...props},str);
      const compact = (ticks,max) => ticks.length <= max ? ticks : ticks.filter((v,i) => v===0 || i%Math.ceil(ticks.length/max)===0);
      for (const v of compact(xRange.ticks,w<400 ? 4 : 6)) {
        const anchor = (v===xRange.start && phase) ? 'start' : v===xRange.end ? 'end' : 'middle';
        label(x(v),bottom+15,v,{'text-anchor':anchor});
      }
      for (const v of compact(yRange.ticks,5)) {
        label(left-6,y(v)+4,v,{'text-anchor':'end'});
      }
      if (phase) {
        svgNode(backdrop,'line',{x1:left,x2:right,y1:y(0),y2:y(0),stroke:'var(--border)'});
        svgNode(backdrop,'line',{x1:x(0),x2:x(0),y1:top,y2:bottom,stroke:'var(--border)'});
      }
      label((left+right)/2,h-4,phase ? 'RPM error · actual − target (RPM)' : 'Time relative to now (s)',{class:'axis-title','data-axis':'x'});
      label(0,0,phase ? 'RPM change (RPM/s)' : 'Speed (RPM)',{transform:'translate(14 '+(top+bottom)/2+') rotate(-90)',class:'axis-title','data-axis':'y'});
    }
    const xp = phase ? p => x(p.error) : p => x(p.time-now);
    const yp = phase ? p => y(p.rate) : p => y(p.rpm);
    const last = data[data.length-1];
    chart.path.setAttribute('d',pathData(data,xp,yp,phase));
    chart.dot.setAttribute('cx',xp(last)); chart.dot.setAttribute('cy',yp(last));
    if (chart.target) {
      let targetPath = 'M'+xp(data[0]).toFixed(1)+','+y(data[0].target).toFixed(1);
      let prior = data[0].target;
      for (let i=1;i<data.length;i++) {
        if (data[i].target !== prior) {
          targetPath += 'H'+xp(data[i]).toFixed(1)+'V'+y(data[i].target).toFixed(1);
          prior = data[i].target;
        }
      }
      targetPath += 'H'+xp(last).toFixed(1);
      chart.target.setAttribute('d',targetPath);
    }
  }
  function paint() {
    const now = tick * dt;
    const data = samples.filter(p=>p.time >= now-historySeconds-1e-7);
    data.push(sample());
    let lowRpm=cfg.target-80,highRpm=cfg.target+80,lowError=-80,highError=80,lowRate=-150,highRate=150;
    for (const p of data) {
      lowRpm=Math.min(lowRpm,p.rpm,p.target); highRpm=Math.max(highRpm,p.rpm,p.target);
      lowError=Math.min(lowError,p.error); highError=Math.max(highError,p.error);
      lowRate=Math.min(lowRate,p.rate); highRate=Math.max(highRate,p.rate);
    }
    const limits = {rpm:axisRange(Math.max(0,lowRpm),highRpm,4),error:axisRange(lowError,highError,4),rate:axisRange(lowRate,highRate,4)};
    charts.forEach(chart=>drawChart(chart,data,now,limits));
    liveRpm.textContent = Math.round(engine.rpm).toLocaleString('en-US');
    liveValve.textContent = Math.round(engine.valve)+'%';
    liveMode.textContent = engine.stalled ? 'Engine stalled · reset to restart' : engine.idling ? 'Idle control active' : 'Off idle · valve held';
    const pulse = tick < blipUntil;
    blipButton.textContent = pulse ? 'Blipping…' : 'Blip throttle';
    outputs.throttle.textContent = cfg.throttle+'%' + (pulse ? ' · '+physicalThrottle()+'% with blip' : '');
    const stateText = running ? 'Running' : 'Paused';
    if (liveStatus.textContent !== stateText) liveStatus.textContent = stateText;
    liveStatus.dataset.running = String(running);
    runButton.textContent = running ? 'Pause' : 'Run';
  }
  function syncControls() {
    for (const el of sliders) {
      const k = el.dataset.key; el.value = cfg[k];
      outputs[k].textContent = k==='target' ? cfg[k]+' RPM' : cfg[k];
    }
    acSwitch.checked = cfg.ac;
    $('#feedforward').checked = cfg.feedforward;
  }
  const storageKey = 'idle-control-lab.v1';
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({settings:cfg, priority:priority.value, running})); }
    catch { /* The lab also runs when the browser disables storage for local files. */ }
  }
  function restore() {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(storageKey)); } catch { return false; }
    if (!stored?.settings || typeof stored.settings !== 'object') return false;
    for (const input of sliders) {
      const key = input.dataset.key;
      const value = stored.settings[key];
      if (Number.isFinite(value)) {
        input.value = clamp(value, Number(input.min), Number(input.max));
        cfg[key] = Number(input.value);
      }
    }
    if (typeof stored.settings.ac === 'boolean') cfg.ac = stored.settings.ac;
    if (typeof stored.settings.feedforward === 'boolean') cfg.feedforward = stored.settings.feedforward;
    if (typeof stored.running === 'boolean') running = stored.running;
    if (Object.hasOwn(IdleOptimizer.priorities, stored.priority)) priority.value = stored.priority;
    return true;
  }
  function advance(stamp) {
    raf=0;
    if (!running || document.hidden || !root.isConnected) return;
    if (previous !== null) carry+=Math.min(.12,Math.max(0,(stamp-previous)/1000));
    previous=stamp;
    while (carry+1e-10 >= dt) {step(); carry-=dt;}
    if (stamp-lastPaint>=60) {paint(); lastPaint=stamp;}
    raf=requestAnimationFrame(advance);
  }
  function schedule() {
    if (raf) cancelAnimationFrame(raf);
    raf=0; previous=null;
    if (running && !document.hidden) raf=requestAnimationFrame(advance);
  }
  for (const el of sliders) {
    const key=el.dataset.key;
    el.addEventListener('input',()=>{
      if (key==='target' && Number(el.value)!==cfg.target) splitPhase=true;
      cfg[key]=Number(el.value);
      if (key !== 'throttle') clearComparison();
      if (key==='i' && cfg.i===0) engine.trim=0;
      syncControls(); paint();
    });
    el.addEventListener('change',save);
  }
  acSwitch.addEventListener('change',()=>{cfg.ac=acSwitch.checked;paint();save();});
  blipButton.addEventListener('click',()=>{blipUntil=tick+60;paint();});
  runButton.addEventListener('click',()=>{running=!running;schedule();paint();save();});
  $('[data-reset]').addEventListener('click',()=>{
    clearComparison(); priority.value='balanced'; Object.assign(cfg,defaultSettings); startEngine(false); syncControls(); paint(); schedule(); save();
  });
  const priority = $('#priority');
  const optimizeButton = $('#optimize'), cancelButton = $('#cancel'), applyButton = $('#apply');
  const progress = $('#opt-status'), results = $('#results');
  let searchTask = null, result = null, pending = null;
  const gains = () => ({p:cfg.p, i:cfg.i, d:cfg.d});
  const gainLabel = tune => [tune.p, tune.i, tune.d].join(' / ');
  function endSearch() {
    clearTimeout(pending);
    pending = null;
    searchTask = null;
    optimizeButton.disabled = false;
    cancelButton.hidden = true;
  }
  function clearComparison() {
    endSearch();
    result = null;
    results.hidden = true;
    progress.textContent = '';
  }
  function row(body, label, start, proposed) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = label;
    tr.append(th);
    for (const value of [start, proposed]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    body.append(tr);
  }
  function showResult(snapshot, found, proposedStrategy = cfg.feedforward, strategyTest = false) {
    result = found;
    result.proposedStrategy = proposedStrategy;
    result.strategyTest = strategyTest;
    result.originalTraces = IdleOptimizer.evaluate(snapshot, cfg.target, priority.value, {capture:true,feedforward:cfg.feedforward}).events;
    result.proposedTraces = IdleOptimizer.evaluate(found.gains, cfg.target, priority.value, {capture:true,feedforward:proposedStrategy}).events;
    const {baseline, best} = found;
    const body = $('#comparison'), eventRows = $('#event-rows');
    body.replaceChildren();
    eventRows.replaceChildren();
    row(body, 'P / I / D', gainLabel(snapshot), gainLabel(found.gains));
    row(body, 'A/C load feedforward', cfg.feedforward ? 'On' : 'Off', proposedStrategy ? 'On' : 'Off');
    for (const [key,label,unit] of [
      ['score','Weighted score',''], ['mean','Mean absolute RPM error',' RPM'],
      ['peak','Worst peak error',' RPM'], ['movement','Mean valve travel',' pp/s']
    ]) {
      row(body, label, baseline[key].toFixed(2)+unit, best[key].toFixed(2)+unit);
    }
    row(body, 'Time at a valve limit', (baseline.saturation*100).toFixed(1)+'%', (best.saturation*100).toFixed(1)+'%');
    if (baseline.stalled || best.stalled) row(body, 'Stall detected', baseline.stalled ? 'Yes' : 'No', best.stalled ? 'Yes' : 'No');
    for (let i=0; i<best.events.length; i++) {
      row(eventRows, best.events[i].name, baseline.events[i].mean.toFixed(2)+' RPM', best.events[i].mean.toFixed(2)+' RPM');
    }
    const improved = best.score < baseline.score - 1e-8;
    const change = (100 * Math.abs(1 - best.score / baseline.score)).toFixed(1);
    const context = ' at '+cfg.target+' RPM · '+priority.selectedOptions[0].textContent;
    if (strategyTest && Math.abs(best.score-baseline.score) < 1e-8) {
      $('#result-summary').textContent = 'Both strategies had the same score'+context;
    } else if (strategyTest || improved) {
      $('#result-summary').textContent = change+'% '+(improved ? 'lower' : 'higher')+' score'+context;
    } else {
      $('#result-summary').textContent = 'The starting tune had the best score in this search.';
    }
    applyButton.disabled = !strategyTest && !improved;
    applyButton.textContent = strategyTest ? 'Apply proposed strategy' : improved ? 'Apply proposed gains' : 'Current gains retained';
    results.hidden = false;
    drawReplay();
    $('#comparison-title').focus();
    progress.textContent = strategyTest ? 'Both strategies used the same PID gains.' : found.trials+' gain sets tested. Comparison ready.';
  }
  optimizeButton.addEventListener('click', () => {
    clearComparison();
    const snapshot = gains();
    const job = IdleOptimizer.search(snapshot, cfg.target, priority.value, cfg.feedforward);
    searchTask = job;
    optimizeButton.disabled = true;
    cancelButton.hidden = false;
    progress.textContent = 'Testing gain sets…';
    let lastAnnouncement = performance.now();
    function batch() {
      if (searchTask !== job) return;
      const stopAt = performance.now() + 10;
      do {
        const next = job.next();
        if (next.done) {
          endSearch();
          showResult(snapshot, next.value);
          return;
        }
        if (performance.now() - lastAnnouncement > 250) {
          progress.textContent = next.value+' gain sets tested…';
          lastAnnouncement = performance.now();
        }
      } while (performance.now() < stopAt);
      pending = setTimeout(batch, 8);
    }
    pending = setTimeout(batch, 0);
  });
  $('#strategy').addEventListener('click', () => {
    clearComparison();
    const current = gains();
    const benchmark = feedforward => IdleOptimizer.evaluate(current, cfg.target, priority.value, {feedforward});
    eventPicker.value = '0';
    showResult(current, {gains:current, baseline:benchmark(cfg.feedforward), best:benchmark(!cfg.feedforward)}, !cfg.feedforward, true);
  });
  $('#feedforward').addEventListener('change', e => {
    cfg.feedforward = e.target.checked;
    clearComparison(); paint(); save();
  });
  cancelButton.addEventListener('click', () => {clearComparison(); progress.textContent = 'Search canceled.';});
  priority.addEventListener('change', () => {clearComparison(); save();});
  applyButton.addEventListener('click', () => {
    if (!result || applyButton.disabled) return;
    Object.assign(cfg, result.gains);
    cfg.feedforward = result.proposedStrategy;
    if (!cfg.i) engine.trim = 0;
    syncControls(); paint(); save();
    applyButton.disabled = true;
    applyButton.textContent = 'Applied to simulator';
    progress.textContent = result.strategyTest ? 'Proposed strategy applied.' : 'Proposed gains applied.';
  });
  const replay = $('#replay-plot'), eventPicker = $('#event'), signalPicker = $('#signal');
  function drawReplay() {
    if (!result || results.hidden) return;
    const event = Number(eventPicker.value), signal = signalPicker.value;
    const before = result.originalTraces[event].trace, after = result.proposedTraces[event].trace;
    const both = [...before, ...after];
    const phase = signal === 'phase';
    const ordinate = p => phase ? p.rate : p[signal];
    const values = both.map(ordinate);
    const low = Math.min(...values), high = Math.max(...values);
    const pad = Math.max(signal === 'valve' ? 2 : 10, (high - low) * 0.04);
    const domain = axisRange(phase ? Math.min(0,low)-pad : Math.max(0,low-pad), high+pad, 4);
    const errors = both.map(p=>p.rpm-p.target);
    const xRange = phase ? axisRange(Math.min(0,...errors)-5,Math.max(0,...errors)+5,4)
                         : {start:0,end:12,ticks:[0,4,8,12]};
    const width = Math.round(replay.getBoundingClientRect().width), height = 211;
    if (!width) return;
    const left = 64, right = width - 12, top = 12, bottom = height - 41;
    const pixelX = value => left + 5 + (value-xRange.start)/(xRange.end-xRange.start) * (right-left-10);
    const x = point => pixelX(phase ? point.rpm-point.target : point.time);
    const y = value => bottom - 5 - (value - domain.start) / (domain.end - domain.start) * (bottom - top - 10);
    replay.setAttribute('viewBox', '0 0 '+width+' '+height);
    replay.replaceChildren();
    svgNode(replay,'rect',{x:left,y:top,width:right-left,height:bottom-top,stroke:'var(--border)',fill:'none'});
    function label(px,py,content,attrs={}) {
      svgNode(replay,'text',{x:px,y:py,'text-anchor':'middle',...attrs},content);
    }
    for (const value of domain.ticks) label(left-7,y(value)+4,value,{'text-anchor':'end'});
    const xTicks = (width<400 && xRange.ticks.length>4) ? xRange.ticks.filter((_,i)=>i%2===0) : xRange.ticks;
    for (const value of xTicks) label(pixelX(value),bottom+16,value,{'text-anchor':value===xRange.end?'end':value===xRange.start?'start':'middle'});
    label((left+right)/2,height-3,phase ? 'RPM error · actual − target (RPM)' : 'Trial time (s)');
    const yLabel = phase ? 'RPM change (RPM/s)' : signal==='rpm' ? 'Speed (RPM)' : 'Idle valve (%)';
    label(0,0,yLabel,{transform:'translate(14 '+(top+bottom)/2+') rotate(-90)'});
    if (phase) {
      svgNode(replay,'line',{x1:pixelX(0),x2:pixelX(0),y1:top,y2:bottom,stroke:'var(--border)'});
      svgNode(replay,'line',{x1:left,x2:right,y1:y(0),y2:y(0),stroke:'var(--border)'});
    } else {
      const markers = [
        [[2,'A/C on'],[7,'A/C off']], [[2.6,'Release']], [[2,'Target step']]
      ][event];
      for (const [time,name] of markers) {
        svgNode(replay,'line',{x1:pixelX(time),x2:pixelX(time),y1:top,y2:bottom,stroke:'var(--border)'});
        label(pixelX(time)+4,top+13,name,{'text-anchor':'start'});
      }
    }
    // Draw the dashed starting tune on top so identical traces are still legible.
    for (const [points,color,dash,thickness] of [[after,activeColor,'none',2.6],[before,fg,'5 4',1.5]]) {
      const trajectory = phase ? points.map((p,i)=>({...p,gap:i>0 && p.target!==points[i-1].target})) : points;
      svgNode(replay,'path',{d:pathData(trajectory,x,p=>y(ordinate(p)),phase),stroke:color,fill:'none','stroke-dasharray':dash,'stroke-width':thickness});
    }
    replay.setAttribute('aria-label',result.best.events[event].name+' benchmark: starting and proposed '+signalPicker.selectedOptions[0].textContent.toLowerCase());
  }
  eventPicker.addEventListener('change',drawReplay);
  signalPicker.addEventListener('change',drawReplay);
  new ResizeObserver(drawReplay).observe(replay);
  const hasSaved = restore();
  startEngine(!hasSaved); syncControls();
  function measure() {
    for (const chart of charts) chart.width=Math.round(chart.svg.getBoundingClientRect().width);
    paint();
  }
  const observer = new ResizeObserver(measure);
  charts.forEach(chart=>observer.observe(chart.svg));
  measure(); schedule();
  document.addEventListener('visibilitychange',schedule);
})();
