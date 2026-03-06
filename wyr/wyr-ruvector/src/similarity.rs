use crate::vector::Vector;

pub fn cosine_similarity(a: &Vector, b: &Vector) -> f32 {
    assert_eq!(a.dim(), b.dim(), "dimension mismatch");
    let dot: f32 = a.data.iter().zip(&b.data).map(|(x, y)| x * y).sum();
    let na = a.norm();
    let nb = b.norm();
    if na < f32::EPSILON || nb < f32::EPSILON {
        return 0.0;
    }
    dot / (na * nb)
}

pub fn euclidean_distance(a: &Vector, b: &Vector) -> f32 {
    assert_eq!(a.dim(), b.dim(), "dimension mismatch");
    a.data
        .iter()
        .zip(&b.data)
        .map(|(x, y)| (x - y).powi(2))
        .sum::<f32>()
        .sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_identical() {
        let v = Vector::new(vec![1.0, 0.0, 0.0]);
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_orthogonal() {
        let a = Vector::new(vec![1.0, 0.0]);
        let b = Vector::new(vec![0.0, 1.0]);
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_opposite() {
        let a = Vector::new(vec![1.0, 0.0]);
        let b = Vector::new(vec![-1.0, 0.0]);
        assert!((cosine_similarity(&a, &b) + 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_euclidean() {
        let a = Vector::new(vec![0.0, 0.0]);
        let b = Vector::new(vec![3.0, 4.0]);
        assert!((euclidean_distance(&a, &b) - 5.0).abs() < 1e-6);
    }
}
