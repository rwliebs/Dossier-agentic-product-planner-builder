"use client";

import { useState, useCallback, useEffect } from "react";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
}

export interface UseProjectFilesResult {
  data: FileNode[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useProjectFiles(
  projectId: string | undefined
): UseProjectFilesResult {
  const [data, setData] = useState<FileNode[] | null>(null);
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
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (!res.ok) {
        setError(res.status === 404 ? "Project not found" : "Failed to load files");
        setData(null);
        return;
      }
      const tree = await res.json();
      setData(Array.isArray(tree) ? tree : []);
    } catch {
      setError("Failed to load files");
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
