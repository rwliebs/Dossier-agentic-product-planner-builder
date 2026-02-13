-- Slice A Migration 001: Enums and foundational tables
-- Core planning entities - no auth/RLS in MVP POC

-- Enums for core planning
CREATE TYPE card_status AS ENUM (
  'todo', 'active', 'questions', 'review', 'production'
);

CREATE TYPE activity_color AS ENUM (
  'yellow', 'blue', 'purple', 'green', 'orange', 'pink'
);

CREATE TYPE run_status AS ENUM (
  'queued', 'running', 'blocked', 'failed', 'completed', 'cancelled'
);

CREATE TYPE build_scope AS ENUM ('workflow', 'card');

CREATE TYPE planning_action_type AS ENUM (
  'createWorkflow', 'createActivity', 'createStep', 'createCard',
  'updateCard', 'reorderCard', 'linkContextArtifact', 'upsertCardPlannedFile',
  'approveCardPlannedFile', 'upsertCardKnowledgeItem', 'setCardKnowledgeStatus'
);

CREATE TYPE validation_status AS ENUM ('accepted', 'rejected');

-- Foundational tables
CREATE TABLE project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  repo_url TEXT,
  default_branch TEXT NOT NULL DEFAULT 'main',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_name_unique UNIQUE (name)
);

CREATE TABLE workflow_label (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT
);

CREATE TABLE version_label (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT
);

-- Index for project lookups
CREATE INDEX idx_project_updated_at ON project (updated_at DESC);
