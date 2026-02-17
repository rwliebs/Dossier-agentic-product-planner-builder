"use client";

import { useState, useCallback, useEffect } from "react";

export interface CardAssignment {
  id: string;
  run_id: string;
  card_id: string;
  agent_role: string;
  agent_profile: string;
  feature_branch: string;
  status: string;
}

export interface RunCheck {
  id: string;
  run_id: string;
  check_type: string;
  status: string;
  output?: string | null;
}

export interface ApprovalRequest {
  id: string;
  run_id: string;
  approval_type: string;
  status: string;
  requested_by: string;
}

export interface RunDetail {
  run: {
    id: string;
    status: string;
    scope: string;
    trigger_type: string;
    created_at?: string;
  } & Record<string, unknown>;
  assignments: CardAssignment[];
  checks: RunCheck[];
  approvals: ApprovalRequest[];
}

export interface UseRunDetailResult {
  data: RunDetail | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useRunDetail(
  projectId: string | undefined,
  runId: string | undefined
): UseRunDetailResult {
  const [data, setData] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId || !runId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [runRes, assignRes, checksRes, approvalsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/orchestration/runs/${runId}`),
        fetch(`/api/projects/${projectId}/orchestration/runs/${runId}/assignments`),
        fetch(`/api/projects/${projectId}/orchestration/runs/${runId}/checks`),
        fetch(`/api/projects/${projectId}/orchestration/approvals?run_id=${runId}`),
      ]);

      if (!runRes.ok) {
        setError("Run not found");
        setData(null);
        return;
      }

      const runJson = await runRes.json();
      const assignJson = assignRes.ok ? await assignRes.json() : { assignments: [] };
      const checksJson = checksRes.ok ? await checksRes.json() : { checks: [] };
      const approvalsJson = approvalsRes.ok ? await approvalsRes.json() : { approvals: [] };

      setData({
        run: runJson.run,
        assignments: assignJson.assignments ?? [],
        checks: checksJson.checks ?? [],
        approvals: approvalsJson.approvals ?? [],
      });
    } catch {
      setError("Failed to load run detail");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, runId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
