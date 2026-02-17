-- Slice B (singular schema): Context artifacts and card knowledge
-- Depends on: 20240213000001, 002, 003 (project, workflow, workflow_activity, step, card, planning_action)
-- Aligns with DUAL_LLM_INTEGRATION_STRATEGY Phase 0; table names match strategy entity names (singular)

-- ============================================================================
-- Enums (Slice B)
-- ============================================================================

CREATE TYPE artifact_type AS ENUM (
  'doc', 'design', 'code', 'research', 'link', 'image', 'skill',
  'mcp', 'cli', 'api', 'prompt', 'spec', 'runbook'
);

CREATE TYPE planned_file_action AS ENUM ('create', 'edit');

CREATE TYPE planned_file_status AS ENUM ('proposed', 'user_edited', 'approved');

CREATE TYPE planned_file_kind AS ENUM (
  'component', 'endpoint', 'service', 'schema', 'hook', 'util',
  'middleware', 'job', 'config'
);

CREATE TYPE knowledge_item_status AS ENUM ('draft', 'approved', 'rejected');

CREATE TYPE knowledge_item_source AS ENUM ('agent', 'user', 'imported');

-- ============================================================================
-- ContextArtifact (project-level)
-- ============================================================================

CREATE TABLE context_artifact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE ON UPDATE CASCADE,
  name TEXT NOT NULL,
  type artifact_type NOT NULL,
  title TEXT,
  content TEXT,
  uri TEXT,
  locator TEXT,
  mime_type TEXT,
  integration_ref JSONB,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT context_artifact_has_content CHECK (
    content IS NOT NULL OR uri IS NOT NULL OR integration_ref IS NOT NULL
  )
);

CREATE INDEX idx_context_artifact_project_id ON context_artifact (project_id);

-- ============================================================================
-- CardContextArtifact (many-to-many)
-- ============================================================================

CREATE TABLE card_context_artifact (
  card_id UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE ON UPDATE CASCADE,
  context_artifact_id UUID NOT NULL REFERENCES context_artifact(id) ON DELETE CASCADE ON UPDATE CASCADE,
  linked_by TEXT,
  usage_hint TEXT,
  PRIMARY KEY (card_id, context_artifact_id)
);

CREATE INDEX idx_card_context_artifact_card ON card_context_artifact (card_id);
CREATE INDEX idx_card_context_artifact_artifact ON card_context_artifact (context_artifact_id);

-- ============================================================================
-- CardRequirement, CardKnownFact, CardAssumption, CardQuestion
-- ============================================================================

CREATE TABLE card_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE ON UPDATE CASCADE,
  text TEXT NOT NULL,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_requirement_card_id ON card_requirement (card_id);

CREATE TABLE card_known_fact (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE ON UPDATE CASCADE,
  text TEXT NOT NULL,
  evidence_source TEXT,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_known_fact_card_id ON card_known_fact (card_id);

CREATE TABLE card_assumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE ON UPDATE CASCADE,
  text TEXT NOT NULL,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_assumption_card_id ON card_assumption (card_id);

CREATE TABLE card_question (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE ON UPDATE CASCADE,
  text TEXT NOT NULL,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_question_card_id ON card_question (card_id);

-- ============================================================================
-- CardPlannedFile (MVP architecture checkpoint)
-- ============================================================================

CREATE TABLE card_planned_file (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES card(id) ON DELETE CASCADE ON UPDATE CASCADE,
  logical_file_name TEXT NOT NULL,
  module_hint TEXT,
  artifact_kind planned_file_kind NOT NULL,
  action planned_file_action NOT NULL,
  intent_summary TEXT NOT NULL,
  contract_notes TEXT,
  status planned_file_status NOT NULL DEFAULT 'proposed',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_planned_file_card_id ON card_planned_file (card_id);
CREATE INDEX idx_card_planned_file_card_status ON card_planned_file (card_id, status);
