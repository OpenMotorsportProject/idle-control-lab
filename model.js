'use strict';

// Shared by the live instruments and every optimization trial.
const IdleModel = (() => {
  const dt = 0.01;
  const baseValve = 32;
  const torquePerDuty = 0.625;
  const rpmPerTorque = (60 / (2 * Math.PI)) / 0.24;
  const defaults = Object.freeze({target: 750, throttle: 0, p: 20, i: 10, d: 2, ac: false, feedforward: false});
  const lastSession = Object.freeze({...defaults, throttle: 1, p: 35, i: 32, d: 4});
  const bounds = Object.freeze({p: [0, 70, 1], i: [0, 60, 1], d: [0, 14, 0.5]});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function createEngine() {
    return {
      rpm: 750, rate: 0, filteredRate: 0, trim: 0, valve: baseValve, torque: 20,
      idling: true, stalled: false, delay: new Float64Array(11).fill(20), delayIndex: 0
    };
  }

  function step(engine, settings, pedal = settings.throttle) {
    if (pedal >= 2) engine.idling = false;
    if (pedal <= 1) engine.idling = true;
    const error = (settings.target - engine.rpm) / 100;
    engine.filteredRate += (engine.rate - engine.filteredRate) * dt / (0.09 + dt);
    if (!settings.i) engine.trim = 0;
    if (engine.idling && !engine.stalled) {
      const loadDuty = settings.feedforward && settings.ac ? 10 / torquePerDuty : 0;
      const pdDuty = baseValve + loadDuty + settings.p * error - settings.d * engine.filteredRate / 100;
      const wanted = pdDuty + engine.trim;
      const delta = settings.i * error * dt;
      if ((delta > 0 && wanted < 100) || (delta < 0 && wanted > 0)) {
        engine.trim = clamp(engine.trim + delta, -100, 100);
      }
      engine.valve = clamp(pdDuty + engine.trim, 0, 100);
    }
    const demand = torquePerDuty * engine.valve + 3.2 * pedal;
    const delayed = engine.delay[engine.delayIndex];
    engine.delay[engine.delayIndex] = demand;
    engine.delayIndex = (engine.delayIndex + 1) % engine.delay.length;
    engine.torque += (delayed - engine.torque) * dt / (0.24 + dt);
    const drag = Math.max(4, 20 + 0.040 * (engine.rpm - 750));
    const netTorque = (engine.stalled ? 0 : engine.torque) - drag - (settings.ac ? 10 : 0);
    const next = Math.max(0, engine.rpm + dt * rpmPerTorque * netTorque);
    engine.rate = (next - engine.rpm) / dt;
    engine.rpm = next;
    if (next < 350) {
      engine.stalled = true;
      engine.valve = 0;
    }
  }

  return {dt, defaults, lastSession, bounds, clamp, createEngine, step};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = IdleModel;
