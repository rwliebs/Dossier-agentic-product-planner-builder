"use client";

import { useState, useCallback, useEffect } from "react";
import type { ContextArtifact } from "@/lib/types/ui";

export interface UseArtifactsResult {
  data: ContextArtifact[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useArtifacts(
  projectId: string | undefined
): UseArtifactsResult {
  const [data, setData] = useState<ContextArtifact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/artifacts`);
      if (!res.ok) {
        setError(res.status === 404 ? "Project not found" : "Failed to load artifacts");
        setData(null);
        return;
      }
      const list = await res.json();
      setData(Array.isArray(list) ? list : []);
    } catch {
      setError("Failed to load artifacts");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
