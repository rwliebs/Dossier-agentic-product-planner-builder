-- Slice C (singular schema): Orchestration, quality gates, approval, audit
-- Depends on: 20240213000001–004 (project, workflow, card, context_artifact, etc.)
-- Aligns with DUAL_LLM_INTEGRATION_STRATEGY Phase 0; table names match strategy entity names (singular)
-- build_scope enum already exists in 20240213000001

-- ============================================================================
-- Enums (Slice C only; run_status, build_scope from slice A)
-- ============================================================================

CREATE TYPE trigger_type AS ENUM ('card', 'workflow', 'manual');

CREATE TYPE agent_role AS ENUM (
  'planner', 'coder', 'reviewer', 'integrator', 'tester'
);

CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE pr_status AS ENUM (
  'not_created', 'draft_open', 'open', 'merged', 'closed'
);

CREATE TYPE run_check_type AS ENUM (
  'dependency', 'security', 'policy', 'lint', 'unit', 'integration', 'e2e'
);

CREATE TYPE check_status AS ENUM ('passed', 'failed', 'skipped');

CREATE TYPE approval_type AS ENUM ('create_pr', 'merge_pr');

-- ============================================================================
-- SystemPolicyProfile: Project-level always-on execution constraints
-- ============================================================================

CREATE TABLE system_policy_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  required_checks run_check_type[] NOT NULL,
  protected_paths TEXT[],
  forbidden_paths TEXT[],
  dependency_policy JSONB NOT NULL DEFAULT '{}',
  security_policy JSONB NOT NULL DEFAULT '{}',
  architecture_policy JSONB NOT NULL DEFAULT '{}',
  approval_policy JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id)
);

CREATE INDEX idx_system_policy_profile_project_id ON system_policy_profile (project_id);

-- ============================================================================
-- OrchestrationRun: Build execution lifecycle
-- ============================================================================

CREATE TABLE orchestration_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  scope build_scope NOT NULL,
  workflow_id UUID REFERENCES workflow(id) ON DELETE SET NULL ON UPDATE CASCADE,
  card_id UUID REFERENCES card(id) ON DELETE SET NULL ON UPDATE CASCADE,
  trigger_type trigger_type NOT NULL,
  status run_status NOT NULL DEFAULT 'queued',
  initiated_by TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  system_policy_profile_id UUID NOT NULL REFERENCES system_policy_profile(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  system_policy_snapshot JSONB NOT NULL,
  run_input_snapshot JSONB NOT NULL,
  worktree_root TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orchestration_run
  ADD CONSTRAINT chk_orchestration_run_scope_workflow
  CHECK ((scope != 'workflow') OR (workflow_id IS NOT NULL AND card_id IS NULL));

ALTER TABLE orchestration_run
  ADD CONSTRAINT chk_orchestration_run_scope_card
  CHECK ((scope != 'card') OR (card_id IS NOT NULL));

CREATE INDEX idx_orchestration_run_project_scope_status
  ON orchestration_run (project_id, scope, status, created_at DESC);
CREATE INDEX idx_orchestration_run_workflow_id
  ON orchestration_run (workflow_id, status, created_at DESC) WHERE workflow_id IS NOT NULL;
CREATE INDEX idx_orchestration_run_card_id
  ON orchestration_run (card_id, status, created_at DESC) WHERE card_id IS NOT NULL;

-- ============================================================================
-- CardAssignment: Per-card execution assignment
-- ============================================================================

CREATE TABLE card_assignment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE ON UPDATE CASCADE,
  card_id UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE ON UPDATE CASCADE,
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
  UNIQUE (run_id, card_id, agent_profile)
);

CREATE INDEX idx_card_assignment_run_status ON card_assignment (run_id, status);

ALTER TABLE card_assignment
  ADD CONSTRAINT chk_card_assignment_allowed_paths
  CHECK (array_length(allowed_paths, 1) > 0);

-- ============================================================================
-- AgentExecution, AgentCommit
-- ============================================================================

CREATE TABLE agent_execution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES card_assignment(id) ON DELETE CASCADE ON UPDATE CASCADE,
  status run_status NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  summary TEXT,
  error TEXT
);

CREATE INDEX idx_agent_execution_assignment_id ON agent_execution (assignment_id);

CREATE TABLE agent_commit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES card_assignment(id) ON DELETE CASCADE ON UPDATE CASCADE,
  sha TEXT NOT NULL,
  branch TEXT NOT NULL,
  message TEXT NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_agent_commit_assignment_id ON agent_commit (assignment_id);

-- ============================================================================
-- RunCheck: Quality gate execution
-- ============================================================================

CREATE TABLE run_check (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE ON UPDATE CASCADE,
  check_type run_check_type NOT NULL,
  status check_status NOT NULL,
  output TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_run_check_run_id ON run_check (run_id);

-- ============================================================================
-- PullRequestCandidate: Draft PR tracking
-- ============================================================================

CREATE TABLE pull_request_candidate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE ON UPDATE CASCADE,
  base_branch TEXT NOT NULL,
  head_branch TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status pr_status NOT NULL DEFAULT 'not_created',
  pr_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id)
);

CREATE INDEX idx_pull_request_candidate_run_id ON pull_request_candidate (run_id);

-- ============================================================================
-- ApprovalRequest: PR approval lifecycle
-- ============================================================================

CREATE TABLE approval_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES orchestration_run(id) ON DELETE CASCADE ON UPDATE CASCADE,
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

CREATE INDEX idx_approval_request_run_id ON approval_request (run_id);

-- ============================================================================
-- EventLog: Audit and observability
-- ============================================================================

CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  run_id UUID REFERENCES orchestration_run(id) ON DELETE SET NULL ON UPDATE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_log_project_run_created ON event_log (project_id, run_id, created_at DESC);
