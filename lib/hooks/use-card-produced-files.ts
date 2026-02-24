"use client";

import { useState, useCallback, useEffect } from "react";

export interface ProducedFile {
  path: string;
  status: "added" | "modified";
}

export interface UseCardProducedFilesResult {
  data: ProducedFile[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Fetches files added or modified by the execution agent for a card.
 * Only fetches when enabled (e.g. when card is expanded and build_state is completed).
 */
export function useCardProducedFiles(
  projectId: string | undefined,
  cardId: string | undefined,
  enabled: boolean
): UseCardProducedFilesResult {
  const [data, setData] = useState<ProducedFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId || !cardId || !enabled) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/produced-files`
      );
      if (!res.ok) {
        setError(res.status === 404 ? "Not found" : "Failed to load");
        setData(null);
        return;
      }
      const list = await res.json();
      setData(Array.isArray(list) ? list : []);
    } catch {
      setError("Failed to load produced files");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, cardId, enabled]);

  useEffect(() => {
    if (enabled) {
      refetch();
    } else {
      setData(null);
      setError(null);
    }
  }, [refetch, enabled]);

  return { data, loading, error, refetch };
}
