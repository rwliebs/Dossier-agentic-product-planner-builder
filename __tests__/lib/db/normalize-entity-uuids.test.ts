/**
 * Tests for 009_normalize_entity_uuids migration.
 * Verifies that planning_action target_ref/payload and orchestration_run.workflow_id
 * are updated when entity IDs are normalized to UUIDs.
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, runNormalizeEntityUuids } from "@/lib/db/migrate";

function createFreshDb(): ReturnType<typeof Database> {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = OFF");
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))
  `);
  for (const m of MIGRATIONS) {
    db.exec(m.sql);
    db.prepare("INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(m.name);
  }
  db.prepare("DELETE FROM _migrations WHERE name = '009_normalize_entity_uuids'").run();
  db.pragma("foreign_keys = ON");
  return db;
}

describe("009_normalize_entity_uuids migration", () => {
  it("updates planning_action target_ref and payload when entity IDs are normalized", () => {
    const db = createFreshDb();
    const projectId = "11111111-1111-1111-1111-111111111111";
    const oldWorkflowId = "wf-old";
    const oldActivityId = "act-old";
    const oldCardId = "card-old";

    db.prepare(
      "INSERT INTO project (id, name, repo_url, default_branch, action_sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(projectId, "Test", null, "main", 0, "2024-01-01", "2024-01-01");

    db.prepare(
      "INSERT INTO workflow (id, project_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(oldWorkflowId, projectId, "W", 0, "2024-01-01", "2024-01-01");

    db.prepare(
      "INSERT INTO workflow_activity (id, workflow_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(oldActivityId, oldWorkflowId, "A", 0, "2024-01-01", "2024-01-01");

    db.prepare(
      "INSERT INTO card (id, workflow_activity_id, title, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(oldCardId, oldActivityId, "C", "todo", 0, "2024-01-01", "2024-01-01");

    const targetRef = JSON.stringify({
      workflow_id: oldWorkflowId,
      workflow_activity_id: oldActivityId,
      card_id: oldCardId,
    });
    const payload = JSON.stringify({ id: oldCardId, title: "Card", status: "todo", priority: 0, position: 0 });
    db.prepare(
      "INSERT INTO planning_action (id, project_id, action_type, target_ref, payload, validation_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("pa-1", projectId, "createCard", targetRef, payload, "accepted", "2024-01-01");

    runNormalizeEntityUuids(db);

    const row = db.prepare("SELECT target_ref, payload FROM planning_action WHERE id = 'pa-1'").get() as {
      target_ref: string;
      payload: string;
    };
    const tr = JSON.parse(row.target_ref) as Record<string, string>;
    const pl = JSON.parse(row.payload) as Record<string, string>;

    expect(tr.workflow_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(tr.workflow_id).not.toBe(oldWorkflowId);
    expect(tr.workflow_activity_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(tr.workflow_activity_id).not.toBe(oldActivityId);
    expect(tr.card_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(tr.card_id).not.toBe(oldCardId);
    expect(pl.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(pl.id).not.toBe(oldCardId);

    db.close();
  });

  it("updates orchestration_run.workflow_id when workflow ID is normalized", () => {
    const db = createFreshDb();
    const projectId = "11111111-1111-1111-1111-111111111111";
    const oldWorkflowId = "wf-old";
    const oldActivityId = "act-old";
    const oldCardId = "card-old";
    const policyId = "22222222-2222-2222-2222-222222222222";
    const runId = "33333333-3333-3333-3333-333333333333";

    db.prepare(
      "INSERT INTO project (id, name, repo_url, default_branch, action_sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(projectId, "Test", null, "main", 0, "2024-01-01", "2024-01-01");

    db.prepare(
      "INSERT INTO system_policy_profile (id, project_id, required_checks, dependency_policy, security_policy, architecture_policy, approval_policy, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(policyId, projectId, "[]", "{}", "{}", "{}", "{}", "2024-01-01");

    db.prepare(
      "INSERT INTO workflow (id, project_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(oldWorkflowId, projectId, "W", 0, "2024-01-01", "2024-01-01");

    db.prepare(
      "INSERT INTO workflow_activity (id, workflow_id, title, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(oldActivityId, oldWorkflowId, "A", 0, "2024-01-01", "2024-01-01");

    db.prepare(
      "INSERT INTO card (id, workflow_activity_id, title, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(oldCardId, oldActivityId, "C", "todo", 0, "2024-01-01", "2024-01-01");

    db.prepare(
      `INSERT INTO orchestration_run (id, project_id, scope, workflow_id, card_id, trigger_type, status, initiated_by, repo_url, base_branch, system_policy_profile_id, system_policy_snapshot, run_input_snapshot, created_at, updated_at)
       VALUES (?, ?, 'workflow', ?, NULL, 'manual', 'queued', 'test', 'https://x.com', 'main', ?, '{}', '{}', '2024-01-01', '2024-01-01')`
    ).run(runId, projectId, oldWorkflowId, policyId);

    runNormalizeEntityUuids(db);

    const row = db.prepare("SELECT workflow_id FROM orchestration_run WHERE id = ?").get(runId) as {
      workflow_id: string;
    };
    expect(row.workflow_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(row.workflow_id).not.toBe(oldWorkflowId);

    db.close();
  });
});
