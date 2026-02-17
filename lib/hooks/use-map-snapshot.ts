"use client";

import { useState, useCallback, useEffect } from "react";
import type { MapSnapshot } from "@/lib/types/ui";

export interface UseMapSnapshotResult {
  data: MapSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useMapSnapshot(projectId: string | undefined): UseMapSnapshotResult {
  const [data, setData] = useState<MapSnapshot | null>(null);
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
      const res = await fetch(`/api/projects/${projectId}/map`);
      if (!res.ok) {
        setError(res.status === 404 ? "Project not found" : "Failed to load map");
        setData(null);
        return;
      }
      const snapshot: MapSnapshot = await res.json();
      setData(snapshot);
    } catch {
      setError("Failed to load map");
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
