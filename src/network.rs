//! The two learners share a parameter layout, optimizer and train/test protocol.
pub const HIDDEN: usize = 4;
pub const MAX_PARAMS: usize = HIDDEN * 5 + 1;
pub const SCALE: f64 = 800.0;
pub type Weights = [f64; MAX_PARAMS];
#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Idle,
    Hamiltonian,
}
impl Kind {
    pub fn dim(self) -> usize {
        if self == Self::Idle {
            3
        } else {
            2
        }
    }
    pub fn count(self) -> usize {
        HIDDEN * (self.dim() + 2) + 1
    }
}
#[derive(Clone, Copy)]
pub struct Example {
    pub x: [f64; 3],
    pub y: [f64; 2],
}
struct Random(u32);
impl Random {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        self.0 as f64 / (u32::MAX as f64 + 1.0)
    }
}
pub fn idle_inputs(rpm: f64, torque: f64, ac_load: f64) -> [f64; 3] {
    [
        (rpm - 750.0) / 450.0,
        (torque - 20.0) / 20.0,
        ac_load / 10.0,
    ]
}
pub fn acceleration(rpm: f64, torque: f64, load: f64) -> f64 {
    let drag = (20.0 + 0.040 * (rpm - 750.0)).max(4.0);
    (torque - drag - load) * 60.0 / (std::f64::consts::TAU * 0.24)
}
pub fn dataset(kind: Kind, seed: u32, size: usize) -> Vec<Example> {
    let mut rng = Random(seed);
    (0..size)
        .map(|_| match kind {
            Kind::Idle => {
                let rpm = 475.0 + 900.0 * rng.next();
                let torque = 6.0 + 52.0 * rng.next();
                let load = 12.0 * rng.next();
                Example {
                    x: idle_inputs(rpm, torque, load),
                    y: [acceleration(rpm, torque, load) / SCALE, 0.0],
                }
            }
            Kind::Hamiltonian => {
                let q = 2.0 * rng.next() - 1.0;
                let p = 2.0 * rng.next() - 1.0;
                Example {
                    x: [q, p, 0.0],
                    y: [p, -q],
                }
            }
        })
        .collect()
}

pub fn evaluate(kind: Kind, w: &Weights, x: [f64; 3]) -> (f64, [f64; 2]) {
    let dim = kind.dim();
    let mut scalar = w[kind.count() - 1];
    let mut field = [0.0; 2];
    for u in w[..kind.count() - 1].chunks_exact(dim + 2) {
        let z = u[dim] + (0..dim).map(|j| u[j] * x[j]).sum::<f64>();
        let v = u[dim + 1];
        match kind {
            Kind::Idle => scalar += v * z.tanh(),
            Kind::Hamiltonian => {
                scalar += v * z * z;
                field[0] += 2.0 * v * z * u[1]; // dH/dp
                field[1] -= 2.0 * v * z * u[0]; // -dH/dq
            }
        }
    }
    if kind == Kind::Idle {
        field[0] = scalar;
    }
    (scalar, field)
}

pub fn loss(kind: Kind, w: &Weights, data: &[Example]) -> f64 {
    let components = if kind == Kind::Idle { 1 } else { 2 };
    let sum: f64 = data
        .iter()
        .map(|s| {
            let (_, pred) = evaluate(kind, w, s.x);
            (0..components)
                .map(|j| (pred[j] - s.y[j]).powi(2))
                .sum::<f64>()
        })
        .sum();
    sum / (components * data.len()) as f64
}

fn gradient(kind: Kind, w: &Weights, data: &[Example]) -> Weights {
    let dim = kind.dim();
    let count = kind.count();
    let mut g = [0.0; MAX_PARAMS];
    for s in data {
        let (_, pred) = evaluate(kind, w, s.x);
        let a = pred[0] - s.y[0];
        let b = pred[1] - s.y[1];
        for h in 0..HIDDEN {
            let start = h * (dim + 2);
            let u = &w[start..start + dim + 2];
            let z = u[dim] + (0..dim).map(|j| u[j] * s.x[j]).sum::<f64>();
            let v = u[dim + 1];
            let grad = &mut g[start..start + dim + 2];
            match kind {
                Kind::Idle => {
                    let h = z.tanh();
                    let slope = 2.0 * a * v * (1.0 - h * h);
                    for (g, x) in grad[..dim].iter_mut().zip(s.x) {
                        *g += slope * x;
                    }
                    grad[dim] += slope;
                    grad[dim + 1] += 2.0 * a * h;
                }
                Kind::Hamiltonian => {
                    let residual = a * u[1] - b * u[0];
                    grad[0] += 2.0 * v * (s.x[0] * residual - b * z);
                    grad[1] += 2.0 * v * (s.x[1] * residual + a * z);
                    grad[2] += 2.0 * v * residual;
                    grad[3] += 2.0 * z * residual;
                }
            }
        }
        if kind == Kind::Idle {
            g[count - 1] += 2.0 * a;
        }
    }
    for v in &mut g {
        *v /= data.len() as f64;
    }
    g
}
pub struct Fit {
    pub kind: Kind,
    pub base: Weights,
    pub train: Vec<Example>,
    pub test: Vec<Example>,
    pub initial_loss: f64,
}
impl Fit {
    pub fn train(kind: Kind) -> Self {
        let train = dataset(kind, 4711, 112);
        let test = dataset(kind, 3097, 192);
        let mut rng = Random(67);
        let mut w = [0.0; MAX_PARAMS];
        for p in &mut w[..kind.count()] {
            *p = 0.64 * (rng.next() - 0.5);
        }
        let initial_loss = loss(kind, &w, &train);
        let (mut m, mut v) = ([0.0; MAX_PARAMS], [0.0; MAX_PARAMS]);
        let (mut b1, mut b2) = (1.0, 1.0);
        let mut best = w;
        let mut best_loss = initial_loss;
        for epoch in 0..900 {
            let g = gradient(kind, &w, &train);
            b1 *= 0.9;
            b2 *= 0.999;
            let rate = if epoch < 550 { 0.018 } else { 0.006 };
            for j in 0..kind.count() {
                m[j] = 0.9 * m[j] + 0.1 * g[j];
                v[j] = 0.999 * v[j] + 0.001 * g[j] * g[j];
                w[j] -= rate * (m[j] / (1.0 - b1)) / ((v[j] / (1.0 - b2)).sqrt() + 1e-8);
            }
            if epoch % 10 == 9 {
                let value = loss(kind, &w, &train);
                if value < best_loss {
                    best_loss = value;
                    best = w;
                }
            }
        }
        Self {
            kind,
            base: best,
            train,
            test,
            initial_loss,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn gradients_match_finite_differences() {
        for kind in [Kind::Idle, Kind::Hamiltonian] {
            let data = dataset(kind, 92, 12);
            let mut w = std::array::from_fn(|i| 0.21 * (i as f64 + 0.3).cos());
            let g = gradient(kind, &w, &data);
            for i in 0..kind.count() {
                w[i] += 1e-5;
                let plus = loss(kind, &w, &data);
                w[i] -= 2e-5;
                let minus = loss(kind, &w, &data);
                w[i] += 1e-5;
                assert!(((plus - minus) / 2e-5 - g[i]).abs() < 1e-7);
            }
        }
    }
}
