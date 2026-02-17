"use client";

import { useState, useCallback } from "react";

export interface SubmitActionItem {
  id?: string;
  action_type: string;
  target_ref?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface SubmitActionsBody {
  actions: SubmitActionItem[];
}

export interface SubmitActionResult {
  applied: number;
  results: Array<{
    id: string;
    action_type: string;
    validation_status: "accepted" | "rejected";
    rejection_reason?: string;
    applied_at?: string;
  }>;
}

export interface UseSubmitActionResult {
  submit: (body: SubmitActionsBody) => Promise<SubmitActionResult | null>;
  loading: boolean;
  error: string | null;
}

export function useSubmitAction(projectId: string | undefined): UseSubmitActionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (body: SubmitActionsBody): Promise<SubmitActionResult | null> => {
      if (!projectId) {
        setError("No project selected");
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.message ?? "Action rejected");
          return null;
        }
        return data as SubmitActionResult;
      } catch {
        setError("Failed to submit action");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  return { submit, loading, error };
}
