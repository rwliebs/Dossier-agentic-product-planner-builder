"use client";

import { useState, useCallback, useEffect } from "react";

export interface OrchestrationRun {
  id: string;
  project_id: string;
  scope: "workflow" | "card";
  workflow_id: string | null;
  card_id: string | null;
  trigger_type: string;
  status: string;
  initiated_by: string;
  repo_url: string;
  base_branch: string;
  created_at?: string;
  started_at?: string;
  ended_at?: string;
}

export interface UseOrchestrationRunsResult {
  data: OrchestrationRun[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOrchestrationRuns(
  projectId: string | undefined,
  options?: { scope?: "workflow" | "card"; status?: string; limit?: number }
): UseOrchestrationRunsResult {
  const [data, setData] = useState<OrchestrationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) {
      setData([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.scope) params.set("scope", options.scope);
      if (options?.status) params.set("status", options.status);
      if (options?.limit) params.set("limit", String(options.limit));
      const qs = params.toString();
      const url = `/api/projects/${projectId}/orchestration/runs${qs ? `?${qs}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        setError(res.status === 404 ? "Not found" : "Failed to load runs");
        setData([]);
        return;
      }
      const json = await res.json();
      setData(json.runs ?? []);
    } catch {
      setError("Failed to load runs");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, options?.scope, options?.status, options?.limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
