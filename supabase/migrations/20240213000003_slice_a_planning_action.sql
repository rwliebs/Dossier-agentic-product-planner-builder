-- Slice A Migration 003: Planning Action (mutation contract)
-- PlanningAction is the only mutation contract for map state changes

CREATE TABLE planning_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  action_type planning_action_type NOT NULL,
  target_ref JSONB NOT NULL,
  payload JSONB NOT NULL,
  validation_status validation_status NOT NULL,
  rejection_reason TEXT,
  applied_at TIMESTAMPTZ
);

CREATE INDEX idx_planning_action_project_id ON planning_action (project_id);
CREATE INDEX idx_planning_action_validation_status ON planning_action (project_id, validation_status);
CREATE INDEX idx_planning_action_applied_at ON planning_action (project_id, applied_at DESC) WHERE applied_at IS NOT NULL;

-- No-auth POC: RLS is not enabled on migration-created tables by default.
-- When auth is added, enable RLS and add proper policies.
