use rusqlite::{Connection, params};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DossierDb {
    pub conn: Mutex<Connection>,
}

impl DossierDb {
    #[allow(dead_code)]
    pub fn open(path: &PathBuf) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("Failed to open DB: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("PRAGMA failed: {e}"))?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn open_or_create(path: &PathBuf) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("Failed to open DB: {e}"))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("PRAGMA failed: {e}"))?;

        // Create tables if they don't exist (compatible with Dossier's schema)
        conn.execute_batch(include_str!("schema.sql"))
            .map_err(|e| format!("Schema init failed: {e}"))?;

        Ok(Self { conn: Mutex::new(conn) })
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub repo_url: Option<String>,
    pub tech_stack: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Workflow {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub position: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct Activity {
    pub id: String,
    pub workflow_id: String,
    pub title: String,
    pub position: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct Card {
    pub id: String,
    pub workflow_activity_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: i32,
    pub position: i32,
    pub build_state: Option<String>,
    pub finalized_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MapSnapshot {
    pub project: Project,
    pub workflows: Vec<WorkflowSnapshot>,
}

#[derive(Debug, Serialize)]
pub struct WorkflowSnapshot {
    pub id: String,
    pub title: String,
    pub position: i32,
    pub activities: Vec<ActivitySnapshot>,
}

#[derive(Debug, Serialize)]
pub struct ActivitySnapshot {
    pub id: String,
    pub title: String,
    pub position: i32,
    pub cards: Vec<Card>,
}

pub fn list_projects(db: &DossierDb) -> Result<Vec<Project>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, repo_url, tech_stack, created_at FROM projects ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                repo_url: row.get(3)?,
                tech_stack: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn get_map_snapshot(db: &DossierDb, project_id: &str) -> Result<MapSnapshot, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Get project
    let project = conn
        .query_row(
            "SELECT id, name, description, repo_url, tech_stack, created_at FROM projects WHERE id = ?1",
            params![project_id],
            |row| {
                Ok(Project {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    repo_url: row.get(3)?,
                    tech_stack: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| format!("Project not found: {e}"))?;

    // Get workflows
    let mut wf_stmt = conn
        .prepare("SELECT id, title, position FROM workflows WHERE project_id = ?1 ORDER BY position")
        .map_err(|e| e.to_string())?;
    let workflows: Vec<(String, String, i32)> = wf_stmt
        .query_map(params![project_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Get activities per workflow
    let mut act_stmt = conn
        .prepare("SELECT id, title, position FROM workflow_activities WHERE workflow_id = ?1 ORDER BY position")
        .map_err(|e| e.to_string())?;

    // Get cards per activity
    let mut card_stmt = conn
        .prepare(
            "SELECT id, title, description, status, priority, position, build_state, finalized_at \
             FROM implementation_cards WHERE workflow_activity_id = ?1 ORDER BY position",
        )
        .map_err(|e| e.to_string())?;

    let mut workflow_snapshots = Vec::new();
    for (wf_id, wf_title, wf_pos) in &workflows {
        let activities: Vec<(String, String, i32)> = act_stmt
            .query_map(params![wf_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let mut activity_snapshots = Vec::new();
        for (act_id, act_title, act_pos) in &activities {
            let cards: Vec<Card> = card_stmt
                .query_map(params![act_id], |row| {
                    Ok(Card {
                        id: row.get(0)?,
                        workflow_activity_id: act_id.clone(),
                        title: row.get(1)?,
                        description: row.get(2)?,
                        status: row.get(3)?,
                        priority: row.get(4)?,
                        position: row.get(5)?,
                        build_state: row.get(6)?,
                        finalized_at: row.get(7)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            activity_snapshots.push(ActivitySnapshot {
                id: act_id.clone(),
                title: act_title.clone(),
                position: *act_pos,
                cards,
            });
        }

        workflow_snapshots.push(WorkflowSnapshot {
            id: wf_id.clone(),
            title: wf_title.clone(),
            position: *wf_pos,
            activities: activity_snapshots,
        });
    }

    Ok(MapSnapshot {
        project,
        workflows: workflow_snapshots,
    })
}

pub fn create_project(db: &DossierDb, name: &str, description: Option<&str>) -> Result<Project, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO projects (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, name, description, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(Project {
        id,
        name: name.to_string(),
        description: description.map(|s| s.to_string()),
        repo_url: None,
        tech_stack: None,
        created_at: now,
    })
}

pub fn create_workflow(db: &DossierDb, project_id: &str, title: &str, position: i32) -> Result<Workflow, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workflows (id, project_id, title, position) VALUES (?1, ?2, ?3, ?4)",
        params![id, project_id, title, position],
    )
    .map_err(|e| e.to_string())?;
    Ok(Workflow { id, project_id: project_id.to_string(), title: title.to_string(), position })
}

pub fn create_activity(db: &DossierDb, workflow_id: &str, title: &str, position: i32) -> Result<Activity, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO workflow_activities (id, workflow_id, title, position) VALUES (?1, ?2, ?3, ?4)",
        params![id, workflow_id, title, position],
    )
    .map_err(|e| e.to_string())?;
    Ok(Activity { id, workflow_id: workflow_id.to_string(), title: title.to_string(), position })
}

pub fn create_card(
    db: &DossierDb,
    activity_id: &str,
    title: &str,
    status: &str,
    priority: i32,
    position: i32,
) -> Result<Card, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO implementation_cards (id, workflow_activity_id, title, status, priority, position) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, activity_id, title, status, priority, position],
    )
    .map_err(|e| e.to_string())?;
    Ok(Card {
        id,
        workflow_activity_id: activity_id.to_string(),
        title: title.to_string(),
        description: None,
        status: status.to_string(),
        priority,
        position,
        build_state: None,
        finalized_at: None,
    })
}

pub fn update_card(db: &DossierDb, card_id: &str, title: Option<&str>, description: Option<&str>, status: Option<&str>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    if let Some(t) = title {
        conn.execute("UPDATE implementation_cards SET title = ?1 WHERE id = ?2", params![t, card_id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(d) = description {
        conn.execute("UPDATE implementation_cards SET description = ?1 WHERE id = ?2", params![d, card_id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(s) = status {
        conn.execute("UPDATE implementation_cards SET status = ?1 WHERE id = ?2", params![s, card_id])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn delete_card(db: &DossierDb, card_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM implementation_cards WHERE id = ?1", params![card_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_activity(db: &DossierDb, activity_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM implementation_cards WHERE workflow_activity_id = ?1", params![activity_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM workflow_activities WHERE id = ?1", params![activity_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_workflow(db: &DossierDb, workflow_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    // Delete cards belonging to activities of this workflow
    conn.execute(
        "DELETE FROM implementation_cards WHERE workflow_activity_id IN \
         (SELECT id FROM workflow_activities WHERE workflow_id = ?1)",
        params![workflow_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM workflow_activities WHERE workflow_id = ?1", params![workflow_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM workflows WHERE id = ?1", params![workflow_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
