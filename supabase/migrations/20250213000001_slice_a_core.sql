-- Slice A: Core planning entities
-- Aligns with DUAL_LLM_INTEGRATION_STRATEGY Phase 0 schema

-- Enums
CREATE TYPE card_status AS ENUM (
  'todo', 'active', 'questions', 'review', 'production'
);

CREATE TYPE activity_color AS ENUM (
  'yellow', 'blue', 'purple', 'green', 'orange', 'pink'
);

CREATE TYPE run_status AS ENUM (
  'queued', 'running', 'blocked', 'failed', 'completed', 'cancelled'
);

CREATE TYPE planning_action_type AS ENUM (
  'createWorkflow', 'createActivity', 'createStep', 'createCard',
  'updateCard', 'reorderCard', 'linkContextArtifact', 'upsertCardPlannedFile',
  'approveCardPlannedFile', 'upsertCardKnowledgeItem', 'setCardKnowledgeStatus'
);

CREATE TYPE validation_status AS ENUM ('accepted', 'rejected');

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workflows
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  build_state run_status,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_project_id ON workflows(project_id);

-- Workflow activities
CREATE TABLE workflow_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color activity_color,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_activities_workflow_id ON workflow_activities(workflow_id);
CREATE INDEX idx_workflow_activities_position ON workflow_activities(workflow_id, position);

-- Steps
CREATE TABLE steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_activity_id UUID NOT NULL REFERENCES workflow_activities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_steps_workflow_activity_id ON steps(workflow_activity_id);
CREATE INDEX idx_steps_position ON steps(workflow_activity_id, position);

-- Cards
CREATE TABLE cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_activity_id UUID NOT NULL REFERENCES workflow_activities(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status card_status NOT NULL DEFAULT 'todo',
  priority INT NOT NULL DEFAULT 0,
  build_state run_status,
  last_built_at TIMESTAMPTZ,
  last_build_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cards_workflow_activity_id ON cards(workflow_activity_id);
CREATE INDEX idx_cards_step_id ON cards(step_id);
CREATE INDEX idx_cards_step_priority ON cards(step_id, priority);

-- Planning actions
CREATE TABLE planning_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action_type planning_action_type NOT NULL,
  target_ref JSONB NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}',
  validation_status validation_status NOT NULL,
  rejection_reason TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planning_actions_project_id ON planning_actions(project_id);
CREATE INDEX idx_planning_actions_created_at ON planning_actions(project_id, created_at DESC);
