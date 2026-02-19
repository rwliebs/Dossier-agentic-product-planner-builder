"use client";

import { useState, useCallback, useEffect } from "react";
import type { ContextArtifact } from "@/lib/types/ui";

export interface DocsIndexEntry {
  id: string;
  path: string;
  tags?: string[];
}

export interface UseDocsIndexResult {
  data: DocsIndexEntry[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDocsIndex(): UseDocsIndexResult {
  const [data, setData] = useState<DocsIndexEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/docs");
      if (!res.ok) {
        setError("Failed to load docs index");
        setData(null);
        return;
      }
      const json = await res.json();
      setData(Array.isArray(json.documents) ? json.documents : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load docs index");
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

const REF_PROJECT_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

/** Convert docs index entry to ContextArtifact-like shape for display; content loaded on demand */
export function docsEntryToArtifact(entry: DocsIndexEntry): ContextArtifact & { _refPath?: string } {
  const baseName = entry.path.replace(/\.md$/, "").split(/[/\\]/).pop() ?? entry.id;
  const title = baseName.replace(/-reference$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    id: `ref:${entry.id}`,
    project_id: REF_PROJECT_PLACEHOLDER,
    name: entry.id.replace(/^doc\./, "").replace(/-/g, " "),
    type: "doc",
    title,
    content: null,
    _refPath: entry.path,
  };
}

/** Fetch content for a reference doc by path */
export async function fetchRefDocContent(path: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/docs?path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.content ?? null;
  } catch {
    return null;
  }
}
