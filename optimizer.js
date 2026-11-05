'use strict';

const IdleOptimizer = ((model) => {
  const {dt, bounds, clamp, step, createEngine} = model;
  const priorities = {
    balanced: {peak: 0.10, movement: 0.55},
    speed: {peak: 0.22, movement: 0.08},
    smooth: {peak: 0.04, movement: 2.0}
  };
  const scenarios = ['A/C on and off', 'Throttle release', 'Target step'];

  // Condition the engine once, then replay each event from an independent copy.
  function evaluate(gains, target, priority = 'balanced', {capture = false, feedforward = false} = {}) {
    const cfg = {...gains, target, throttle: 0, ac: false, feedforward};
    const warm = createEngine();
    for (let n = 0; n < 2000; n++) step(warm, cfg);
    const events = scenarios.map((name, event) => {
      const engine = {...warm, delay: warm.delay.slice()};
      const trace = capture ? [] : null;
      cfg.target = target;
      cfg.ac = false;
      let absoluteError = 0, peak = 0, valveTravel = 0, saturated = 0, count = 0;
      for (let n = 0; n < 1200; n++) {
        cfg.ac = event === 0 && n >= 200 && n < 700;
        const pedal = event === 1 && n >= 200 && n < 260 ? 8 : 0;
        if (event === 2 && n === 200) cfg.target += target <= 1000 ? 100 : -100;
        const previousDuty = engine.valve;
        step(engine, cfg, pedal);
        if (capture && (n % 4 === 0 || n === 1199)) {
          trace.push({time:(n + 1) * dt, target:cfg.target, rpm:engine.rpm, rate:engine.rate, valve:engine.valve});
        }
        if (n < (event === 1 ? 260 : 200)) continue;
        const error = Math.abs(cfg.target - engine.rpm);
        absoluteError += error;
        peak = Math.max(peak, error);
        valveTravel += Math.abs(engine.valve - previousDuty);
        if (engine.valve <= 0.001 || engine.valve >= 99.999) saturated++;
        count++;
      }
      return {name, trace, mean: absoluteError / count, peak, movement: valveTravel / (count * dt),
        saturation: saturated / count, stalled: engine.stalled};
    });
    const average = key => events.reduce((sum, trial) => sum + trial[key], 0) / events.length;
    const mean = average('mean'), peak = Math.max(...events.map(trial => trial.peak));
    const movement = average('movement'), saturation = average('saturation');
    const stalled = events.some(trial => trial.stalled);
    const weights = priorities[priority];
    const score = mean + weights.peak * peak + weights.movement * movement + 12 * saturation + (stalled ? 10000 : 0);
    return {score, mean, peak, movement, saturation, stalled, events};
  }

  // Yield between trials so the browser can keep animating and accept input.
  function* search(initial, target, priority = 'balanced', feedforward = false) {
    const baseline = evaluate(initial, target, priority, {feedforward});
    let gains = {...initial}, best = baseline;
    const seen = new Set([[initial.p, initial.i, initial.d].join(',')]);
    function trial(p, i, d) {
      const candidate = {p, i, d};
      const key = [p, i, d].join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      const result = evaluate(candidate, target, priority, {feedforward});
      if (result.score < best.score - 1e-8) {gains = candidate; best = result;}
      return true;
    }
    for (const p of [0, 15, 30, 45, 60, 70]) {
      for (const i of [0, 10, 25, 40, 60]) {
        for (const d of [0, 2, 5, 9, 14]) {
          if (trial(p, i, d)) yield seen.size;
        }
      }
    }
    // Search smaller neighborhoods using the same resolution as the live sliders.
    for (const [dp, di, dd] of [[7, 7, 2], [3, 3, 1], [1, 1, 0.5]]) {
      for (let pass = 0; pass < 3; pass++) {
        const center = gains;
        for (const po of [-dp, 0, dp]) {
          for (const io of [-di, 0, di]) {
            for (const doff of [-dd, 0, dd]) {
              if (trial(clamp(center.p + po, bounds.p[0], bounds.p[1]), clamp(center.i + io, bounds.i[0], bounds.i[1]),
                  clamp(center.d + doff, bounds.d[0], bounds.d[1]))) yield seen.size;
            }
          }
        }
        if (center === gains) break;
      }
    }
    return {baseline, best, gains, trials: seen.size};
  }
  return {search, evaluate, priorities};
})(typeof module !== 'undefined' && module.exports ? require('./model.js') : IdleModel);
if (typeof module !== 'undefined' && module.exports) module.exports = IdleOptimizer;
