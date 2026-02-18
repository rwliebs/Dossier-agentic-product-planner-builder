/**
 * Memory ingestion pipeline (M4).
 * Converts card + context artifacts + approved knowledge to MemoryUnit entries.
 * Generates embedding via local RuVector, saves content to DbAdapter, vector to RuVector.
 *
 * @see REMAINING_WORK_PLAN.md §4 M4
 * @see docs/SECTION_4_MEMORY_COORDINATION_PROMPT.md
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { getRuvectorClient } from "@/lib/ruvector/client";
import { embedText } from "./embedding";
import {
  getCardById,
  getCardRequirements,
  getCardFacts,
  getCardAssumptions,
  getCardQuestions,
  getCardContextArtifacts,
  getArtifactById,
} from "@/lib/supabase/queries";

export interface IngestScope {
  cardId: string;
  projectId: string;
  workflowId?: string | null;
  activityId?: string | null;
  stepId?: string | null;
}

export interface IngestContentInput {
  contentText: string;
  contentType?: "inline" | "link";
  title?: string | null;
  linkUrl?: string | null;
  mimeType?: string | null;
}

/**
 * Ingest a single memory unit. No-op if RuVector unavailable.
 * Saves content to DbAdapter, vector to RuVector, relations for scope.
 */
export async function ingestMemoryUnit(
  db: DbAdapter,
  input: IngestContentInput,
  scope: IngestScope
): Promise<string | null> {
  const rv = getRuvectorClient();
  if (!rv) return null;

  const contentText = input.contentText?.trim();
  if (!contentText && input.contentType !== "link") return null;

  const contentType = input.contentType ?? "inline";
  const textForEmbedding =
    contentType === "inline"
      ? contentText
      : (input.title ? `${input.title}: ` : "") + (input.linkUrl ?? "");

  const vec = await embedText(textForEmbedding);
  const memoryUnitId = crypto.randomUUID();

  try {
    await rv.insert({ id: memoryUnitId, vector: vec });
  } catch {
    return null;
  }

  const row = {
    id: memoryUnitId,
    content_type: contentType,
    mime_type: input.mimeType ?? null,
    title: input.title ?? null,
    content_text: contentType === "inline" ? contentText : null,
    link_url: contentType === "link" ? input.linkUrl : null,
    status: "approved",
    embedding_ref: memoryUnitId,
    updated_at: new Date().toISOString(),
  };

  await db.insertMemoryUnit(row);

  const relations: Array<{ entity_type: string; entity_id: string; role?: string }> = [
    { entity_type: "card", entity_id: scope.cardId, role: "source" },
    { entity_type: "project", entity_id: scope.projectId, role: "supports" },
  ];
  if (scope.workflowId) {
    relations.push({ entity_type: "workflow", entity_id: scope.workflowId, role: "supports" });
  }
  if (scope.activityId) {
    relations.push({ entity_type: "activity", entity_id: scope.activityId, role: "supports" });
  }
  if (scope.stepId) {
    relations.push({ entity_type: "step", entity_id: scope.stepId, role: "supports" });
  }

  for (const r of relations) {
    await db.insertMemoryUnitRelation({
      memory_unit_id: memoryUnitId,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      relation_role: r.role ?? null,
    });
  }

  return memoryUnitId;
}

/**
 * Ingest full card context: card + linked artifacts + approved knowledge.
 * No-op if RuVector unavailable. Uses DbAdapter only (no Supabase).
 */
export async function ingestCardContext(
  db: DbAdapter,
  cardId: string,
  projectId: string,
  options?: { workflowId?: string | null; activityId?: string | null; stepId?: string | null }
): Promise<number> {
  const rv = getRuvectorClient();
  if (!rv) return 0;

  const card = await getCardById(db, cardId);
  if (!card) return 0;

  const inProject = await db.verifyCardInProject(cardId, projectId);
  if (!inProject) return 0;

  const scope: IngestScope = {
    cardId,
    projectId,
    workflowId: options?.workflowId ?? null,
    activityId: options?.activityId ?? null,
    stepId: options?.stepId ?? null,
  };

  let count = 0;

  const title = (card as { title?: string }).title ?? "";
  const description = (card as { description?: string }).description ?? "";
  const cardSummary = [title, description].filter(Boolean).join("\n\n");
  if (cardSummary) {
    const id = await ingestMemoryUnit(
      db,
      { contentText: cardSummary, title: title || "Card" },
      scope
    );
    if (id) count++;
  }

  const [requirements, facts, assumptions, questions] = await Promise.all([
    getCardRequirements(db, cardId),
    getCardFacts(db, cardId),
    getCardAssumptions(db, cardId),
    getCardQuestions(db, cardId),
  ]);

  const approved = (items: Array<{ status?: string; text?: string }>) =>
    items.filter((i) => i.status === "approved");

  for (const r of approved(requirements)) {
    const text = (r as { text?: string }).text;
    if (text) {
      const id = await ingestMemoryUnit(db, { contentText: text, title: "Requirement" }, scope);
      if (id) count++;
    }
  }
  for (const f of approved(facts)) {
    const text = (f as { text?: string }).text;
    if (text) {
      const id = await ingestMemoryUnit(db, { contentText: text, title: "Fact" }, scope);
      if (id) count++;
    }
  }
  for (const a of approved(assumptions)) {
    const text = (a as { text?: string }).text;
    if (text) {
      const id = await ingestMemoryUnit(db, { contentText: text, title: "Assumption" }, scope);
      if (id) count++;
    }
  }
  for (const q of approved(questions)) {
    const text = (q as { text?: string }).text;
    if (text) {
      const id = await ingestMemoryUnit(db, { contentText: text, title: "Question" }, scope);
      if (id) count++;
    }
  }

  const contextLinks = await getCardContextArtifacts(db, cardId);
  for (const link of contextLinks) {
    const artifactId = (link as { context_artifact_id?: string }).context_artifact_id;
    if (!artifactId) continue;
    const artifact = await getArtifactById(db, artifactId);
    if (!artifact) continue;
    const art = artifact as { title?: string; content?: string; uri?: string; artifact_type?: string };
    const content = art.content ?? art.uri ?? "";
    const title = art.title ?? "Context artifact";
    if (content) {
      const id = await ingestMemoryUnit(
        db,
        {
          contentText: content,
          title,
          contentType: art.uri ? "link" : "inline",
          linkUrl: art.uri ?? null,
        },
        scope
      );
      if (id) count++;
    }
  }

  return count;
}
