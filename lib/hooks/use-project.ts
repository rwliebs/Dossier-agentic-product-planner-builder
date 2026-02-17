"use client";

import { useState, useCallback, useEffect } from "react";
import type { Project } from "@/lib/types/ui";

export interface UseProjectResult {
  data: Project | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useProject(projectId: string | undefined): UseProjectResult {
  const [data, setData] = useState<Project | null>(null);
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
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        setError(res.status === 404 ? "Project not found" : "Failed to load project");
        setData(null);
        return;
      }
      const project: Project = await res.json();
      setData(project);
    } catch {
      setError("Failed to load project");
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
