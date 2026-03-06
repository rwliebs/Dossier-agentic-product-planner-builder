use crate::preference::PreferenceModel;
use crate::question::{seed_questions, Choice, Question};

/// Main game engine that drives the WYR experience.
pub struct GameEngine {
    pub questions: Vec<Question>,
    pub model: PreferenceModel,
    asked: Vec<bool>,
}

impl GameEngine {
    pub fn new() -> Self {
        let questions = seed_questions();
        let dim = questions[0].embedding.dim();
        let asked = vec![false; questions.len()];
        Self {
            questions,
            model: PreferenceModel::new(dim),
            asked,
        }
    }

    /// Pick the next best question based on preference model scoring.
    pub fn next_question(&self) -> Option<&Question> {
        let mut best: Option<(usize, f32)> = None;

        for (i, q) in self.questions.iter().enumerate() {
            if self.asked[i] {
                continue;
            }
            let score = self.model.score_question(q);
            if best.is_none() || score > best.unwrap().1 {
                best = Some((i, score));
            }
        }

        best.map(|(i, _)| &self.questions[i])
    }

    /// Submit an answer and update the preference model.
    pub fn answer(&mut self, question_id: usize, choice: Choice) {
        if let Some(q) = self.questions.iter().find(|q| q.id == question_id) {
            let q = q.clone();
            self.asked[question_id] = true;
            self.model.record(&q, choice);
        }
    }

    pub fn remaining(&self) -> usize {
        self.asked.iter().filter(|&&a| !a).count()
    }

    pub fn total_answered(&self) -> usize {
        self.model.total_answers()
    }

    pub fn is_complete(&self) -> bool {
        self.remaining() == 0
    }
}

impl Default for GameEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_game_flow() {
        let mut engine = GameEngine::new();
        assert_eq!(engine.remaining(), 16);

        let q = engine.next_question().unwrap();
        let qid = q.id;
        engine.answer(qid, Choice::A);

        assert_eq!(engine.remaining(), 15);
        assert_eq!(engine.total_answered(), 1);
    }

    #[test]
    fn test_complete() {
        let mut engine = GameEngine::new();
        while let Some(q) = engine.next_question() {
            let qid = q.id;
            engine.answer(qid, Choice::A);
        }
        assert!(engine.is_complete());
    }
}
