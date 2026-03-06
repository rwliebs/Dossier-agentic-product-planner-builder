-- Dossier schema (compatible with the Node.js app's SQLite database)
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    customer_personas TEXT,
    tech_stack TEXT,
    deployment TEXT,
    design_inspiration TEXT,
    repo_url TEXT,
    default_branch TEXT DEFAULT 'main',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workflow_activities (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS implementation_cards (
    id TEXT PRIMARY KEY,
    workflow_activity_id TEXT NOT NULL REFERENCES workflow_activities(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    priority INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    quick_answer TEXT,
    build_state TEXT,
    last_built_at TEXT,
    finalized_at TEXT
);

CREATE TABLE IF NOT EXISTS context_artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS card_requirements (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES implementation_cards(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    source TEXT DEFAULT 'system',
    position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_planned_files (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES implementation_cards(id) ON DELETE CASCADE,
    logical_file_name TEXT NOT NULL,
    artifact_kind TEXT DEFAULT 'util',
    action TEXT DEFAULT 'create',
    intent_summary TEXT
);
