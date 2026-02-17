# Migration overlap and recommended path

## Summary

There are **two parallel schema tracks** in the migrations:

| Track | Naming   | Migrations | Tables |
|-------|----------|------------|--------|
| **2024** | Singular | 20240213000001, 002, 003 | `project`, `workflow`, `workflow_activity`, `step`, `card`, `planning_action`, `workflow_label`, `version_label` |
| **2025** | Plural   | 20250212000000, 20250213000001, 000002 | `projects`, `workflows`, `workflow_activities`, `steps`, `cards`, `planning_actions`, slice B/C tables |

**Application code** (`lib/supabase`, `lib/orchestration`) uses the **plural** schema (`TABLES.projects`, `TABLES.cards`, etc.). **Tests** in `__tests__/database/schema.test.ts` use the **singular** schema (2024 migrations).

---

## Overlaps

### 1. Enums

- **20240213000001** (slice_a_enums_and_foundation): `card_status`, `activity_color`, `run_status`, `build_scope`, `planning_action_type`, `validation_status` — plain `CREATE TYPE` (fails if run twice).
- **20250212000000** (slice_a_b_base): `run_status`, `card_status`, `activity_color` — idempotent `DO $$ ... EXCEPTION WHEN duplicate_object`.
- **20250213000001** (slice_a_core): same as 20240201 — **plain `CREATE TYPE`** → **fails** if 20240213000001 or 20250212000000 already ran.
- **20250213000000** (slice_c_orchestration): `build_scope`, `trigger_type`, `agent_role`, etc. — idempotent.

So: if you ran **20240213000001** first, then **20250213000001** will fail on enum creation. The slice_a_core migration has been updated to use idempotent enum creation so it can run after either 20240201 or 20250212000000.

### 2. Base tables (projects / workflows / activities / steps / cards)

- **20240213000001**: creates `project` (singular), `workflow_label`, `version_label`.
- **20240213000002**: creates `workflow`, `workflow_activity`, `step`, `card` (singular) — references `project(id)`.
- **20250212000000**: creates `projects`, `workflows`, `workflow_activities`, `steps`, `cards` (plural) with `CREATE TABLE IF NOT EXISTS` — references `projects(id)`.
- **20250213000001** (slice_a_core): creates the same **plural** tables (and `planning_actions`) — originally plain `CREATE TABLE` (would fail if 20250212000000 ran first). Now uses `CREATE TABLE IF NOT EXISTS` and idempotent enums.

So you can end up with **both** `project` (singular) and `projects` (plural) if you run 2024 + 2025. The app only uses the **plural** set.

### 3. Planning action(s)

- **20240213000003**: `planning_action` (singular), references `project(id)`.
- **20250213000001**: `planning_actions` (plural), references `projects(id)`.

Again, app uses `planning_actions` (plural).

---

## Recommended path (single track)

To avoid duplicate objects and confusion:

1. **If starting fresh**: run only the **2025** migrations in order:
   - `20250212000000_slice_a_b_base.sql` — enums + projects, workflows, workflow_activities, steps, cards
   - `20250213000000_slice_c_orchestration.sql` — orchestration tables
   - `20250213000001_slice_a_core.sql` — idempotent; adds planning_actions, ensures columns/indexes (no-op for existing tables)
   - `20250213000002_slice_b_context.sql` — context_artifacts, card_requirements, etc.

2. **If you already ran 20240213000001** (enums + project, workflow_label, version_label):
   - Run **20250212000000** (safe: idempotent enums, creates plural tables).
   - Then **20250213000000**, **20250213000001** (idempotent), **20250213000002**.
   - You will have both singular (`project`, …) and plural (`projects`, …). The app uses only the plural set. You can keep the singular tables for the schema tests or drop them later.

3. **If you want to use only the 2024 (singular) schema**: you would need to change application code and slice B/C migrations to use singular table names and `project` instead of `projects`. Not recommended unless you explicitly standardize on that schema.

---

## File reference

| File | Enums | Tables | Idempotent? |
|------|--------|--------|-------------|
| 20240213000001_slice_a_enums_and_foundation.sql | Yes (plain) | project, workflow_label, version_label | No |
| 20240213000002_slice_a_workflow_hierarchy.sql | — | workflow, workflow_activity, step, card | No |
| 20240213000003_slice_a_planning_action.sql | — | planning_action | No |
| 20250212000000_slice_a_b_base.sql | run_status, card_status, activity_color (DO $$) | projects, workflows, workflow_activities, steps, cards | Yes |
| 20250213000000_slice_c_orchestration.sql | build_scope, trigger_type, … (DO $$) | orchestration_* | Yes |
| 20250213000001_slice_a_core.sql | Same as 20240201 (now DO $$) | projects, workflows, …, planning_actions | Yes (after update) |
| 20250213000002_slice_b_context.sql | artifact_type, planned_file_*, … | context_artifacts, card_* | No (enums/tables unique) |
