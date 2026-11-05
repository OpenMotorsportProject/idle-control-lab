//! Small scalar WebAssembly interface. Buffers remain valid until the next rebuild.
mod motion;
mod network;
use motion::Trial;
use network::{evaluate, loss, Fit, Kind, Weights};
use std::cell::RefCell;
const GRID: usize = 25;
const SPAN: f64 = 0.8;
const FRAMES: usize = 301;
struct Lab {
    fit: Fit,
    edit: Weights,
    axes: [usize; 2],
    landscape: Vec<f64>,
    path: Vec<f64>,
    metrics: [f64; 4],
    blip: bool,
    controller: [f64; 5],
}
impl Lab {
    fn new(kind: Kind) -> Self {
        let fit = Fit::train(kind);
        let edit = fit.base;
        let mut lab = Self {
            fit,
            edit,
            axes: [0, 1],
            landscape: vec![0.0; GRID * GRID],
            path: Vec::new(),
            metrics: [0.0; 4],
            blip: false,
            controller: [750.0, 35.0, 32.0, 4.0, 0.0],
        };
        lab.slice();
        lab.refresh();
        lab
    }
    fn slice(&mut self) {
        let mut w = self.fit.base;
        for row in 0..GRID {
            for col in 0..GRID {
                for (axis, index) in [(0, col), (1, row)] {
                    let k = self.axes[axis];
                    w[k] = self.fit.base[k] + SPAN * (2.0 * index as f64 / (GRID - 1) as f64 - 1.0);
                }
                self.landscape[row * GRID + col] = loss(self.fit.kind, &w, &self.fit.train);
            }
        }
    }
    fn refresh(&mut self) {
        let f = &self.fit;
        self.metrics = [
            loss(f.kind, &f.base, &f.train),
            loss(f.kind, &self.edit, &f.train),
            loss(f.kind, &f.base, &f.test),
            loss(f.kind, &self.edit, &f.test),
        ];
        self.rollout();
    }
    fn rollout(&mut self) {
        let kind = self.fit.kind;
        let mut trial = Trial::new(kind);
        self.path.clear();
        for frame in 0..FRAMES {
            self.path.push(trial.t);
            for (i, s) in trial.states.iter().enumerate() {
                let xyz = match kind {
                    Kind::Idle => [s[0] - self.controller[0], s[1], trial.t],
                    Kind::Hamiltonian => {
                        let h = if i == 0 {
                            0.5 * (s[0] * s[0] + s[1] * s[1])
                        } else {
                            anchored_energy(
                                if i == 1 { &self.fit.base } else { &self.edit },
                                s[0],
                                s[1],
                            )
                        };
                        [s[0], s[1], h]
                    }
                };
                self.path.extend(xyz);
            }
            if frame + 1 < FRAMES {
                for _ in 0..4 {
                    trial.advance(kind, &self.fit.base, &self.edit, self.blip, self.controller);
                }
            }
        }
    }
}
fn anchored_energy(w: &Weights, q: f64, p: f64) -> f64 {
    evaluate(Kind::Hamiltonian, w, [q, p, 0.0]).0 - evaluate(Kind::Hamiltonian, w, [0.0; 3]).0
}
thread_local! { static LAB:RefCell<Option<Lab>>=const{RefCell::new(None)}; }
fn with_lab<R>(f: impl FnOnce(&mut Lab) -> R) -> R {
    LAB.with_borrow_mut(|slot| f(slot.as_mut().expect("initialize the lab first")))
}
#[no_mangle]
pub extern "C" fn lab_init(kind: u32) {
    LAB.with_borrow_mut(|slot| {
        *slot = Some(Lab::new(if kind == 1 {
            Kind::Hamiltonian
        } else {
            Kind::Idle
        }))
    });
}
#[no_mangle]
pub extern "C" fn lab_axis(a: usize, b: usize) {
    with_lab(|l| {
        if a != b && a < l.fit.kind.count() && b < l.fit.kind.count() {
            l.axes = [a, b];
            l.edit = l.fit.base;
            l.slice();
            l.refresh();
        }
    });
}
#[no_mangle]
pub extern "C" fn lab_edit(dx: f64, dy: f64) {
    with_lab(|l| {
        for (k, delta) in l.axes.into_iter().zip([dx, dy]) {
            l.edit[k] = l.fit.base[k] + delta.clamp(-SPAN, SPAN);
        }
        l.refresh();
    });
}
#[no_mangle]
pub extern "C" fn lab_event(blip: u32, target: f64, p: f64, i: f64, d: f64, ff: u32) {
    with_lab(|l| {
        l.blip = blip != 0;
        l.controller = [target, p, i, d, if ff != 0 { 1.0 } else { 0.0 }];
        l.rollout();
    });
}
#[no_mangle]
pub extern "C" fn lab_value(i: usize) -> f64 {
    with_lab(|l| l.fit.base[i])
}
#[no_mangle]
pub extern "C" fn lab_metric(i: usize) -> f64 {
    with_lab(|l| l.metrics[i])
}
#[no_mangle]
pub extern "C" fn lab_initial_loss() -> f64 {
    with_lab(|l| l.fit.initial_loss)
}
#[no_mangle]
pub extern "C" fn lab_energy(q: f64, p: f64) -> f64 {
    with_lab(|l| anchored_energy(&l.edit, q, p))
}
#[no_mangle]
pub extern "C" fn lab_grid() -> *const f64 {
    with_lab(|l| l.landscape.as_ptr())
}
#[no_mangle]
pub extern "C" fn lab_path() -> *const f64 {
    with_lab(|l| l.path.as_ptr())
}
#[no_mangle]
pub extern "C" fn lab_frames() -> usize {
    FRAMES
}
#[no_mangle]
pub extern "C" fn lab_side() -> usize {
    GRID
}
#[no_mangle]
pub extern "C" fn lab_span() -> f64 {
    SPAN
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trained_models_generalize_and_surface_matches_edits() {
        for kind in [Kind::Idle, Kind::Hamiltonian] {
            let mut l = Lab::new(kind);
            assert!(l.metrics[0] < 0.01 * l.fit.initial_loss);
            assert!(l.metrics[2] < 0.004);
            assert!((l.landscape[GRID * GRID / 2] - l.metrics[0]).abs() < 1e-12);
            l.edit[0] += SPAN;
            l.edit[1] -= SPAN;
            l.refresh();
            assert!((l.landscape[GRID - 1] - l.metrics[1]).abs() < 1e-10);
            assert!(l.path.iter().all(|v| v.is_finite()));
            for frame in l.path.chunks_exact(10) {
                assert_eq!(frame.len(), 10);
            }
        }
    }
    #[test]
    fn canonical_flow_and_constant_energy_offset() {
        let mut l = Lab::new(Kind::Hamiltonian);
        let original = l.path.clone();
        let original_loss = l.metrics[1];
        l.edit[16] += 0.75;
        l.refresh();
        assert_eq!(l.metrics[1], original_loss);
        assert!(original
            .iter()
            .zip(&l.path)
            .all(|(a, b)| (a - b).abs() < 1e-12));
        let z0 = l.path[9];
        assert!(l.path.chunks_exact(10).all(|s| (s[9] - z0).abs() < 1e-8));
    }
}
