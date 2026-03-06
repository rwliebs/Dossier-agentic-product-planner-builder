use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use wyr_core::question::Choice;
use wyr_core::GameEngine;

use crate::dossier_db::{self, DossierDb};
use crate::rvf_inspector;

// ── App State ────────────────────────────────────────────────────

pub struct AppState {
    pub engine: Mutex<GameEngine>,
    pub db: DossierDb,
}

// ── WYR Game Commands ────────────────────────────────────────────

#[derive(Serialize)]
pub struct QuestionPayload {
    pub id: usize,
    pub option_a: String,
    pub option_b: String,
    pub category: String,
}

#[derive(Serialize)]
pub struct StatsPayload {
    pub categories: Vec<CategoryStat>,
    pub profile_norm: f32,
    pub total_answered: usize,
}

#[derive(Serialize)]
pub struct CategoryStat {
    pub name: String,
    pub chose_a: u32,
    pub chose_b: u32,
}

#[derive(Serialize)]
pub struct ProgressPayload {
    pub answered: usize,
    pub remaining: usize,
    pub complete: bool,
}

#[tauri::command]
pub fn get_question(state: State<AppState>) -> Option<QuestionPayload> {
    let engine = state.engine.lock().unwrap();
    engine.next_question().map(|q| QuestionPayload {
        id: q.id,
        option_a: q.option_a.clone(),
        option_b: q.option_b.clone(),
        category: format!("{:?}", q.category),
    })
}

#[tauri::command]
pub fn submit_answer(state: State<AppState>, question_id: usize, choice: String) -> ProgressPayload {
    let mut engine = state.engine.lock().unwrap();
    let c = match choice.as_str() {
        "A" => Choice::A,
        _ => Choice::B,
    };
    engine.answer(question_id, c);
    ProgressPayload {
        answered: engine.total_answered(),
        remaining: engine.remaining(),
        complete: engine.is_complete(),
    }
}

#[tauri::command]
pub fn reset_game(state: State<AppState>) -> ProgressPayload {
    let mut engine = state.engine.lock().unwrap();
    *engine = GameEngine::new();
    ProgressPayload {
        answered: 0,
        remaining: engine.remaining(),
        complete: false,
    }
}

#[tauri::command]
pub fn get_stats(state: State<AppState>) -> StatsPayload {
    let engine = state.engine.lock().unwrap();
    let category_names = [
        "Lifestyle", "Career", "Social", "Adventure",
        "Ethics", "Technology", "Food", "Superpower",
    ];
    let categories = engine
        .model
        .category_stats
        .iter()
        .enumerate()
        .filter(|(_, (a, b))| *a + *b > 0)
        .map(|(i, (a, b))| CategoryStat {
            name: category_names[i].to_string(),
            chose_a: *a,
            chose_b: *b,
        })
        .collect();

    StatsPayload {
        categories,
        profile_norm: engine.model.profile.norm(),
        total_answered: engine.total_answered(),
    }
}

#[tauri::command]
pub fn get_progress(state: State<AppState>) -> ProgressPayload {
    let engine = state.engine.lock().unwrap();
    ProgressPayload {
        answered: engine.total_answered(),
        remaining: engine.remaining(),
        complete: engine.is_complete(),
    }
}

#[tauri::command]
pub fn get_hnsw_stats(state: State<AppState>) -> rvf_inspector::HnswStats {
    let engine = state.engine.lock().unwrap();
    rvf_inspector::get_hnsw_stats(&engine.model.index)
}

// ── Dossier Project Commands ─────────────────────────────────────

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> Result<Vec<dossier_db::Project>, String> {
    dossier_db::list_projects(&state.db)
}

#[tauri::command]
pub fn get_map_snapshot(state: State<AppState>, project_id: String) -> Result<dossier_db::MapSnapshot, String> {
    dossier_db::get_map_snapshot(&state.db, &project_id)
}

#[tauri::command]
pub fn create_project(state: State<AppState>, name: String, description: Option<String>) -> Result<dossier_db::Project, String> {
    dossier_db::create_project(&state.db, &name, description.as_deref())
}

#[tauri::command]
pub fn create_workflow(state: State<AppState>, project_id: String, title: String, position: i32) -> Result<dossier_db::Workflow, String> {
    dossier_db::create_workflow(&state.db, &project_id, &title, position)
}

#[tauri::command]
pub fn create_activity(state: State<AppState>, workflow_id: String, title: String, position: i32) -> Result<dossier_db::Activity, String> {
    dossier_db::create_activity(&state.db, &workflow_id, &title, position)
}

#[derive(Deserialize)]
pub struct CreateCardPayload {
    pub activity_id: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub position: Option<i32>,
}

#[tauri::command]
pub fn create_card(state: State<AppState>, payload: CreateCardPayload) -> Result<dossier_db::Card, String> {
    dossier_db::create_card(
        &state.db,
        &payload.activity_id,
        &payload.title,
        payload.status.as_deref().unwrap_or("todo"),
        payload.priority.unwrap_or(0),
        payload.position.unwrap_or(0),
    )
}

#[derive(Deserialize)]
pub struct UpdateCardPayload {
    pub card_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
pub fn update_card(state: State<AppState>, payload: UpdateCardPayload) -> Result<(), String> {
    dossier_db::update_card(
        &state.db,
        &payload.card_id,
        payload.title.as_deref(),
        payload.description.as_deref(),
        payload.status.as_deref(),
    )
}

#[tauri::command]
pub fn delete_card(state: State<AppState>, card_id: String) -> Result<(), String> {
    dossier_db::delete_card(&state.db, &card_id)
}

#[tauri::command]
pub fn delete_activity(state: State<AppState>, activity_id: String) -> Result<(), String> {
    dossier_db::delete_activity(&state.db, &activity_id)
}

#[tauri::command]
pub fn delete_workflow(state: State<AppState>, workflow_id: String) -> Result<(), String> {
    dossier_db::delete_workflow(&state.db, &workflow_id)
}

// ── RVF Inspector Commands ───────────────────────────────────────

#[tauri::command]
pub fn inspect_rvf(path: String) -> rvf_inspector::RvfFileInfo {
    rvf_inspector::inspect_rvf(&path)
}
