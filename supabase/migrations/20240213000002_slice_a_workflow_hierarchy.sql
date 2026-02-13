-- Slice A Migration 002: Workflow hierarchy (Workflow -> WorkflowActivity -> Step -> Card)
-- All FKs, constraints, and composite indexes per DUAL_LLM_INTEGRATION_STRATEGY

CREATE TABLE workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  label_key TEXT REFERENCES workflow_label(key) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  build_state run_status,
  last_built_at TIMESTAMPTZ,
  last_build_ref TEXT,
  position INT NOT NULL,
  CONSTRAINT workflow_position_non_negative CHECK (position >= 0)
);

CREATE INDEX idx_workflow_project_id ON workflow (project_id);

CREATE TABLE workflow_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title TEXT NOT NULL,
  color activity_color,
  workflow_label_key TEXT REFERENCES workflow_label(key) ON DELETE SET NULL,
  version_label_key TEXT REFERENCES version_label(key) ON DELETE SET NULL,
  depends_on_activity_ids UUID[],
  position INT NOT NULL,
  CONSTRAINT workflow_activity_position_non_negative CHECK (position >= 0)
);

CREATE INDEX idx_workflow_activity_workflow_id ON workflow_activity (workflow_id);
CREATE INDEX idx_workflow_activity_position ON workflow_activity (workflow_id, position);

CREATE TABLE step (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_activity_id UUID NOT NULL REFERENCES workflow_activity(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title TEXT NOT NULL,
  workflow_label_key TEXT REFERENCES workflow_label(key) ON DELETE SET NULL,
  version_label_key TEXT REFERENCES version_label(key) ON DELETE SET NULL,
  depends_on_step_ids UUID[],
  position INT NOT NULL,
  CONSTRAINT step_position_non_negative CHECK (position >= 0)
);

CREATE INDEX idx_step_workflow_activity_id ON step (workflow_activity_id);
CREATE INDEX idx_step_position ON step (workflow_activity_id, position);

CREATE TABLE card (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_activity_id UUID NOT NULL REFERENCES workflow_activity(id) ON DELETE CASCADE ON UPDATE CASCADE,
  step_id UUID REFERENCES step(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status card_status NOT NULL,
  priority INT NOT NULL,
  workflow_label_key TEXT REFERENCES workflow_label(key) ON DELETE SET NULL,
  version_label_key TEXT REFERENCES version_label(key) ON DELETE SET NULL,
  quick_answer TEXT,
  build_state run_status,
  last_built_at TIMESTAMPTZ,
  last_build_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT card_priority_positive CHECK (priority >= 1)
);

CREATE INDEX idx_card_workflow_activity_id ON card (workflow_activity_id);
CREATE INDEX idx_card_step_id ON card (step_id);
CREATE INDEX idx_card_step_priority ON card (step_id, priority) WHERE step_id IS NOT NULL;
