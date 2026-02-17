"use client";

import { useState, useCallback, useEffect } from "react";
import type { CardPlannedFile } from "@/lib/types/ui";

export interface UseCardPlannedFilesResult {
  data: CardPlannedFile[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCardPlannedFiles(
  projectId: string | undefined,
  cardId: string | undefined
): UseCardPlannedFilesResult {
  const [data, setData] = useState<CardPlannedFile[] | null>(null);
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
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/planned-files`
      );
      if (!res.ok) {
        setError(res.status === 404 ? "Not found" : "Failed to load");
        setData(null);
        return;
      }
      const list = await res.json();
      setData(Array.isArray(list) ? list : []);
    } catch {
      setError("Failed to load planned files");
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
