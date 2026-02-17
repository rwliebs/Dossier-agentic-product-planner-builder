"use client";

import { useState, useCallback, useEffect } from "react";
import type { Project } from "@/lib/types/ui";

export interface UseProjectsResult {
  data: Project[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useProjects(): UseProjectsResult {
  const [data, setData] = useState<Project[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        setError("Failed to load projects");
        setData(null);
        return;
      }
      const list: Project[] = await res.json();
      setData(list);
    } catch {
      setError("Failed to load projects");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
