-- Slice C: Orchestration, Quality Gates, and Approval
-- Requires: projects, workflows, workflow_activities, steps, cards tables (from slice-a/b migrations)
-- Run earlier migrations first if those tables do not exist.

-- ============================================================================
-- Enum types (run_status from slice-a base migration)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE build_scope AS ENUM ('workflow', 'card');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trigger_type AS ENUM ('card', 'workflow', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_role AS ENUM (
    'planner', 'coder', 'reviewer', 'integrator', 'tester'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE pr_status AS ENUM (
    'not_created', 'draft_open', 'open', 'merged', 'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE run_check_type AS ENUM (
    'dependency', 'security', 'policy', 'lint', 'unit', 'integration', 'e2e'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE check_status AS ENUM ('passed', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE approval_type AS ENUM ('create_pr', 'merge_pr');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- SystemPolicyProfile: Project-level always-on execution constraints
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_policy_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  required_checks run_check_type[] NOT NULL,
  protected_paths TEXT[],
  forbidden_paths TEXT[],
  dependency_policy JSONB NOT NULL DEFAULT '{}',
  security_policy JSONB NOT NULL DEFAULT '{}',
  architecture_policy JSONB NOT NULL DEFAULT '{}',
  approval_policy JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_system_policy_profiles_project_id
  ON system_policy_profiles(project_id);

-- ============================================================================
-- OrchestrationRun: Build execution lifecycle
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope build_scope NOT NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
  trigger_type trigger_type NOT NULL,
  status run_status NOT NULL DEFAULT 'queued',
  initiated_by TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  system_policy_profile_id UUID NOT NULL REFERENCES system_policy_profiles(id) ON DELETE RESTRICT,
  system_policy_snapshot JSONB NOT NULL,
  run_input_snapshot JSONB NOT NULL,
  worktree_root TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scope constraints: workflow requires workflow_id and null card_id; card requires card_id
ALTER TABLE orchestration_runs
  ADD CONSTRAINT chk_orchestration_run_scope_workflow
  CHECK (
    (scope != 'workflow') OR (workflow_id IS NOT NULL AND card_id IS NULL)
  );

ALTER TABLE orchestration_runs
  ADD CONSTRAINT chk_orchestration_run_scope_card
  CHECK (
    (scope != 'card') OR (card_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_orchestration_runs_project_scope_status
  ON orchestration_runs(project_id, scope, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_workflow_id
  ON orchestration_runs(workflow_id, status, created_at DESC) WHERE workflow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orchestration_runs_card_id
  ON orchestration_runs(card_id, status, created_at DESC) WHERE card_id IS NOT NULL;

-- ============================================================================
-- CardAssignment: Per-card execution assignment
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_runs(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  agent_role agent_role NOT NULL,
  agent_profile TEXT NOT NULL,
  feature_branch TEXT NOT NULL,
  worktree_path TEXT,
  allowed_paths TEXT[] NOT NULL,
  forbidden_paths TEXT[],
  assignment_input_snapshot JSONB NOT NULL,
  status run_status NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id, card_id, agent_profile)
);

CREATE INDEX IF NOT EXISTS idx_card_assignments_run_status
  ON card_assignments(run_id, status);

-- allowed_paths must be non-empty
ALTER TABLE card_assignments
  ADD CONSTRAINT chk_card_assignment_allowed_paths
  CHECK (array_length(allowed_paths, 1) > 0);

-- ============================================================================
-- AgentExecution: Per-assignment execution record
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES card_assignments(id) ON DELETE CASCADE,
  status run_status NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  summary TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_executions_assignment_id
  ON agent_executions(assignment_id);

-- ============================================================================
-- AgentCommit: Commit record from agent execution
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES card_assignments(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  message TEXT NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_commits_assignment_id
  ON agent_commits(assignment_id);

-- ============================================================================
-- RunCheck: Quality gate execution
-- ============================================================================

CREATE TABLE IF NOT EXISTS run_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_runs(id) ON DELETE CASCADE,
  check_type run_check_type NOT NULL,
  status check_status NOT NULL,
  output TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_checks_run_id
  ON run_checks(run_id);

-- ============================================================================
-- PullRequestCandidate: Draft PR tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS pull_request_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_runs(id) ON DELETE CASCADE,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status pr_status NOT NULL DEFAULT 'not_created',
  pr_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(run_id)
);

CREATE INDEX IF NOT EXISTS idx_pull_request_candidates_run_id
  ON pull_request_candidates(run_id);

-- ============================================================================
-- ApprovalRequest: PR approval lifecycle
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_runs(id) ON DELETE CASCADE,
  approval_type approval_type NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_run_id
  ON approval_requests(run_id);

-- ============================================================================
-- EventLog: Audit and observability
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES orchestration_runs(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_logs_project_run_created
  ON event_logs(project_id, run_id, created_at DESC);
