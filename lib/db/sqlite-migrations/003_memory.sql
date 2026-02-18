-- Memory Plane (Section 4)
-- Ported from supabase/migrations/20250218000000_slice_memory.sql
-- Enums -> TEXT+CHECK, gen_random_uuid() -> app-generated, timestamptz -> TEXT
-- UUID[] -> JSON TEXT for result_memory_ids

-- MemoryUnit: content + embedding_ref (vector id in RuVector)
CREATE TABLE IF NOT EXISTS memory_unit (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('inline', 'link')),
  mime_type TEXT,
  title TEXT,
  content_text TEXT,
  link_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved', 'rejected')),
  embedding_ref TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((content_type != 'inline') OR (content_text IS NOT NULL)),
  CHECK ((content_type != 'link') OR (link_url IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_memory_unit_status_updated ON memory_unit (status, updated_at DESC);

-- MemoryUnitRelation: scope mapping (project/workflow/activity/step/card/schema)
CREATE TABLE IF NOT EXISTS memory_unit_relation (
  memory_unit_id TEXT NOT NULL REFERENCES memory_unit(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'workflow', 'activity', 'step', 'card', 'schema')),
  entity_id TEXT NOT NULL,
  relation_role TEXT CHECK (relation_role IN ('source', 'supports', 'constrains')),
  PRIMARY KEY (memory_unit_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_unit_relation_entity ON memory_unit_relation (entity_type, entity_id, memory_unit_id);

-- MemoryRetrievalLog: observability (result_memory_ids stored as JSON array)
CREATE TABLE IF NOT EXISTS memory_retrieval_log (
  id TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  scope_entity_type TEXT NOT NULL CHECK (scope_entity_type IN ('project', 'workflow', 'activity', 'step', 'card', 'schema')),
  scope_entity_id TEXT NOT NULL,
  result_memory_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memory_retrieval_log_scope ON memory_retrieval_log (scope_entity_type, scope_entity_id, created_at DESC);
