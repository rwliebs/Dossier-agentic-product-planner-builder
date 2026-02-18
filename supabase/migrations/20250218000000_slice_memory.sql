-- Memory Plane (Section 4 coordination)
-- Schema from DUAL_LLM_INTEGRATION_STRATEGY §Memory and Retrieval
-- Depends on: project, workflow, workflow_activity, step, card (for entity_id references)
-- Section 3: port to SQLite (enums → TEXT+CHECK, gen_random_uuid() → app-generated, timestamptz → TEXT)

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE memory_content_type AS ENUM ('inline', 'link');

CREATE TYPE memory_unit_status AS ENUM ('draft', 'approved', 'rejected');

CREATE TYPE memory_entity_type AS ENUM (
  'project', 'workflow', 'activity', 'step', 'card', 'schema'
);

CREATE TYPE memory_relation_role AS ENUM ('source', 'supports', 'constrains');

-- ============================================================================
-- MemoryUnit: content + embedding_ref (vector id in RuVector)
-- ============================================================================

CREATE TABLE memory_unit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type memory_content_type NOT NULL,
  mime_type TEXT,
  title TEXT,
  content_text TEXT,
  link_url TEXT,
  status memory_unit_status NOT NULL,
  embedding_ref TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_memory_unit_inline CHECK (
    (content_type != 'inline') OR (content_text IS NOT NULL)
  ),
  CONSTRAINT chk_memory_unit_link CHECK (
    (content_type != 'link') OR (link_url IS NOT NULL)
  )
);

CREATE INDEX idx_memory_unit_status_updated ON memory_unit (status, updated_at DESC);

-- ============================================================================
-- MemoryUnitRelation: scope mapping (project/workflow/activity/step/card/schema)
-- ============================================================================

CREATE TABLE memory_unit_relation (
  memory_unit_id UUID NOT NULL REFERENCES memory_unit(id) ON DELETE CASCADE,
  entity_type memory_entity_type NOT NULL,
  entity_id TEXT NOT NULL,
  relation_role memory_relation_role,
  PRIMARY KEY (memory_unit_id, entity_type, entity_id)
);

CREATE INDEX idx_memory_unit_relation_entity ON memory_unit_relation (entity_type, entity_id, memory_unit_id);

-- ============================================================================
-- MemoryRetrievalLog: observability
-- ============================================================================

CREATE TABLE memory_retrieval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT NOT NULL,
  scope_entity_type memory_entity_type NOT NULL,
  scope_entity_id TEXT NOT NULL,
  result_memory_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_retrieval_log_scope ON memory_retrieval_log (scope_entity_type, scope_entity_id, created_at DESC);
