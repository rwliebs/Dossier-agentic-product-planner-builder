/**
 * SQLite implementation of DbAdapter.
 * Uses better-sqlite3. All JSON columns stored as TEXT, parsed on read.
 */

import Database from "better-sqlite3";
import type { DbAdapter, DbRow } from "./adapter";
import { runMigrations } from "./migrate";

const JSON_COLUMNS: Record<string, string[]> = {
  planning_action: ["target_ref", "payload"],
  context_artifact: ["integration_ref"],
  system_policy_profile: [
    "required_checks",
    "protected_paths",
    "forbidden_paths",
    "dependency_policy",
    "security_policy",
    "architecture_policy",
    "approval_policy",
  ],
  orchestration_run: ["system_policy_snapshot", "run_input_snapshot"],
  card_assignment: ["allowed_paths", "forbidden_paths", "assignment_input_snapshot"],
  event_log: ["payload"],
};

function parseRow(table: string, row: DbRow): DbRow {
  const cols = JSON_COLUMNS[table];
  if (!cols) return row;
  const out = { ...row };
  for (const col of cols) {
    const v = out[col];
    if (typeof v === "string") {
      try {
        (out as Record<string, unknown>)[col] = JSON.parse(v);
      } catch {
        // keep as string if invalid JSON
      }
    }
  }
  return out;
}

function stringifyRow(table: string, row: DbRow): DbRow {
  const cols = JSON_COLUMNS[table];
  if (!cols) return row;
  const out = { ...row };
  for (const col of cols) {
    const v = out[col];
    if (v !== undefined && v !== null && typeof v === "object") {
      (out as Record<string, unknown>)[col] = JSON.stringify(v);
    }
  }
  return out;
}

export function createSqliteAdapter(dbPath: string | ":memory:"): DbAdapter {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  runMigrations(db);

  const adapter: DbAdapter = {
    async transaction<T>(fn: (a: DbAdapter) => Promise<T>): Promise<T> {
      db.exec("BEGIN");
      try {
        const result = await fn(adapter);
        db.exec("COMMIT");
        return result;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },

    // --- Projects ---
    async getProject(projectId: string) {
      const row = db.prepare("SELECT * FROM project WHERE id = ?").get(projectId) as DbRow | undefined;
      return row ? parseRow("project", row) : null;
    },
    async listProjects() {
      const rows = db.prepare("SELECT * FROM project ORDER BY created_at DESC").all() as DbRow[];
      return rows.map((r) => parseRow("project", r));
    },
    async incrementProjectActionSequence(projectId: string, expectedSequence: number) {
      const r = db.prepare(
        "UPDATE project SET action_sequence = ?, updated_at = datetime('now') WHERE id = ? AND action_sequence = ?"
      ).run(expectedSequence + 1, projectId, expectedSequence);
      if (r.changes === 0) return null;
      const row = db.prepare("SELECT action_sequence FROM project WHERE id = ?").get(projectId) as { action_sequence: number };
      return row?.action_sequence ?? null;
    },
    async insertProject(row: DbRow) {
      db.prepare(
        "INSERT INTO project (id, name, repo_url, default_branch, action_sequence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.name,
        row.repo_url ?? null,
        row.default_branch ?? "main",
        row.action_sequence ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async updateProject(projectId: string, updates: DbRow) {
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (k !== "id" && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(projectId);
      db.prepare(`UPDATE project SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },

    // --- Workflows ---
    async getWorkflowsByProject(projectId: string) {
      const rows = db
        .prepare("SELECT * FROM workflow WHERE project_id = ? ORDER BY position ASC")
        .all(projectId) as DbRow[];
      return rows.map((r) => parseRow("workflow", r));
    },
    async insertWorkflow(row: DbRow) {
      db.prepare(
        "INSERT INTO workflow (id, project_id, title, description, build_state, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.project_id,
        row.title,
        row.description ?? null,
        row.build_state ?? null,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async upsertWorkflow(row: DbRow) {
      const r = stringifyRow("workflow", row);
      db.prepare(
        `INSERT INTO workflow (id, project_id, title, description, build_state, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, build_state=excluded.build_state, position=excluded.position, updated_at=excluded.updated_at`
      ).run(
        r.id ?? crypto.randomUUID(),
        r.project_id,
        r.title,
        r.description ?? null,
        r.build_state ?? null,
        r.position ?? 0,
        (r.created_at as string) ?? new Date().toISOString(),
        (r.updated_at as string) ?? new Date().toISOString()
      );
    },
    async deleteWorkflow(id: string, projectId: string) {
      db.prepare("DELETE FROM workflow WHERE id = ? AND project_id = ?").run(id, projectId);
    },

    // --- Workflow activities ---
    async getActivitiesByWorkflow(workflowId: string) {
      const rows = db
        .prepare("SELECT * FROM workflow_activity WHERE workflow_id = ? ORDER BY position ASC")
        .all(workflowId) as DbRow[];
      return rows.map((r) => parseRow("workflow_activity", r));
    },
    async getActivitiesByProject(projectId: string) {
      const rows = db
        .prepare(
          `SELECT wa.* FROM workflow_activity wa
           INNER JOIN workflow w ON wa.workflow_id = w.id
           WHERE w.project_id = ? ORDER BY w.position ASC, wa.position ASC`
        )
        .all(projectId) as DbRow[];
      return rows.map((r) => parseRow("workflow_activity", r));
    },
    async insertWorkflowActivity(row: DbRow) {
      db.prepare(
        "INSERT INTO workflow_activity (id, workflow_id, title, color, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.workflow_id,
        row.title,
        row.color ?? null,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async upsertWorkflowActivity(row: DbRow) {
      db.prepare(
        `INSERT INTO workflow_activity (id, workflow_id, title, color, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, color=excluded.color, position=excluded.position, updated_at=excluded.updated_at`
      ).run(
        row.id ?? crypto.randomUUID(),
        row.workflow_id,
        row.title,
        row.color ?? null,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async deleteWorkflowActivity(id: string, workflowId: string) {
      db.prepare("DELETE FROM workflow_activity WHERE id = ? AND workflow_id = ?").run(id, workflowId);
    },

    // --- Cards ---
    async getCardsByActivity(activityId: string) {
      const rows = db
        .prepare("SELECT * FROM card WHERE workflow_activity_id = ? ORDER BY priority ASC, position ASC")
        .all(activityId) as DbRow[];
      return rows.map((r) => parseRow("card", r));
    },
    async getCardsByProject(projectId: string) {
      const rows = db
        .prepare(
          `SELECT c.* FROM card c
           INNER JOIN workflow_activity wa ON c.workflow_activity_id = wa.id
           INNER JOIN workflow w ON wa.workflow_id = w.id
           WHERE w.project_id = ? ORDER BY w.position ASC, wa.position ASC, c.position ASC, c.priority ASC`
        )
        .all(projectId) as DbRow[];
      return rows.map((r) => parseRow("card", r));
    },
    async getCardById(cardId: string) {
      const row = db.prepare("SELECT * FROM card WHERE id = ?").get(cardId) as DbRow | undefined;
      return row ? parseRow("card", row) : null;
    },
    async insertCard(row: DbRow) {
      db.prepare(
        "INSERT INTO card (id, workflow_activity_id, title, description, status, priority, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.workflow_activity_id,
        row.title,
        row.description ?? null,
        row.status ?? "todo",
        row.priority ?? 0,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async updateCard(cardId: string, updates: DbRow) {
      const allowed = ["title", "description", "status", "priority", "position", "quick_answer", "finalized_at", "build_state", "last_built_at", "last_build_ref", "last_build_error"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(cardId);
      db.prepare(`UPDATE card SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },
    async upsertCard(row: DbRow) {
      db.prepare(
        `INSERT INTO card (id, workflow_activity_id, title, description, status, priority, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, status=excluded.status, priority=excluded.priority, position=excluded.position, updated_at=excluded.updated_at`
      ).run(
        row.id ?? crypto.randomUUID(),
        row.workflow_activity_id,
        row.title,
        row.description ?? null,
        row.status ?? "todo",
        row.priority ?? 0,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async deleteCard(id: string) {
      db.prepare("DELETE FROM card WHERE id = ?").run(id);
    },

    // --- Planning actions ---
    async getPlanningActionsByProject(projectId: string, limit = 100) {
      const rows = db
        .prepare("SELECT * FROM planning_action WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(projectId, limit) as DbRow[];
      return rows.map((r) => parseRow("planning_action", r));
    },
    async getPlanningActionsByIdempotencyKey(projectId: string, idempotencyKey: string) {
      const rows = db
        .prepare(
          "SELECT id, action_type, validation_status, rejection_reason, applied_at FROM planning_action WHERE project_id = ? AND idempotency_key = ? ORDER BY created_at ASC"
        )
        .all(projectId, idempotencyKey) as DbRow[];
      return rows;
    },
    async insertPlanningAction(row: DbRow) {
      const r = stringifyRow("planning_action", row);
      db.prepare(
        "INSERT INTO planning_action (id, project_id, action_type, target_ref, payload, validation_status, rejection_reason, applied_at, idempotency_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        r.id ?? crypto.randomUUID(),
        r.project_id,
        r.action_type,
        typeof r.target_ref === "string" ? r.target_ref : JSON.stringify(r.target_ref ?? {}),
        typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload ?? {}),
        r.validation_status,
        r.rejection_reason ?? null,
        r.applied_at ?? null,
        r.idempotency_key ?? null,
        (r.created_at as string) ?? new Date().toISOString()
      );
    },

    // --- Context artifacts ---
    async getArtifactsByProject(projectId: string) {
      const rows = db
        .prepare("SELECT * FROM context_artifact WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as DbRow[];
      return rows.map((r) => parseRow("context_artifact", r));
    },
    async getArtifactById(artifactId: string) {
      const row = db.prepare("SELECT * FROM context_artifact WHERE id = ?").get(artifactId) as DbRow | undefined;
      return row ? parseRow("context_artifact", row) : null;
    },
    async insertContextArtifact(row: DbRow) {
      const r = stringifyRow("context_artifact", row);
      db.prepare(
        "INSERT INTO context_artifact (id, project_id, name, type, title, content, uri, locator, mime_type, integration_ref, checksum, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        r.id ?? crypto.randomUUID(),
        r.project_id,
        r.name,
        r.type,
        r.title ?? null,
        r.content ?? null,
        r.uri ?? null,
        r.locator ?? null,
        r.mime_type ?? null,
        typeof r.integration_ref === "string" ? r.integration_ref : (r.integration_ref ? JSON.stringify(r.integration_ref) : null),
        r.checksum ?? null,
        (r.created_at as string) ?? new Date().toISOString(),
        (r.updated_at as string) ?? new Date().toISOString()
      );
    },
    async updateContextArtifact(artifactId: string, updates: DbRow) {
      const allowed = ["name", "type", "title", "content", "uri", "locator", "mime_type", "integration_ref", "checksum"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
        }
      }
      vals.push(artifactId);
      db.prepare(`UPDATE context_artifact SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },
    async deleteContextArtifact(artifactId: string, projectId: string) {
      db.prepare("DELETE FROM context_artifact WHERE id = ? AND project_id = ?").run(artifactId, projectId);
    },

    // --- Card context links ---
    async getCardContextArtifacts(cardId: string) {
      return db
        .prepare("SELECT context_artifact_id, usage_hint, linked_by FROM card_context_artifact WHERE card_id = ?")
        .all(cardId) as DbRow[];
    },
    async getCardContextLinksByProject(projectId: string) {
      const rows = db
        .prepare(
          `SELECT cca.card_id, cca.context_artifact_id FROM card_context_artifact cca
           INNER JOIN card c ON cca.card_id = c.id
           INNER JOIN workflow_activity wa ON c.workflow_activity_id = wa.id
           INNER JOIN workflow w ON wa.workflow_id = w.id
           WHERE w.project_id = ?`
        )
        .all(projectId) as Array<{ card_id: string; context_artifact_id: string }>;
      return rows;
    },
    async insertCardContextArtifact(row: DbRow) {
      db.prepare(
        "INSERT OR IGNORE INTO card_context_artifact (card_id, context_artifact_id, linked_by, usage_hint) VALUES (?, ?, ?, ?)"
      ).run(row.card_id, row.context_artifact_id, row.linked_by ?? null, row.usage_hint ?? null);
    },

    // --- Card knowledge ---
    async getCardRequirements(cardId: string) {
      const rows = db
        .prepare("SELECT * FROM card_requirement WHERE card_id = ? ORDER BY position ASC")
        .all(cardId) as DbRow[];
      return rows.map((r) => parseRow("card_requirement", r));
    },
    async getRequirementsByProject(projectId: string) {
      const cardIds = await adapter.getCardIdsByProject(projectId);
      if (cardIds.length === 0) return [];
      const placeholders = cardIds.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT * FROM card_requirement WHERE card_id IN (${placeholders}) ORDER BY position ASC`)
        .all(...cardIds) as DbRow[];
      return rows.map((r) => parseRow("card_requirement", r));
    },
    async getCardFacts(cardId: string) {
      const rows = db
        .prepare("SELECT * FROM card_known_fact WHERE card_id = ? ORDER BY position ASC")
        .all(cardId) as DbRow[];
      return rows.map((r) => parseRow("card_known_fact", r));
    },
    async getCardAssumptions(cardId: string) {
      const rows = db
        .prepare("SELECT * FROM card_assumption WHERE card_id = ? ORDER BY position ASC")
        .all(cardId) as DbRow[];
      return rows.map((r) => parseRow("card_assumption", r));
    },
    async getCardQuestions(cardId: string) {
      const rows = db
        .prepare("SELECT * FROM card_question WHERE card_id = ? ORDER BY position ASC")
        .all(cardId) as DbRow[];
      return rows.map((r) => parseRow("card_question", r));
    },
    async insertCardRequirement(row: DbRow) {
      db.prepare(
        "INSERT INTO card_requirement (id, card_id, text, status, source, confidence, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.card_id,
        row.text,
        row.status ?? "draft",
        row.source ?? "user",
        row.confidence ?? null,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async insertCardFact(row: DbRow) {
      db.prepare(
        "INSERT INTO card_known_fact (id, card_id, text, evidence_source, status, source, confidence, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.card_id,
        row.text,
        row.evidence_source ?? null,
        row.status ?? "draft",
        row.source ?? "user",
        row.confidence ?? null,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async insertCardAssumption(row: DbRow) {
      db.prepare(
        "INSERT INTO card_assumption (id, card_id, text, status, source, confidence, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.card_id,
        row.text,
        row.status ?? "draft",
        row.source ?? "user",
        row.confidence ?? null,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async insertCardQuestion(row: DbRow) {
      db.prepare(
        "INSERT INTO card_question (id, card_id, text, status, source, confidence, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.card_id,
        row.text,
        row.status ?? "draft",
        row.source ?? "user",
        row.confidence ?? null,
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async updateCardRequirement(id: string, cardId: string, updates: DbRow) {
      const allowed = ["text", "status", "confidence", "position"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(id, cardId);
      db.prepare(`UPDATE card_requirement SET ${set.join(", ")} WHERE id = ? AND card_id = ?`).run(...vals);
    },
    async updateCardFact(id: string, cardId: string, updates: DbRow) {
      const allowed = ["text", "evidence_source", "status", "confidence", "position"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(id, cardId);
      db.prepare(`UPDATE card_known_fact SET ${set.join(", ")} WHERE id = ? AND card_id = ?`).run(...vals);
    },
    async updateCardAssumption(id: string, cardId: string, updates: DbRow) {
      const allowed = ["text", "status", "confidence", "position"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(id, cardId);
      db.prepare(`UPDATE card_assumption SET ${set.join(", ")} WHERE id = ? AND card_id = ?`).run(...vals);
    },
    async updateCardQuestion(id: string, cardId: string, updates: DbRow) {
      const allowed = ["text", "status", "confidence", "position"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(id, cardId);
      db.prepare(`UPDATE card_question SET ${set.join(", ")} WHERE id = ? AND card_id = ?`).run(...vals);
    },
    async updateKnowledgeItemStatus(knowledgeItemId: string, cardId: string, status: string) {
      for (const table of ["card_requirement", "card_known_fact", "card_assumption", "card_question"]) {
        const r = db.prepare(`UPDATE ${table} SET status = ?, updated_at = datetime('now') WHERE id = ? AND card_id = ?`).run(status, knowledgeItemId, cardId);
        if (r.changes > 0) return true;
      }
      return false;
    },
    async deleteCardRequirement(id: string, cardId: string) {
      db.prepare("DELETE FROM card_requirement WHERE id = ? AND card_id = ?").run(id, cardId);
    },
    async deleteCardFact(id: string, cardId: string) {
      db.prepare("DELETE FROM card_known_fact WHERE id = ? AND card_id = ?").run(id, cardId);
    },
    async deleteCardAssumption(id: string, cardId: string) {
      db.prepare("DELETE FROM card_assumption WHERE id = ? AND card_id = ?").run(id, cardId);
    },
    async deleteCardQuestion(id: string, cardId: string) {
      db.prepare("DELETE FROM card_question WHERE id = ? AND card_id = ?").run(id, cardId);
    },

    // --- Card planned files ---
    async getCardPlannedFiles(cardId: string) {
      const rows = db
        .prepare("SELECT * FROM card_planned_file WHERE card_id = ? ORDER BY position ASC")
        .all(cardId) as DbRow[];
      return rows;
    },
    async getPlannedFilesByProject(projectId: string) {
      const cardIds = await adapter.getCardIdsByProject(projectId);
      if (cardIds.length === 0) return [];
      const placeholders = cardIds.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT * FROM card_planned_file WHERE card_id IN (${placeholders}) ORDER BY position ASC`)
        .all(...cardIds) as DbRow[];
      return rows;
    },
    async insertCardPlannedFile(row: DbRow) {
      db.prepare(
        "INSERT INTO card_planned_file (id, card_id, logical_file_name, module_hint, artifact_kind, action, intent_summary, contract_notes, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        row.id ?? crypto.randomUUID(),
        row.card_id,
        row.logical_file_name,
        row.module_hint ?? null,
        row.artifact_kind ?? "component",
        row.action ?? "create",
        row.intent_summary,
        row.contract_notes ?? null,
        row.status ?? "proposed",
        row.position ?? 0,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
    },
    async updateCardPlannedFile(id: string, cardId: string, updates: DbRow) {
      const allowed = ["logical_file_name", "module_hint", "artifact_kind", "action", "intent_summary", "contract_notes", "status", "position"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(id, cardId);
      db.prepare(`UPDATE card_planned_file SET ${set.join(", ")} WHERE id = ? AND card_id = ?`).run(...vals);
    },
    async deleteCardPlannedFile(id: string, cardId: string) {
      db.prepare("DELETE FROM card_planned_file WHERE id = ? AND card_id = ?").run(id, cardId);
    },

    // --- Helpers ---
    async verifyCardInProject(cardId: string, projectId: string) {
      const card = await adapter.getCardById(cardId);
      if (!card) return false;
      const activityId = card.workflow_activity_id as string;
      const act = db.prepare("SELECT workflow_id FROM workflow_activity WHERE id = ?").get(activityId) as { workflow_id: string } | undefined;
      if (!act) return false;
      const wf = db.prepare("SELECT project_id FROM workflow WHERE id = ?").get(act.workflow_id) as { project_id: string } | undefined;
      return wf !== undefined && wf.project_id === projectId;
    },
    async getCardIdsByWorkflow(workflowId: string) {
      const activities = await adapter.getActivitiesByWorkflow(workflowId);
      const ids: string[] = [];
      for (const act of activities) {
        const activityCards = await adapter.getCardsByActivity(act.id as string);
        ids.push(...activityCards.map((c) => c.id as string));
      }
      return ids;
    },
    async getCardIdsByProject(projectId: string) {
      const workflows = await adapter.getWorkflowsByProject(projectId);
      const ids: string[] = [];
      for (const wf of workflows) {
        ids.push(...(await adapter.getCardIdsByWorkflow(wf.id as string)));
      }
      return [...new Set(ids)];
    },

    // --- Orchestration ---
    async getSystemPolicyProfileByProject(projectId: string) {
      const row = db.prepare("SELECT * FROM system_policy_profile WHERE project_id = ?").get(projectId) as DbRow | undefined;
      return row ? parseRow("system_policy_profile", row) : null;
    },
    async insertSystemPolicyProfile(row: DbRow) {
      const r = stringifyRow("system_policy_profile", row);
      db.prepare(
        `INSERT INTO system_policy_profile (id, project_id, required_checks, protected_paths, forbidden_paths, dependency_policy, security_policy, architecture_policy, approval_policy, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        r.id ?? crypto.randomUUID(),
        r.project_id,
        typeof r.required_checks === "string" ? r.required_checks : JSON.stringify(r.required_checks ?? []),
        typeof r.protected_paths === "string" ? r.protected_paths : JSON.stringify(r.protected_paths ?? []),
        typeof r.forbidden_paths === "string" ? r.forbidden_paths : JSON.stringify(r.forbidden_paths ?? []),
        typeof r.dependency_policy === "string" ? r.dependency_policy : JSON.stringify(r.dependency_policy ?? {}),
        typeof r.security_policy === "string" ? r.security_policy : JSON.stringify(r.security_policy ?? {}),
        typeof r.architecture_policy === "string" ? r.architecture_policy : JSON.stringify(r.architecture_policy ?? {}),
        typeof r.approval_policy === "string" ? r.approval_policy : JSON.stringify(r.approval_policy ?? {}),
        (r.updated_at as string) ?? new Date().toISOString()
      );
    },
    async getOrchestrationRun(runId: string) {
      const row = db.prepare("SELECT * FROM orchestration_run WHERE id = ?").get(runId) as DbRow | undefined;
      return row ? parseRow("orchestration_run", row) : null;
    },
    async listOrchestrationRunsByProject(projectId: string, options?: { scope?: "workflow" | "card"; status?: string; limit?: number }) {
      let where = "WHERE project_id = ?";
      const params: unknown[] = [projectId];
      if (options?.scope) {
        where += " AND scope = ?";
        params.push(options.scope);
      }
      if (options?.status) {
        where += " AND status = ?";
        params.push(options.status);
      }
      let sql = `SELECT * FROM orchestration_run ${where} ORDER BY created_at DESC`;
      if (options?.limit) {
        sql += " LIMIT ?";
        params.push(options.limit);
      }
      const rows = db.prepare(sql).all(...params) as DbRow[];
      return rows.map((r) => parseRow("orchestration_run", r));
    },
    async insertOrchestrationRun(row: DbRow) {
      const r = stringifyRow("orchestration_run", row);
      const id = (r.id as string) ?? crypto.randomUUID();
      db.prepare(
        `INSERT INTO orchestration_run (id, project_id, scope, workflow_id, card_id, trigger_type, status, initiated_by, repo_url, base_branch, system_policy_profile_id, system_policy_snapshot, run_input_snapshot, worktree_root, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        r.project_id,
        r.scope,
        r.workflow_id ?? null,
        r.card_id ?? null,
        r.trigger_type,
        r.status ?? "queued",
        r.initiated_by,
        r.repo_url,
        r.base_branch,
        r.system_policy_profile_id,
        typeof r.system_policy_snapshot === "string" ? r.system_policy_snapshot : JSON.stringify(r.system_policy_snapshot ?? {}),
        typeof r.run_input_snapshot === "string" ? r.run_input_snapshot : JSON.stringify(r.run_input_snapshot ?? {}),
        r.worktree_root ?? null,
        (r.created_at as string) ?? new Date().toISOString(),
        (r.updated_at as string) ?? new Date().toISOString()
      );
      return { id, ...r };
    },
    async updateOrchestrationRun(runId: string, updates: DbRow) {
      const allowed = ["status", "started_at", "ended_at", "worktree_root"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(runId);
      db.prepare(`UPDATE orchestration_run SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },
    async getCardAssignmentsByRun(runId: string) {
      const rows = db
        .prepare("SELECT * FROM card_assignment WHERE run_id = ? ORDER BY created_at ASC")
        .all(runId) as DbRow[];
      return rows.map((r) => parseRow("card_assignment", r));
    },
    async getCardAssignment(assignmentId: string) {
      const row = db.prepare("SELECT * FROM card_assignment WHERE id = ?").get(assignmentId) as DbRow | undefined;
      return row ? parseRow("card_assignment", row) : null;
    },
    async updateCardAssignment(assignmentId: string, updates: DbRow) {
      const allowed = ["status"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(assignmentId);
      db.prepare(`UPDATE card_assignment SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },
    async insertCardAssignment(row: DbRow) {
      const r = stringifyRow("card_assignment", row);
      const id = (r.id as string) ?? crypto.randomUUID();
      db.prepare(
        `INSERT INTO card_assignment (id, run_id, card_id, agent_role, agent_profile, feature_branch, worktree_path, allowed_paths, forbidden_paths, assignment_input_snapshot, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        r.run_id,
        r.card_id,
        r.agent_role,
        r.agent_profile,
        r.feature_branch,
        r.worktree_path ?? null,
        typeof r.allowed_paths === "string" ? r.allowed_paths : JSON.stringify(r.allowed_paths ?? []),
        r.forbidden_paths ? (typeof r.forbidden_paths === "string" ? r.forbidden_paths : JSON.stringify(r.forbidden_paths)) : null,
        typeof r.assignment_input_snapshot === "string" ? r.assignment_input_snapshot : JSON.stringify(r.assignment_input_snapshot ?? {}),
        r.status ?? "queued",
        (r.created_at as string) ?? new Date().toISOString(),
        (r.updated_at as string) ?? new Date().toISOString()
      );
      return { id, ...r };
    },
    async getAgentExecutionsByAssignment(assignmentId: string) {
      const rows = db
        .prepare("SELECT * FROM agent_execution WHERE assignment_id = ? ORDER BY started_at DESC")
        .all(assignmentId) as DbRow[];
      return rows;
    },
    async insertAgentExecution(row: DbRow) {
      const id = (row.id as string) ?? crypto.randomUUID();
      db.prepare(
        "INSERT INTO agent_execution (id, assignment_id, status, started_at, ended_at, summary, error) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        row.assignment_id,
        row.status ?? "queued",
        row.started_at ?? null,
        row.ended_at ?? null,
        row.summary ?? null,
        row.error ?? null
      );
      return { id, ...row };
    },
    async updateAgentExecution(executionId: string, updates: DbRow) {
      const allowed = ["status", "started_at", "ended_at", "summary", "error"];
      const set: string[] = [];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      if (set.length === 0) return;
      vals.push(executionId);
      db.prepare(`UPDATE agent_execution SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },
    async getAgentCommitsByAssignment(assignmentId: string) {
      return db
        .prepare("SELECT * FROM agent_commit WHERE assignment_id = ? ORDER BY committed_at DESC")
        .all(assignmentId) as DbRow[];
    },
    async insertAgentCommit(row: DbRow) {
      const id = (row.id as string) ?? crypto.randomUUID();
      db.prepare(
        "INSERT INTO agent_commit (id, assignment_id, sha, branch, message, committed_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, row.assignment_id, row.sha, row.branch, row.message, row.committed_at);
    },
    async getRunChecksByRun(runId: string) {
      return db
        .prepare("SELECT * FROM run_check WHERE run_id = ? ORDER BY executed_at ASC")
        .all(runId) as DbRow[];
    },
    async getRunCheck(checkId: string) {
      const row = db.prepare("SELECT * FROM run_check WHERE id = ?").get(checkId) as DbRow | undefined;
      return row ?? null;
    },
    async insertRunCheck(row: DbRow) {
      const id = (row.id as string) ?? crypto.randomUUID();
      db.prepare(
        "INSERT INTO run_check (id, run_id, check_type, status, output, executed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        row.run_id,
        row.check_type,
        row.status,
        row.output ?? null,
        row.executed_at ?? null,
        (row.created_at as string) ?? new Date().toISOString()
      );
      return { id, ...row };
    },
    async getApprovalRequestsByRun(runId: string) {
      const rows = db
        .prepare("SELECT * FROM approval_request WHERE run_id = ? ORDER BY requested_at DESC")
        .all(runId) as DbRow[];
      return rows;
    },
    async getApprovalRequest(approvalId: string) {
      const row = db.prepare("SELECT * FROM approval_request WHERE id = ?").get(approvalId) as DbRow | undefined;
      return row ?? null;
    },
    async insertApprovalRequest(row: DbRow) {
      const id = (row.id as string) ?? crypto.randomUUID();
      db.prepare(
        "INSERT INTO approval_request (id, run_id, approval_type, status, requested_by, requested_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        row.run_id,
        row.approval_type,
        row.status ?? "pending",
        row.requested_by,
        row.requested_at,
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
      return { id, ...row };
    },
    async updateApprovalRequest(approvalId: string, updates: DbRow) {
      const allowed = ["status", "resolved_by", "resolved_at", "notes"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(approvalId);
      db.prepare(`UPDATE approval_request SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },
    async getPullRequestCandidateByRun(runId: string) {
      const row = db.prepare("SELECT * FROM pull_request_candidate WHERE run_id = ?").get(runId) as DbRow | undefined;
      return row ?? null;
    },
    async getPullRequestCandidate(prId: string) {
      const row = db.prepare("SELECT * FROM pull_request_candidate WHERE id = ?").get(prId) as DbRow | undefined;
      return row ?? null;
    },
    async insertPullRequestCandidate(row: DbRow) {
      const id = (row.id as string) ?? crypto.randomUUID();
      db.prepare(
        "INSERT INTO pull_request_candidate (id, run_id, base_branch, head_branch, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        row.run_id,
        row.base_branch,
        row.head_branch,
        row.title,
        row.description,
        row.status ?? "not_created",
        (row.created_at as string) ?? new Date().toISOString(),
        (row.updated_at as string) ?? new Date().toISOString()
      );
      return { id, ...row };
    },
    async updatePullRequestCandidate(prId: string, updates: DbRow) {
      const allowed = ["status", "pr_url"];
      const set: string[] = ["updated_at = datetime('now')"];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(updates)) {
        if (allowed.includes(k) && v !== undefined) {
          set.push(`${k} = ?`);
          vals.push(v);
        }
      }
      vals.push(prId);
      db.prepare(`UPDATE pull_request_candidate SET ${set.join(", ")} WHERE id = ?`).run(...vals);
    },
    async insertEventLog(row: DbRow) {
      const r = stringifyRow("event_log", row);
      const id = (r.id as string) ?? crypto.randomUUID();
      db.prepare(
        "INSERT INTO event_log (id, project_id, run_id, event_type, actor, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        r.project_id,
        r.run_id ?? null,
        r.event_type,
        r.actor,
        typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload ?? {}),
        (r.created_at as string) ?? new Date().toISOString()
      );
      return { id, ...r };
    },

    // --- Memory (Section 4) ---
    async insertMemoryUnit(row: DbRow) {
      const id = (row.id as string) ?? crypto.randomUUID();
      db.prepare(
        "INSERT INTO memory_unit (id, content_type, mime_type, title, content_text, link_url, status, embedding_ref, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        row.content_type,
        row.mime_type ?? null,
        row.title ?? null,
        row.content_text ?? null,
        row.link_url ?? null,
        row.status ?? "draft",
        row.embedding_ref,
        (row.updated_at as string) ?? new Date().toISOString()
      );
      return { id, ...row };
    },
    async getMemoryUnitsByIds(ids: string[]) {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => "?").join(",");
      const rows = db.prepare(`SELECT * FROM memory_unit WHERE id IN (${placeholders})`).all(...ids) as DbRow[];
      return rows;
    },
    async insertMemoryUnitRelation(row: DbRow) {
      db.prepare(
        "INSERT OR IGNORE INTO memory_unit_relation (memory_unit_id, entity_type, entity_id, relation_role) VALUES (?, ?, ?, ?)"
      ).run(
        row.memory_unit_id,
        row.entity_type,
        row.entity_id,
        row.relation_role ?? null
      );
    },
    async getMemoryUnitRelationsByEntity(entityType: string, entityId: string) {
      const rows = db
        .prepare("SELECT * FROM memory_unit_relation WHERE entity_type = ? AND entity_id = ?")
        .all(entityType, entityId) as DbRow[];
      return rows;
    },
    async insertMemoryRetrievalLog(row: DbRow) {
      const id = (row.id as string) ?? crypto.randomUUID();
      const resultIds =
        typeof row.result_memory_ids === "string"
          ? row.result_memory_ids
          : JSON.stringify(Array.isArray(row.result_memory_ids) ? row.result_memory_ids : []);
      db.prepare(
        "INSERT INTO memory_retrieval_log (id, query_text, scope_entity_type, scope_entity_id, result_memory_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        id,
        row.query_text,
        row.scope_entity_type,
        row.scope_entity_id,
        resultIds,
        (row.created_at as string) ?? new Date().toISOString()
      );
      return { id, ...row };
    },
  };

  return adapter;
}
