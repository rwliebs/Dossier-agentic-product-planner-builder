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
  ) => Promise<{
    runId?: string;
    error?: string;
    message?: string;
    outcomeType?: "success" | "error" | "decision_required";
  }>;
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
    ): Promise<{
      runId?: string;
      error?: string;
      message?: string;
      outcomeType?: "success" | "error" | "decision_required";
    }> => {
      if (!projectId) {
        return { error: "No project selected", outcomeType: "error" };
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
          const details = data.details as Record<string, string[]> | undefined;
          const parts = details
            ? Object.entries(details).flatMap(([k, v]) =>
                Array.isArray(v) ? v.map((m) => (k === "body" ? m : `${k}: ${m}`)) : []
              )
            : [];
          const msg =
            parts.length > 0
              ? parts.join("; ")
              : data.message ?? "Failed to trigger build";
          setError(msg);
          return {
            error: msg,
            message: data.message ?? msg,
            outcomeType:
              data.outcome_type === "decision_required"
                ? "decision_required"
                : "error",
          };
        }
        return {
          runId: data.runId,
          message: data.message ?? "Build started",
          outcomeType:
            data.outcome_type === "decision_required"
              ? "decision_required"
              : data.outcome_type === "error"
                ? "error"
                : "success",
        };
      } catch {
        setError("Failed to trigger build");
        return {
          error: "Failed to trigger build",
          outcomeType: "error",
        };
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  return { triggerBuild, loading, error };
}
