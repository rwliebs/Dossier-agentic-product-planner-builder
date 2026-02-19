# Supabase schema: strategy-aligned approach

This doc uses **docs/strategy/dual-llm-integration-strategy.md** and **.cursor/agents/strategy-fidelity-voc.md** to recommend a single schema approach after a DB wipe.

---

## What the strategy says

- **Phase 0 Full Data Schema (Canonical V1)** is the implementation contract (§227).
- Entity names in the strategy are **singular**: `Project`, `Workflow`, `WorkflowActivity`, `Step`, `Card`, `WorkflowLabel`, `VersionLabel`, `PlanningAction`, `ContextArtifact`, `CardPlannedFile`, `OrchestrationRun`, etc.
- **Schema compliance** (strategy-fidelity-voc §1.4): *Verify implementation against Phase 0 Full Data Schema … Report: Missing entities, incorrect field types, or integrity constraint violations.*
- **MVP Delivery Decisions**: Slice A (core + PlanningAction), Slice B (context/knowledge/planned-file), Slice C (execution/checks/approval/audit).

---

## Strategy vs the two migration tracks

| Criterion | 2024 (singular) | 2025 (plural) |
|-----------|------------------|---------------|
| **Entity naming** | Matches strategy: `project`, `workflow`, `card`, `planning_action` | Different: `projects`, `workflows`, `cards`, `planning_actions` |
| **WorkflowLabel / VersionLabel** | ✅ In 20240213000001 | ❌ Not present in any 2025 migration |
| **Phase 0 core** | Project, Workflow, WorkflowActivity, Step, Card, PlanningAction + label tables | Same entities but plural names; no label tables |
| **Slice B / C** | Not yet (would need new migrations that reference singular tables) | ✅ Present (20250213000000, 20250213000002) |
| **Current app code** | Only `__tests__/database/schema.test.ts` | All of `lib/supabase`, `lib/orchestration` use plural `TABLES.*` |

So:

- **2024 track** = better **strategy fidelity** (singular names, label tables), but app and slice B/C are not wired to it.
- **2025 track** = what the **app and orchestration** use today (plural), but it omits WorkflowLabel/VersionLabel and uses a different naming convention than the strategy text.

---

## Recommendation: **singular, strategy-aligned schema**

Reasons:

1. **Single source of truth**: Strategy and strategy-fidelity-voc treat Phase 0 as canonical and use singular entity names. Aligning the DB with that reduces “schema vs strategy” drift and makes fidelity checks straightforward.
2. **Completeness**: Phase 0 explicitly includes `WorkflowLabel` and `VersionLabel`; only the 2024 migrations create them. A strategy-compliant schema should include these.
3. **Naming consistency**: `project` / `workflow` / `card` map directly to the strategy’s Project, Workflow, Card; no mental translation to “table name = plural of entity.”
4. **Voc evaluation**: Schema compliance (§1.4) and “Missing entities” are easier to satisfy when the DB matches the strategy’s entity list and naming.

**Cost**: All code that touches the DB must use **singular** table names (`project`, `workflow`, `workflow_activity`, `step`, `card`, `planning_action`, plus slice B/C names in singular). That means:

- Updating `lib/supabase` (e.g. `TABLES` and every `.from(...)`) to singular.
- Adding migrations for **slice B** and **slice C** that define the same entities as the current 2025 slice B/C migrations but with **singular** table names and FKs to `project`, `workflow`, `card`, etc., and ensuring enums/types stay consistent.

**After wipe:**

1. Run **only** the 2024 migrations in order:  
   `20240213000001` → `20240213000002` → `20240213000003`.
2. Add new migrations for slice B (context artifacts, card knowledge, planned files) and slice C (orchestration, runs, checks, approvals) that:
   - Use singular table names (`context_artifact`, `card_requirement`, `orchestration_run`, …).
   - Reference `project(id)`, `workflow(id)`, `card(id)`, etc.
   - Match the Phase 0 schema (enums, columns, constraints) from the strategy.
3. Update the app: point `TABLES` and all Supabase `.from(...)` calls to these singular table names.

---

## Alternative: **plural schema (app-aligned)**

If you prefer to **minimize code change** and keep the current app as-is:

- After wipe, run **only** the 2025 migrations (20250212000000 → 20250213000000 → 20250213000001 → 20250213000002).
- Treat “strategy entities = singular in the doc; SQL tables = plural by convention” as the standard.
- Add a **separate migration** that creates `workflow_label` and `version_label` (and any FKs from `workflows` / `workflow_activities` / `steps` / `cards` to them) so the DB still has the entities required by Phase 0, even if table names stay plural.

Then you have one schema (plural tables + label tables), no dual track, and strategy fidelity is satisfied by having all entities present, with naming convention documented as above.

---

## Summary

- **Strategy and strategy-fidelity-voc** point to a **singular**, Phase 0–complete schema that includes WorkflowLabel and VersionLabel.
- **Recommended approach**: Wipe → run 2024 migrations only → add slice B/C migrations in **singular** form → switch app and tests to singular table names. That gives one strategy-aligned schema.
- **Pragmatic alternative**: Wipe → run 2025 migrations only → add one migration for `workflow_label` and `version_label` → keep app on plural names and document the naming convention. That gives one app-aligned schema with all Phase 0 entities.

Use `supabase/scripts/wipe_public_schema.sql` before applying either path.
