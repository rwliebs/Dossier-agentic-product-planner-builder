use wyr_ruvector::{cosine_similarity, HnswIndex, Vector};
use crate::question::{Category, Choice, Question};
use serde::{Deserialize, Serialize};

/// Tracks user preferences as a vector that evolves with each choice.
#[derive(Debug, Serialize, Deserialize)]
pub struct PreferenceModel {
    /// Running preference vector (same dim as question embeddings).
    pub profile: Vector,
    /// HNSW index of all answered question embeddings for fast lookup.
    pub index: HnswIndex,
    /// History of (question_id, choice).
    pub history: Vec<(usize, Choice)>,
    /// Per-category choice counts: (times_chosen_A, times_chosen_B).
    pub category_stats: Vec<(u32, u32)>,
    total_answers: usize,
}

impl PreferenceModel {
    pub fn new(dim: usize) -> Self {
        Self {
            profile: Vector::zeros(dim),
            index: HnswIndex::new(16, 64),
            history: Vec::new(),
            category_stats: vec![(0, 0); Category::all().len()],
            total_answers: 0,
        }
    }

    /// Record a user's choice and update the preference profile.
    pub fn record(&mut self, question: &Question, choice: Choice) {
        self.history.push((question.id, choice));
        self.index.insert(question.embedding.clone());

        // Update category stats
        let cat_idx = question.category as usize;
        match choice {
            Choice::A => self.category_stats[cat_idx].0 += 1,
            Choice::B => self.category_stats[cat_idx].1 += 1,
        }

        // Update profile: exponential moving average toward chosen direction.
        // Choice A reinforces the question embedding; Choice B dampens it.
        let direction = match choice {
            Choice::A => question.embedding.scale(1.0),
            Choice::B => question.embedding.scale(-0.5),
        };

        self.total_answers += 1;
        let alpha = 1.0 / self.total_answers as f32;
        self.profile = self.profile.scale(1.0 - alpha).add(&direction.scale(alpha));
    }

    /// Score a candidate question by how well it explores the preference frontier.
    /// Higher score = more informative (balances novelty + relevance).
    pub fn score_question(&self, question: &Question) -> f32 {
        if self.total_answers == 0 {
            return 1.0; // All questions equally good when no data
        }

        let relevance = cosine_similarity(&self.profile, &question.embedding).abs();

        // Novelty: how far from already-answered questions
        let nearest = self.index.search(&question.embedding, 1);
        let novelty = if let Some((_, sim)) = nearest.first() {
            1.0 - sim
        } else {
            1.0
        };

        // Balance: prefer categories where we have fewer answers
        let cat_idx = question.category as usize;
        let (a, b) = self.category_stats[cat_idx];
        let cat_total = a + b;
        let balance = 1.0 / (1.0 + cat_total as f32);

        // Weighted combination
        0.4 * relevance + 0.35 * novelty + 0.25 * balance
    }

    pub fn total_answers(&self) -> usize {
        self.total_answers
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::question::seed_questions;

    #[test]
    fn test_record_updates_profile() {
        let mut model = PreferenceModel::new(8);
        let questions = seed_questions();
        model.record(&questions[0], Choice::A);
        assert_eq!(model.total_answers(), 1);
        assert!(model.profile.norm() > 0.0);
    }

    #[test]
    fn test_scoring_with_history() {
        let mut model = PreferenceModel::new(8);
        let questions = seed_questions();
        model.record(&questions[0], Choice::A);
        model.record(&questions[1], Choice::B);

        let score = model.score_question(&questions[2]);
        assert!(score > 0.0);
    }

    #[test]
    fn test_empty_model_scores_equally() {
        let model = PreferenceModel::new(8);
        let questions = seed_questions();
        let s0 = model.score_question(&questions[0]);
        let s1 = model.score_question(&questions[5]);
        assert!((s0 - s1).abs() < 1e-6);
    }
}
