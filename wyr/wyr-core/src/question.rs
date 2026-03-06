use serde::{Deserialize, Serialize};
use wyr_ruvector::Vector;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Category {
    Lifestyle,
    Career,
    Social,
    Adventure,
    Ethics,
    Technology,
    Food,
    Superpower,
}

impl Category {
    pub fn all() -> &'static [Category] {
        &[
            Category::Lifestyle,
            Category::Career,
            Category::Social,
            Category::Adventure,
            Category::Ethics,
            Category::Technology,
            Category::Food,
            Category::Superpower,
        ]
    }

    fn index(&self) -> usize {
        match self {
            Category::Lifestyle => 0,
            Category::Career => 1,
            Category::Social => 2,
            Category::Adventure => 3,
            Category::Ethics => 4,
            Category::Technology => 5,
            Category::Food => 6,
            Category::Superpower => 7,
        }
    }

    /// Encode as an 8-dimensional one-hot vector.
    pub fn to_vector(&self) -> Vector {
        let mut data = vec![0.0f32; 8];
        data[self.index()] = 1.0;
        Vector::new(data)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: usize,
    pub option_a: String,
    pub option_b: String,
    pub category: Category,
    /// Semantic embedding combining category + trait dimensions.
    pub embedding: Vector,
}

impl Question {
    pub fn new(id: usize, option_a: &str, option_b: &str, category: Category) -> Self {
        let embedding = category.to_vector();
        Self {
            id,
            option_a: option_a.to_string(),
            option_b: option_b.to_string(),
            category,
            embedding,
        }
    }
}

/// Choice made by the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Choice {
    A,
    B,
}

pub fn seed_questions() -> Vec<Question> {
    vec![
        Question::new(0, "Have unlimited money", "Have unlimited time", Category::Lifestyle),
        Question::new(1, "Work from anywhere", "Work your dream job in one city", Category::Career),
        Question::new(2, "Read everyone's mind", "Be invisible at will", Category::Superpower),
        Question::new(3, "Only eat pizza forever", "Never eat pizza again", Category::Food),
        Question::new(4, "Travel to the past", "Travel to the future", Category::Adventure),
        Question::new(5, "Always tell the truth", "Always get away with lies", Category::Ethics),
        Question::new(6, "Have 1000 acquaintances", "Have 3 close friends", Category::Social),
        Question::new(7, "Know every programming language", "Know every spoken language", Category::Technology),
        Question::new(8, "Live in a treehouse", "Live in a submarine", Category::Lifestyle),
        Question::new(9, "Debug code forever", "Write docs forever", Category::Technology),
        Question::new(10, "Give up coffee", "Give up Wi-Fi for a week each month", Category::Lifestyle),
        Question::new(11, "Have a personal AI assistant", "Have a personal chef", Category::Technology),
        Question::new(12, "Always be 10 min early", "Always arrive exactly on time", Category::Social),
        Question::new(13, "Speak all animal languages", "Speak all human languages", Category::Superpower),
        Question::new(14, "Explore deep ocean", "Explore outer space", Category::Adventure),
        Question::new(15, "Found a startup", "Lead a large open-source project", Category::Career),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seed_questions() {
        let qs = seed_questions();
        assert_eq!(qs.len(), 16);
        assert_eq!(qs[0].option_a, "Have unlimited money");
    }

    #[test]
    fn test_category_vector() {
        let v = Category::Technology.to_vector();
        assert_eq!(v.dim(), 8);
        assert_eq!(v.data[5], 1.0);
        assert_eq!(v.data.iter().sum::<f32>(), 1.0);
    }
}
