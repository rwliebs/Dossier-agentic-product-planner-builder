"use client";

import { useState, useCallback } from "react";

export interface CreateRunInput {
  scope: "workflow" | "card";
  workflow_id?: string | null;
  card_id?: string | null;
  trigger_type?: "card" | "workflow" | "manual";
  repo_url: string;
  base_branch: string;
  run_input_snapshot: Record<string, unknown>;
}

export interface UseCreateRunResult {
  createRun: (input: CreateRunInput) => Promise<{ runId?: string; error?: string }>;
  loading: boolean;
  error: string | null;
}

export function useCreateRun(projectId: string | undefined): UseCreateRunResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRun = useCallback(
    async (
      input: CreateRunInput
    ): Promise<{ runId?: string; error?: string }> => {
      if (!projectId) {
        return { error: "No project selected" };
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/orchestration/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: input.scope,
            workflow_id: input.workflow_id ?? null,
            card_id: input.card_id ?? null,
            trigger_type: input.trigger_type ?? "manual",
            initiated_by: "user",
            repo_url: input.repo_url,
            base_branch: input.base_branch,
            run_input_snapshot: input.run_input_snapshot,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            data.validation ?? data.message ?? "Failed to create run";
          setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
          return { error: Array.isArray(msg) ? msg.join(", ") : String(msg) };
        }
        return { runId: data.runId };
      } catch {
        setError("Failed to create run");
        return { error: "Failed to create run" };
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  return { createRun, loading, error };
}
