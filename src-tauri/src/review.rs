use chrono::{DateTime, Duration, Utc};
use fsrs::{DEFAULT_PARAMETERS, FSRS, MemoryState, NextStates};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const DESIRED_RETENTION: f32 = 0.9;

#[derive(Debug, Error)]
pub enum ReviewError {
    #[error("invalid timestamp: {0}")]
    InvalidTimestamp(String),
    #[error("fsrs scheduling failed: {0}")]
    Fsrs(String),
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SchedulerCard {
    pub due: String,
    pub last_review: Option<String>,
    pub state: u8,
    pub stability: f64,
    pub difficulty: f64,
    pub elapsed_days: u32,
    pub scheduled_days: u32,
    pub reps: u32,
    pub lapses: u32,
}

#[derive(Debug, Copy, Clone, Deserialize, Serialize)]
pub enum Rating {
    Again,
    Hard,
    Good,
    Easy,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ReviewGradeRequest {
    pub card: SchedulerCard,
    pub rating: Rating,
    pub now: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ReviewGradeResponse {
    pub card: SchedulerCard,
    pub reviewed_at: String,
}

pub fn review_grade(request: ReviewGradeRequest) -> Result<ReviewGradeResponse, ReviewError> {
    let now = parse_utc(&request.now)?;
    let elapsed_days = calc_elapsed_days(request.card.last_review.as_deref(), now)?;
    let previous_memory = to_memory_state(&request.card);
    let next_states = calc_next_states(previous_memory, elapsed_days)?;
    let selected = pick_state(next_states, request.rating);
    let interval_days = selected.scheduled_days;
    let due = (now + Duration::days(i64::from(interval_days))).to_rfc3339();

    let mut card = request.card;
    card.due = due;
    card.last_review = Some(request.now.clone());
    card.state = match request.rating {
        Rating::Again => 1,
        Rating::Hard | Rating::Good | Rating::Easy => 2,
    };
    card.stability = selected.stability;
    card.difficulty = selected.difficulty;
    card.elapsed_days = elapsed_days;
    card.scheduled_days = interval_days;
    card.reps = card.reps.saturating_add(1);
    if matches!(request.rating, Rating::Again) {
        card.lapses = card.lapses.saturating_add(1);
    }

    Ok(ReviewGradeResponse {
        card,
        reviewed_at: request.now,
    })
}

fn parse_utc(value: &str) -> Result<DateTime<Utc>, ReviewError> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| ReviewError::InvalidTimestamp(value.to_string()))
}

fn calc_elapsed_days(last_review: Option<&str>, now: DateTime<Utc>) -> Result<u32, ReviewError> {
    match last_review {
        Some(value) => {
            let last = parse_utc(value)?;
            let days = (now - last).num_days();
            Ok(days.max(0) as u32)
        }
        None => Ok(0),
    }
}

fn to_memory_state(card: &SchedulerCard) -> Option<MemoryState> {
    if card.stability <= 0.0 || card.difficulty <= 0.0 {
        return None;
    }
    Some(MemoryState {
        stability: card.stability as f32,
        difficulty: card.difficulty as f32,
    })
}

fn calc_next_states(memory: Option<MemoryState>, elapsed_days: u32) -> Result<NextStates, ReviewError> {
    let fsrs = FSRS::new(Some(&DEFAULT_PARAMETERS)).map_err(|err| ReviewError::Fsrs(err.to_string()))?;
    fsrs.next_states(memory, DESIRED_RETENTION, elapsed_days)
        .map_err(|err| ReviewError::Fsrs(err.to_string()))
}

struct SelectedState {
    scheduled_days: u32,
    stability: f64,
    difficulty: f64,
}

fn pick_state(states: NextStates, rating: Rating) -> SelectedState {
    let state = match rating {
        Rating::Again => states.again,
        Rating::Hard => states.hard,
        Rating::Good => states.good,
        Rating::Easy => states.easy,
    };
    SelectedState {
        scheduled_days: state.interval.round().max(0.0) as u32,
        stability: f64::from(state.memory.stability),
        difficulty: f64::from(state.memory.difficulty),
    }
}

#[cfg(test)]
mod tests {
    use super::{review_grade, Rating, ReviewGradeRequest, SchedulerCard};

    fn base_card() -> SchedulerCard {
        SchedulerCard {
            due: "2026-02-26T00:00:00Z".to_string(),
            last_review: Some("2026-02-24T00:00:00Z".to_string()),
            state: 2,
            stability: 2.0,
            difficulty: 5.0,
            elapsed_days: 2,
            scheduled_days: 3,
            reps: 5,
            lapses: 1,
        }
    }

    #[test]
    fn grade_good_updates_review_card() {
        let request = ReviewGradeRequest {
            card: base_card(),
            rating: Rating::Good,
            now: "2026-02-26T12:00:00Z".to_string(),
        };
        let result = review_grade(request).expect("review grade should succeed");

        assert_eq!(result.reviewed_at, "2026-02-26T12:00:00Z");
        assert_eq!(result.card.last_review.as_deref(), Some("2026-02-26T12:00:00Z"));
        assert_eq!(result.card.reps, 6);
        assert!(result.card.scheduled_days > 0);
        assert!(result.card.stability > 0.0);
    }

    #[test]
    fn grade_again_increments_lapses() {
        let request = ReviewGradeRequest {
            card: base_card(),
            rating: Rating::Again,
            now: "2026-02-26T12:00:00Z".to_string(),
        };
        let result = review_grade(request).expect("review grade should succeed");

        assert_eq!(result.card.lapses, 2);
        assert_eq!(result.card.reps, 6);
    }
}
