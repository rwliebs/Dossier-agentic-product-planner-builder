use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vector {
    pub data: Vec<f32>,
}

impl Vector {
    pub fn new(data: Vec<f32>) -> Self {
        Self { data }
    }

    pub fn zeros(dim: usize) -> Self {
        Self { data: vec![0.0; dim] }
    }

    pub fn dim(&self) -> usize {
        self.data.len()
    }

    pub fn norm(&self) -> f32 {
        self.data.iter().map(|x| x * x).sum::<f32>().sqrt()
    }

    pub fn normalize(&mut self) {
        let n = self.norm();
        if n > f32::EPSILON {
            for x in &mut self.data {
                *x /= n;
            }
        }
    }

    pub fn normalized(&self) -> Self {
        let mut v = self.clone();
        v.normalize();
        v
    }

    pub fn add(&self, other: &Vector) -> Vector {
        assert_eq!(self.dim(), other.dim(), "dimension mismatch");
        Vector::new(
            self.data.iter().zip(&other.data).map(|(a, b)| a + b).collect(),
        )
    }

    pub fn scale(&self, s: f32) -> Vector {
        Vector::new(self.data.iter().map(|x| x * s).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize() {
        let v = Vector::new(vec![3.0, 4.0]);
        let n = v.normalized();
        assert!((n.norm() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_zeros() {
        let v = Vector::zeros(5);
        assert_eq!(v.dim(), 5);
        assert!(v.data.iter().all(|&x| x == 0.0));
    }

    #[test]
    fn test_add_and_scale() {
        let a = Vector::new(vec![1.0, 2.0]);
        let b = Vector::new(vec![3.0, 4.0]);
        let c = a.add(&b);
        assert_eq!(c.data, vec![4.0, 6.0]);
        let d = a.scale(2.0);
        assert_eq!(d.data, vec![2.0, 4.0]);
    }
}
