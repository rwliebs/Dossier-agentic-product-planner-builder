use crate::similarity::cosine_similarity;
use crate::vector::Vector;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::{BinaryHeap, HashSet};
use std::cmp::Ordering;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Node {
    id: usize,
    vector: Vector,
    neighbors: Vec<Vec<usize>>, // neighbors per layer
}

#[derive(Debug, Clone)]
struct ScoredNode {
    id: usize,
    score: f32,
}

impl PartialEq for ScoredNode {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}
impl Eq for ScoredNode {}

impl PartialOrd for ScoredNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ScoredNode {
    fn cmp(&self, other: &Self) -> Ordering {
        self.score.partial_cmp(&other.score).unwrap_or(Ordering::Equal)
    }
}

/// Hierarchical Navigable Small World graph for approximate nearest neighbor search.
#[derive(Debug, Serialize, Deserialize)]
pub struct HnswIndex {
    nodes: Vec<Node>,
    max_layer: usize,
    entry_point: Option<usize>,
    m: usize,         // max neighbors per layer
    ef_construction: usize,
    ml: f64,          // level multiplier
}

impl HnswIndex {
    pub fn new(m: usize, ef_construction: usize) -> Self {
        Self {
            nodes: Vec::new(),
            max_layer: 0,
            entry_point: None,
            m,
            ef_construction,
            ml: 1.0 / (m as f64).ln(),
        }
    }

    fn random_level(&self) -> usize {
        let mut rng = rand::thread_rng();
        let r: f64 = rng.gen();
        (-r.ln() * self.ml).floor() as usize
    }

    pub fn insert(&mut self, vector: Vector) -> usize {
        let id = self.nodes.len();
        let level = self.random_level();

        let node = Node {
            id,
            vector,
            neighbors: vec![Vec::new(); level + 1],
        };

        if self.entry_point.is_none() {
            self.entry_point = Some(id);
            self.max_layer = level;
            self.nodes.push(node);
            return id;
        }

        let mut ep = self.entry_point.unwrap();

        // Push node first so we can reference its vector
        self.nodes.push(node);

        // Traverse from top layer down to level+1
        for l in (level + 1..=self.max_layer).rev() {
            ep = self.greedy_closest(&self.nodes[id].vector, ep, l);
        }

        for l in (0..=level.min(self.max_layer)).rev() {
            let neighbors = self.search_layer(&self.nodes[id].vector, ep, self.ef_construction, l);
            let selected: Vec<usize> = neighbors.into_iter().take(self.m).collect();

            self.nodes[id].neighbors[l] = selected.clone();

            for &neighbor_id in &selected {
                if l < self.nodes[neighbor_id].neighbors.len() {
                    self.nodes[neighbor_id].neighbors[l].push(id);
                    // Prune if over capacity
                    if self.nodes[neighbor_id].neighbors[l].len() > self.m * 2 {
                        let query = self.nodes[neighbor_id].vector.clone();
                        let mut scored: Vec<(usize, f32)> = self.nodes[neighbor_id].neighbors[l]
                            .iter()
                            .map(|&n| (n, cosine_similarity(&query, &self.nodes[n].vector)))
                            .collect();
                        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
                        self.nodes[neighbor_id].neighbors[l] =
                            scored.into_iter().take(self.m).map(|(n, _)| n).collect();
                    }
                }
            }

            if !selected.is_empty() {
                ep = selected[0];
            }
        }

        if level > self.max_layer {
            self.max_layer = level;
            self.entry_point = Some(id);
        }

        id
    }

    fn greedy_closest(&self, query: &Vector, mut ep: usize, layer: usize) -> usize {
        let mut best_score = cosine_similarity(query, &self.nodes[ep].vector);

        loop {
            let mut changed = false;
            if layer < self.nodes[ep].neighbors.len() {
                for &neighbor in &self.nodes[ep].neighbors[layer] {
                    let score = cosine_similarity(query, &self.nodes[neighbor].vector);
                    if score > best_score {
                        best_score = score;
                        ep = neighbor;
                        changed = true;
                    }
                }
            }
            if !changed {
                break;
            }
        }
        ep
    }

    fn search_layer(&self, query: &Vector, ep: usize, ef: usize, layer: usize) -> Vec<usize> {
        let mut visited = HashSet::new();
        visited.insert(ep);

        let initial_score = cosine_similarity(query, &self.nodes[ep].vector);
        let mut candidates = BinaryHeap::new();
        candidates.push(ScoredNode { id: ep, score: initial_score });

        let mut results: Vec<ScoredNode> = vec![ScoredNode { id: ep, score: initial_score }];

        while let Some(current) = candidates.pop() {
            let worst_result = results.iter().map(|r| r.score).fold(f32::INFINITY, f32::min);
            if current.score < worst_result && results.len() >= ef {
                break;
            }

            if layer < self.nodes[current.id].neighbors.len() {
                for &neighbor in &self.nodes[current.id].neighbors[layer] {
                    if visited.insert(neighbor) {
                        let score = cosine_similarity(query, &self.nodes[neighbor].vector);
                        candidates.push(ScoredNode { id: neighbor, score });
                        results.push(ScoredNode { id: neighbor, score });
                    }
                }
            }
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal));
        results.into_iter().take(ef).map(|n| n.id).collect()
    }

    /// Search for the k nearest neighbors to the query vector.
    pub fn search(&self, query: &Vector, k: usize) -> Vec<(usize, f32)> {
        let Some(ep) = self.entry_point else {
            return Vec::new();
        };

        let mut current_ep = ep;

        // Traverse from top layer to layer 1
        for l in (1..=self.max_layer).rev() {
            current_ep = self.greedy_closest(query, current_ep, l);
        }

        // Search at layer 0 with ef = max(k, ef_construction)
        let ef = k.max(self.ef_construction);
        let results = self.search_layer(query, current_ep, ef, 0);

        results
            .into_iter()
            .take(k)
            .map(|id| (id, cosine_similarity(query, &self.nodes[id].vector)))
            .collect()
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    pub fn get_vector(&self, id: usize) -> Option<&Vector> {
        self.nodes.get(id).map(|n| &n.vector)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insert_and_search() {
        let mut index = HnswIndex::new(16, 200);

        // Insert some vectors
        let v0 = Vector::new(vec![1.0, 0.0, 0.0]);
        let v1 = Vector::new(vec![0.0, 1.0, 0.0]);
        let v2 = Vector::new(vec![0.9, 0.1, 0.0]);

        index.insert(v0);
        index.insert(v1);
        index.insert(v2);

        assert_eq!(index.len(), 3);

        // Query close to v0
        let query = Vector::new(vec![0.95, 0.05, 0.0]);
        let results = index.search(&query, 2);
        assert!(!results.is_empty());
        // First result should be id 2 (v2) or id 0 (v0) — both are close
        let top_ids: Vec<usize> = results.iter().map(|r| r.0).collect();
        assert!(top_ids.contains(&0) || top_ids.contains(&2));
    }

    #[test]
    fn test_empty_index() {
        let index = HnswIndex::new(16, 200);
        assert!(index.is_empty());
        let results = index.search(&Vector::new(vec![1.0, 0.0]), 5);
        assert!(results.is_empty());
    }

    #[test]
    fn test_single_element() {
        let mut index = HnswIndex::new(16, 200);
        index.insert(Vector::new(vec![1.0, 0.0, 0.0]));
        let results = index.search(&Vector::new(vec![1.0, 0.0, 0.0]), 1);
        assert_eq!(results.len(), 1);
        assert!((results[0].1 - 1.0).abs() < 1e-6);
    }
}
