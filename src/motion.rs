//! Reference and learned rollouts start together and receive identical forcing.
use crate::network::{acceleration, evaluate, idle_inputs, Kind, Weights, SCALE};
pub const DT: f64 = 0.01;
#[derive(Clone)]
pub struct Trial {
    pub t: f64,
    pub states: [[f64; 2]; 3],
    pub torque: f64,
    pub load: f64,
    pub valve: f64,
    trim: f64,
    filtered: f64,
    delay: [f64; 11],
    index: usize,
}
impl Trial {
    pub fn new(kind: Kind) -> Self {
        let start = if kind == Kind::Idle {
            [750.0, 0.0]
        } else {
            [0.8, 0.0]
        };
        Self {
            t: 0.0,
            states: [start; 3],
            torque: 20.0,
            load: 0.0,
            valve: 32.0,
            trim: 0.0,
            filtered: 0.0,
            delay: [20.0; 11],
            index: 0,
        }
    }
    pub fn advance(
        &mut self,
        kind: Kind,
        base: &Weights,
        edit: &Weights,
        blip: bool,
        controller: [f64; 5],
    ) {
        if kind == Kind::Hamiltonian {
            self.states[0] = rk4(self.states[0], |s| [s[1], -s[0]]);
            for (i, w) in [base, edit].into_iter().enumerate() {
                self.states[i + 1] = rk4(self.states[i + 1], |s| {
                    evaluate(kind, w, [s[0], s[1], 0.0]).1
                });
            }
        } else {
            let [target, kp, ki, kd, feedforward] = controller;
            let time = (self.t / DT).round() as u32;
            let pedal = if blip && (200..260).contains(&time) {
                8.0
            } else {
                0.0
            };
            self.load = if !blip && (200..700).contains(&time) {
                10.0
            } else {
                0.0
            };
            let [rpm, rate] = self.states[0];
            self.filtered += (rate - self.filtered) * DT / (0.09 + DT);
            let e = (target - rpm) / 100.0;
            if ki == 0.0 {
                self.trim = 0.0;
            }
            if pedal == 0.0 {
                let pd =
                    32.0 + feedforward * self.load / 0.625 + kp * e - kd * self.filtered / 100.0;
                let delta = ki * e * DT;
                if (delta > 0.0 && pd + self.trim < 100.0) || (delta < 0.0 && pd + self.trim > 0.0)
                {
                    self.trim = (self.trim + delta).clamp(-100.0, 100.0);
                }
                self.valve = (pd + self.trim).clamp(0.0, 100.0);
            }
            let delayed = self.delay[self.index];
            self.delay[self.index] = self.valve * 0.625 + pedal * 3.2;
            self.index = (self.index + 1) % 11;
            self.torque += (delayed - self.torque) * DT / (0.24 + DT);
            for i in 0..3 {
                let n = self.states[i][0];
                let a = if i == 0 {
                    acceleration(n, self.torque, self.load)
                } else {
                    let w = if i == 1 { base } else { edit };
                    SCALE * evaluate(kind, w, idle_inputs(n, self.torque, self.load)).1[0]
                };
                self.states[i] = [(n + DT * a).max(0.0), a];
            }
        }
        self.t += DT;
    }
}
fn rk4(s: [f64; 2], f: impl Fn([f64; 2]) -> [f64; 2]) -> [f64; 2] {
    let add = |k: [f64; 2], d: f64| [s[0] + d * k[0], s[1] + d * k[1]];
    let a = f(s);
    let b = f(add(a, DT / 2.0));
    let c = f(add(b, DT / 2.0));
    let d = f(add(c, DT));
    std::array::from_fn(|i| s[i] + DT * (a[i] + 2.0 * b[i] + 2.0 * c[i] + d[i]) / 6.0)
}
