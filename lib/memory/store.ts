/**
 * MemoryStore: abstraction over memory content (DbAdapter) + vectors (RuVector).
 * Real adapter: DbAdapter for content, RuVector for embeddings/search.
 * Mock adapter: returns empty results for tests and when RuVector unavailable.
 *
 * @see REMAINING_WORK_PLAN.md §4 Memory Plane
 * @see DUAL_LLM_INTEGRATION_STRATEGY §Memory and Retrieval
 */

import type { DbAdapter } from "@/lib/db/adapter";
import { getRuvectorClient } from "@/lib/ruvector/client";
import { embedText } from "@/lib/memory/embedding";

/** Memory unit content for retrieval (content from SQLite, ranking from RuVector) */
export interface MemoryUnitContent {
  id: string;
  content_type: "inline" | "link";
  content_text: string | null;
  link_url: string | null;
  title: string | null;
  mime_type: string | null;
}

/** Input for semantic search (card/project context) */
export interface RetrievalScope {
  cardId: string;
  projectId: string;
  workflowId?: string | null;
  /** Optional: limit to card-scoped first, then project-scoped */
  preferCardScoped?: boolean;
}

export interface MemoryStore {
  /**
   * Semantic search: returns memory unit IDs ranked by relevance.
   * Card-scoped approved first, then project-scoped. Never rejected.
   */
  search(
    queryText: string,
    scope: RetrievalScope,
    options?: { limit?: number }
  ): Promise<string[]>;

  /**
   * Fetch full content for given memory unit IDs.
   * Preserves order from search when possible.
   */
  getContentByIds(ids: string[]): Promise<MemoryUnitContent[]>;

  /**
   * Retrieve memory for a card (convenience: search + getContent).
   * Returns content strings suitable for swarm context injection.
   */
  retrieveForCard(
    cardId: string,
    projectId: string,
    contextSummary: string,
    options?: { limit?: number }
  ): Promise<string[]>;

  /**
   * Log a retrieval for observability.
   */
  logRetrieval(
    queryText: string,
    scopeEntityType: string,
    scopeEntityId: string,
    resultIds: string[]
  ): Promise<void>;
}

/**
 * Mock MemoryStore: returns empty results.
 * Use when RuVector unavailable or in tests.
 */
export function createMockMemoryStore(): MemoryStore {
  return {
    async search() {
      return [];
    },
    async getContentByIds() {
      return [];
    },
    async retrieveForCard() {
      return [];
    },
    async logRetrieval() {
      // no-op
    },
  };
}

/**
 * Real MemoryStore: uses DbAdapter + RuVector.
 * Returns mock if RuVector unavailable (caller can also check isRuvectorAvailable).
 */
export function createMemoryStore(db: DbAdapter, ruvectorAvailable: boolean): MemoryStore {
  if (!ruvectorAvailable) return createMockMemoryStore();

  const rv = getRuvectorClient();
  if (!rv) return createMockMemoryStore();

  return {
    async search(queryText: string, scope: RetrievalScope, options?: { limit?: number }) {
      const limit = options?.limit ?? 10;
      const vec = embedText(queryText);
      const raw = await rv.search({ vector: vec, k: Math.min(50, limit * 5) });
      const ids = raw.map((r) => r.id);
      if (ids.length === 0) return [];

      const [cardRels, projectRels] = await Promise.all([
        db.getMemoryUnitRelationsByEntity("card", scope.cardId),
        db.getMemoryUnitRelationsByEntity("project", scope.projectId),
      ]);
      const cardScoped = new Set(cardRels.map((r) => r.memory_unit_id as string));
      const projectScoped = new Set(projectRels.map((r) => r.memory_unit_id as string));

      const units = await db.getMemoryUnitsByIds(ids);
      const approved = units.filter((u) => u.status === "approved");
      const inScope = approved.filter(
        (u) => cardScoped.has(u.id as string) || projectScoped.has(u.id as string)
      );
      const cardFirst = [...inScope].sort((a, b) => {
        const aCard = cardScoped.has(a.id as string) ? 1 : 0;
        const bCard = cardScoped.has(b.id as string) ? 1 : 0;
        if (bCard !== aCard) return bCard - aCard;
        return ids.indexOf(a.id as string) - ids.indexOf(b.id as string);
      });
      return cardFirst.slice(0, limit).map((u) => u.id as string);
    },

    async getContentByIds(ids: string[]) {
      if (ids.length === 0) return [];
      const rows = await db.getMemoryUnitsByIds(ids);
      const byId = new Map(rows.map((r) => [r.id as string, r]));
      return ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((r) => ({
          id: r!.id as string,
          content_type: r!.content_type as "inline" | "link",
          content_text: r!.content_text as string | null,
          link_url: r!.link_url as string | null,
          title: r!.title as string | null,
          mime_type: r!.mime_type as string | null,
        }));
    },

    async retrieveForCard(
      cardId: string,
      projectId: string,
      contextSummary: string,
      options?: { limit?: number }
    ) {
      const ids = await this.search(
        contextSummary,
        { cardId, projectId, preferCardScoped: true },
        options
      );
      const content = await this.getContentByIds(ids);
      const strings: string[] = [];
      for (const c of content) {
        if (c.content_type === "inline" && c.content_text) strings.push(c.content_text);
        else if (c.content_type === "link" && c.link_url)
          strings.push(c.title ? `${c.title}: ${c.link_url}` : c.link_url);
      }
      await this.logRetrieval(contextSummary, "card", cardId, ids);
      return strings;
    },

    async logRetrieval(
      queryText: string,
      scopeEntityType: string,
      scopeEntityId: string,
      resultIds: string[]
    ) {
      await db.insertMemoryRetrievalLog({
        query_text: queryText,
        scope_entity_type: scopeEntityType,
        scope_entity_id: scopeEntityId,
        result_memory_ids: resultIds,
      });
    },
  };
}
