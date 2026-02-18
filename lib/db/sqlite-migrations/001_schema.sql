-- SQLite schema for Dossier (self-deploy mode)
-- Ported from Postgres migrations. Enums -> TEXT+CHECK, timestamptz -> TEXT, UUIDs from app.

-- Projects
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  action_sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_updated_at ON project(updated_at DESC);

-- Workflows
CREATE TABLE IF NOT EXISTS workflow (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  build_state TEXT CHECK (build_state IN ('queued','running','blocked','failed','completed','cancelled')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_project_id ON workflow(project_id);

-- Workflow activities
CREATE TABLE IF NOT EXISTS workflow_activity (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT CHECK (color IN ('yellow','blue','purple','green','orange','pink')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_activity_workflow_id ON workflow_activity(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_activity_position ON workflow_activity(workflow_id, position);

-- Steps
CREATE TABLE IF NOT EXISTS step (
  id TEXT PRIMARY KEY,
  workflow_activity_id TEXT NOT NULL REFERENCES workflow_activity(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_step_workflow_activity_id ON step(workflow_activity_id);
CREATE INDEX IF NOT EXISTS idx_step_position ON step(workflow_activity_id, position);

-- Cards
CREATE TABLE IF NOT EXISTS card (
  id TEXT PRIMARY KEY,
  workflow_activity_id TEXT NOT NULL REFERENCES workflow_activity(id) ON DELETE CASCADE,
  step_id TEXT REFERENCES step(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','active','questions','review','production')),
  priority INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  quick_answer TEXT,
  build_state TEXT CHECK (build_state IN ('queued','running','blocked','failed','completed','cancelled')),
  last_built_at TEXT,
  last_build_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_card_workflow_activity_id ON card(workflow_activity_id);
CREATE INDEX IF NOT EXISTS idx_card_step_id ON card(step_id);
CREATE INDEX IF NOT EXISTS idx_card_step_priority ON card(step_id, priority) WHERE step_id IS NOT NULL;

-- Planning actions
CREATE TABLE IF NOT EXISTS planning_action (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  target_ref TEXT NOT NULL DEFAULT '{}',
  payload TEXT NOT NULL DEFAULT '{}',
  validation_status TEXT NOT NULL CHECK (validation_status IN ('accepted','rejected')),
  rejection_reason TEXT,
  applied_at TEXT,
  idempotency_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_action_idempotency
  ON planning_action(project_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planning_action_project_id ON planning_action(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_action_created_at ON planning_action(project_id, created_at DESC);

-- Context artifacts
CREATE TABLE IF NOT EXISTS context_artifact (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('doc','design','code','research','link','image','skill','mcp','cli','api','prompt','spec','runbook')),
  title TEXT,
  content TEXT,
  uri TEXT,
  locator TEXT,
  mime_type TEXT,
  integration_ref TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (content IS NOT NULL OR uri IS NOT NULL OR integration_ref IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_context_artifact_project_id ON context_artifact(project_id);

-- Card context artifact (many-to-many)
CREATE TABLE IF NOT EXISTS card_context_artifact (
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  context_artifact_id TEXT NOT NULL REFERENCES context_artifact(id) ON DELETE CASCADE,
  linked_by TEXT,
  usage_hint TEXT,
  PRIMARY KEY (card_id, context_artifact_id)
);

CREATE INDEX IF NOT EXISTS idx_card_context_artifact_card ON card_context_artifact(card_id);
CREATE INDEX IF NOT EXISTS idx_card_context_artifact_artifact ON card_context_artifact(context_artifact_id);

-- Card requirement
CREATE TABLE IF NOT EXISTS card_requirement (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_card_requirement_card_id ON card_requirement(card_id);

-- Card known fact
CREATE TABLE IF NOT EXISTS card_known_fact (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  evidence_source TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_card_known_fact_card_id ON card_known_fact(card_id);

-- Card assumption
CREATE TABLE IF NOT EXISTS card_assumption (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_card_assumption_card_id ON card_assumption(card_id);

-- Card question
CREATE TABLE IF NOT EXISTS card_question (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  source TEXT NOT NULL CHECK (source IN ('agent','user','imported')),
  confidence REAL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_card_question_card_id ON card_question(card_id);

-- Card planned file
CREATE TABLE IF NOT EXISTS card_planned_file (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  logical_file_name TEXT NOT NULL,
  module_hint TEXT,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('component','endpoint','service','schema','hook','util','middleware','job','config')),
  action TEXT NOT NULL CHECK (action IN ('create','edit')),
  intent_summary TEXT NOT NULL,
  contract_notes TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','user_edited','approved')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_card_planned_file_card_id ON card_planned_file(card_id);
CREATE INDEX IF NOT EXISTS idx_card_planned_file_card_status ON card_planned_file(card_id, status);
