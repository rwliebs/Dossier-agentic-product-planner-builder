"use client";

import { useState, useCallback, useEffect } from "react";

export interface FileNode {
  name: string;
  type: "file" | "folder";
  path: string;
  status?: "added" | "modified" | "deleted" | "unchanged";
  children?: FileNode[];
}

export type ProjectFilesSource = "planned" | "repo";

export interface UseProjectFilesResult {
  data: FileNode[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Fetch file content (repo source only). Path with or without leading slash. */
  fetchFileContent?: (path: string) => Promise<string | null>;
  /** Fetch file diff (repo source only). Path with or without leading slash. */
  fetchFileDiff?: (path: string) => Promise<string | null>;
}

export function useProjectFiles(
  projectId: string | undefined,
  source: ProjectFilesSource = "planned"
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
      const url =
        source === "repo"
          ? `/api/projects/${projectId}/files?source=repo`
          : `/api/projects/${projectId}/files`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          body?.error ??
          (res.status === 404 ? "Project not found" : "Failed to load files");
        setError(msg);
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
  }, [projectId, source]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const fetchFileContent = useCallback(
    async (path: string): Promise<string | null> => {
      if (!projectId || source !== "repo") return null;
      try {
        const p = path.replace(/^\/+/, "");
        const res = await fetch(
          `/api/projects/${projectId}/files?source=repo&content=1&path=${encodeURIComponent(p)}`
        );
        if (!res.ok) return null;
        return res.text();
      } catch {
        return null;
      }
    },
    [projectId, source]
  );

  const fetchFileDiff = useCallback(
    async (path: string): Promise<string | null> => {
      if (!projectId || source !== "repo") return null;
      try {
        const p = path.replace(/^\/+/, "");
        const res = await fetch(
          `/api/projects/${projectId}/files?source=repo&diff=1&path=${encodeURIComponent(p)}`
        );
        if (!res.ok) return null;
        return res.text();
      } catch {
        return null;
      }
    },
    [projectId, source]
  );

  return {
    data,
    loading,
    error,
    refetch,
    fetchFileContent: source === "repo" ? fetchFileContent : undefined,
    fetchFileDiff: source === "repo" ? fetchFileDiff : undefined,
  };
}
