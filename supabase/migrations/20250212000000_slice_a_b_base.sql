-- Slice A/B Base: Projects, Workflows, Activities, Steps, Cards
-- Prerequisite for slice-c orchestration migration.
-- Creates minimal schema for planning entities.

-- ============================================================================
-- Enum types (slice-a)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE run_status AS ENUM (
    'queued', 'running', 'blocked', 'failed', 'completed', 'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE card_status AS ENUM (
    'todo', 'active', 'questions', 'review', 'production'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE activity_color AS ENUM (
    'yellow', 'blue', 'purple', 'green', 'orange', 'pink'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Workflows
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  build_state run_status,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_project_id ON workflows(project_id);

-- ============================================================================
-- Workflow Activities
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color activity_color,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_activities_workflow_id
  ON workflow_activities(workflow_id, position);

-- ============================================================================
-- Steps
-- ============================================================================

CREATE TABLE IF NOT EXISTS steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_activity_id UUID NOT NULL REFERENCES workflow_activities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_steps_workflow_activity_id
  ON steps(workflow_activity_id, position);

-- ============================================================================
-- Cards
-- ============================================================================

CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_activity_id UUID NOT NULL REFERENCES workflow_activities(id) ON DELETE CASCADE,
  step_id UUID REFERENCES steps(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status card_status NOT NULL DEFAULT 'todo',
  priority INT NOT NULL DEFAULT 0,
  position INT NOT NULL DEFAULT 0,
  build_state run_status,
  last_built_at TIMESTAMPTZ,
  last_build_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_step_id ON cards(step_id);
CREATE INDEX IF NOT EXISTS idx_cards_workflow_activity_id ON cards(workflow_activity_id);
