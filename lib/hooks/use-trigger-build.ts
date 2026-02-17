"use client";

import { useState, useCallback } from "react";

export interface TriggerBuildInput {
  scope: "workflow" | "card";
  workflow_id?: string | null;
  card_id?: string | null;
}

export interface UseTriggerBuildResult {
  triggerBuild: (
    input: TriggerBuildInput
  ) => Promise<{ runId?: string; error?: string }>;
  loading: boolean;
  error: string | null;
}

export function useTriggerBuild(
  projectId: string | undefined
): UseTriggerBuildResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerBuild = useCallback(
    async (
      input: TriggerBuildInput
    ): Promise<{ runId?: string; error?: string }> => {
      if (!projectId) {
        return { error: "No project selected" };
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/orchestration/build`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scope: input.scope,
              workflow_id: input.workflow_id ?? null,
              card_id: input.card_id ?? null,
              trigger_type:
                input.scope === "card" ? "card" : "workflow",
              initiated_by: "user",
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            data.validation ?? data.message ?? "Failed to trigger build";
          setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
          return {
            error: Array.isArray(msg) ? msg.join(", ") : String(msg),
          };
        }
        return { runId: data.runId };
      } catch {
        setError("Failed to trigger build");
        return { error: "Failed to trigger build" };
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  return { triggerBuild, loading, error };
}
