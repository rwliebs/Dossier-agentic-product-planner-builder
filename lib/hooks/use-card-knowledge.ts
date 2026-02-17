"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  CardRequirement,
  CardKnownFact,
  CardAssumption,
  CardQuestion,
} from "@/lib/types/ui";

export interface CardKnowledge {
  requirements: CardRequirement[];
  facts: CardKnownFact[];
  assumptions: CardAssumption[];
  questions: CardQuestion[];
}

export interface UseCardKnowledgeResult {
  data: CardKnowledge | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export function useCardKnowledge(
  projectId: string | undefined,
  cardId: string | undefined
): UseCardKnowledgeResult {
  const [data, setData] = useState<CardKnowledge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId || !cardId) {
      setData(null);
      setError(null);
      return;
    }
    const base = `/api/projects/${projectId}/cards/${cardId}`;
    setLoading(true);
    setError(null);
    try {
      const [requirements, facts, assumptions, questions] = await Promise.all([
        fetchJson<CardRequirement[]>(`${base}/requirements`),
        fetchJson<CardKnownFact[]>(`${base}/facts`),
        fetchJson<CardAssumption[]>(`${base}/assumptions`),
        fetchJson<CardQuestion[]>(`${base}/questions`),
      ]);
      setData({ requirements, facts, assumptions, questions });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load knowledge");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, cardId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
