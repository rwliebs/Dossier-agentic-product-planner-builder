-- Slice B: Context artifacts and card knowledge
-- Aligns with DUAL_LLM_INTEGRATION_STRATEGY Phase 0 schema

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

-- Context artifacts (project-level)
CREATE TABLE context_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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

CREATE INDEX idx_context_artifacts_project_id ON context_artifacts(project_id);

-- Card-Context many-to-many
CREATE TABLE card_context_artifacts (
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  context_artifact_id UUID NOT NULL REFERENCES context_artifacts(id) ON DELETE CASCADE,
  linked_by TEXT,
  usage_hint TEXT,
  PRIMARY KEY (card_id, context_artifact_id)
);

CREATE INDEX idx_card_context_artifacts_card ON card_context_artifacts(card_id);
CREATE INDEX idx_card_context_artifacts_artifact ON card_context_artifacts(context_artifact_id);

-- Card requirements
CREATE TABLE card_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_requirements_card_id ON card_requirements(card_id);

-- Card known facts
CREATE TABLE card_known_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  evidence_source TEXT,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_known_facts_card_id ON card_known_facts(card_id);

-- Card assumptions
CREATE TABLE card_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_assumptions_card_id ON card_assumptions(card_id);

-- Card questions
CREATE TABLE card_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status knowledge_item_status NOT NULL DEFAULT 'draft',
  source knowledge_item_source NOT NULL,
  confidence NUMERIC(3,2),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_card_questions_card_id ON card_questions(card_id);

-- Card planned files
CREATE TABLE card_planned_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
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

CREATE INDEX idx_card_planned_files_card_id ON card_planned_files(card_id);
CREATE INDEX idx_card_planned_files_card_status ON card_planned_files(card_id, status);
