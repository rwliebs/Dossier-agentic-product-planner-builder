-- Mutation Pipeline Hardening (REMAINING_WORK_PLAN §2)
-- Adds idempotency_key to planning_action, action_sequence to project.
-- Idempotent: safe to run on existing schema.

-- 6d: Idempotency keys on planning_action
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'planning_action' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE planning_action ADD COLUMN idempotency_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_action_idempotency_key
      ON planning_action (project_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    -- planning_actions (plural) may exist instead
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'planning_actions') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'planning_actions' AND column_name = 'idempotency_key'
      ) THEN
        ALTER TABLE planning_actions ADD COLUMN idempotency_key TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_planning_actions_idempotency_key
          ON planning_actions (project_id, idempotency_key)
          WHERE idempotency_key IS NOT NULL;
      END IF;
    END IF;
END $$;

-- 6f: action_sequence on project for concurrent safety
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'project' AND column_name = 'action_sequence'
    ) THEN
      ALTER TABLE project ADD COLUMN action_sequence INT NOT NULL DEFAULT 0;
    END IF;
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'action_sequence'
    ) THEN
      ALTER TABLE projects ADD COLUMN action_sequence INT NOT NULL DEFAULT 0;
    END IF;
  END IF;
END $$;
