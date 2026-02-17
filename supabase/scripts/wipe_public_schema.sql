-- =============================================================================
-- WIPE PUBLIC SCHEMA — DESTRUCTIVE, USE WITH CARE
-- =============================================================================
--
-- This script drops ALL tables and ALL custom types (enums) in the public
-- schema. Use it when you want to reset the database and re-run a single
-- migration track (e.g. plural-only or singular-only).
--
-- How to run:
--   1. Supabase Dashboard → SQL Editor → paste this script → Run
--   2. Or: psql $DATABASE_URL -f supabase/scripts/wipe_public_schema.sql
--
-- After running:
--   - Re-run your chosen migrations in order (see MIGRATION_OVERLAP.md).
--   - All data in public tables will be gone.
--
-- =============================================================================

-- Drop all tables in public (CASCADE removes FKs and dependent objects)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  )
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
END $$;

-- Drop all custom enum types in public (must run after tables that use them)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON t.typnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
  )
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;

-- Optional: uncomment to reset Supabase migration history (so `supabase db reset` / migrations run fresh)
-- TRUNCATE supabase_migrations.schema_migrations;
