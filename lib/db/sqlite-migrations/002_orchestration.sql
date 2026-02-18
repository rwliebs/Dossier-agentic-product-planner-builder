-- Orchestration tables (slice C)

-- System policy profile
CREATE TABLE IF NOT EXISTS system_policy_profile (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES project(id) ON DELETE CASCADE,
  required_checks TEXT NOT NULL DEFAULT '[]',
  protected_paths TEXT,
  forbidden_paths TEXT,
  dependency_policy TEXT NOT NULL DEFAULT '{}',
  security_policy TEXT NOT NULL DEFAULT '{}',
  architecture_policy TEXT NOT NULL DEFAULT '{}',
  approval_policy TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_system_policy_profile_project_id ON system_policy_profile(project_id);

-- Orchestration run
CREATE TABLE IF NOT EXISTS orchestration_run (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('workflow','card')),
  workflow_id TEXT REFERENCES workflow(id) ON DELETE SET NULL,
  card_id TEXT REFERENCES card(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('card','workflow','manual')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','blocked','failed','completed','cancelled')),
  initiated_by TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  system_policy_profile_id TEXT NOT NULL REFERENCES system_policy_profile(id) ON DELETE RESTRICT,
  system_policy_snapshot TEXT NOT NULL,
  run_input_snapshot TEXT NOT NULL,
  worktree_root TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((scope != 'workflow') OR (workflow_id IS NOT NULL AND card_id IS NULL)),
  CHECK ((scope != 'card') OR (card_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_orchestration_run_project_scope_status
  ON orchestration_run(project_id, scope, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_run_workflow_id
  ON orchestration_run(workflow_id, status, created_at DESC) WHERE workflow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orchestration_run_card_id
  ON orchestration_run(card_id, status, created_at DESC) WHERE card_id IS NOT NULL;

-- Card assignment
CREATE TABLE IF NOT EXISTS card_assignment (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  agent_role TEXT NOT NULL CHECK (agent_role IN ('planner','coder','reviewer','integrator','tester')),
  agent_profile TEXT NOT NULL,
  feature_branch TEXT NOT NULL,
  worktree_path TEXT,
  allowed_paths TEXT NOT NULL,
  forbidden_paths TEXT,
  assignment_input_snapshot TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','blocked','failed','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, card_id, agent_profile)
);

CREATE INDEX IF NOT EXISTS idx_card_assignment_run_status ON card_assignment(run_id, status);

-- Agent execution
CREATE TABLE IF NOT EXISTS agent_execution (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES card_assignment(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued','running','blocked','failed','completed','cancelled')),
  started_at TEXT,
  ended_at TEXT,
  summary TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_execution_assignment_id ON agent_execution(assignment_id);

-- Agent commit
CREATE TABLE IF NOT EXISTS agent_commit (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES card_assignment(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  message TEXT NOT NULL,
  committed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_commit_assignment_id ON agent_commit(assignment_id);

-- Run check
CREATE TABLE IF NOT EXISTS run_check (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (check_type IN ('dependency','security','policy','lint','unit','integration','e2e')),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped')),
  output TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_run_check_run_id ON run_check(run_id);

-- Pull request candidate
CREATE TABLE IF NOT EXISTS pull_request_candidate (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES orchestration_run(id) ON DELETE CASCADE,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_created' CHECK (status IN ('not_created','draft_open','open','merged','closed')),
  pr_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pull_request_candidate_run_id ON pull_request_candidate(run_id);

-- Approval request
CREATE TABLE IF NOT EXISTS approval_request (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE,
  approval_type TEXT NOT NULL CHECK (approval_type IN ('create_pr','merge_pr')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_approval_request_run_id ON approval_request(run_id);

-- Event log
CREATE TABLE IF NOT EXISTS event_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES orchestration_run(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_event_log_project_run_created ON event_log(project_id, run_id, created_at DESC);
