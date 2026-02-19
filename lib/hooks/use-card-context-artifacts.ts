"use client";

import { useState, useCallback, useEffect } from "react";
import type { ContextArtifact } from "@/lib/types/ui";

export interface UseCardContextArtifactsResult {
  data: ContextArtifact[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export function useCardContextArtifacts(
  projectId: string | undefined,
  cardId: string | undefined
): UseCardContextArtifactsResult {
  const [data, setData] = useState<ContextArtifact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId || !cardId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await fetchJson<ContextArtifact[]>(
        `/api/projects/${projectId}/cards/${cardId}/context-artifacts`
      );
      setData(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load context artifacts");
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
