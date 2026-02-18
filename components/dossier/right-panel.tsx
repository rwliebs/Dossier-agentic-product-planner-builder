"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  Folder,
  FolderOpen,
  Terminal,
  FileText,
  GitBranch,
  X,
  Copy,
  ExternalLink,
  Play,
} from "lucide-react";
import type { ContextArtifact } from "@/lib/types/ui";
import type { CodeFileForPanel } from "./implementation-card";
import { useProjectFiles, type FileNode } from "@/lib/hooks/use-project-files";
import { useOrchestrationRuns } from "@/lib/hooks/use-orchestration-runs";
import { useRunDetail } from "@/lib/hooks/use-run-detail";
import { RunStatusSkeleton } from "./run-status-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeDoc: ContextArtifact | null;
  activeFile: CodeFileForPanel | null;
  activeTab: "files" | "terminal" | "docs" | "chat" | "runs";
  onTabChange: (tab: "files" | "terminal" | "docs" | "chat" | "runs") => void;
  /** When set, files tab shows live project file tree from planned files */
  projectId?: string;
}

function FileTreeNode({
  node,
  depth = 0,
}: {
  node: FileNode;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  return (
    <div>
      <button
        type="button"
        onClick={() => node.type === "folder" && setIsOpen(!isOpen)}
        className="w-full flex items-center gap-1.5 py-1 px-2 hover:bg-accent/50 text-left group"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === "folder" ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
          </>
        )}
        <span className="text-xs text-foreground truncate">{node.name}</span>
      </button>
      {node.type === "folder" && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

const statusBadgeClass: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

interface RunDetailPanelProps {
  runId: string;
  projectId?: string;
  runDetail: {
    run: { status: string };
    assignments: Array<{ id: string; card_id: string; status: string }>;
    checks: Array<{ check_type: string; status: string }>;
    approvals: Array<{ approval_type: string; status: string }>;
  } | null;
  detailLoading: boolean;
  onApprove: (runId: string, type: "create_pr" | "merge_pr") => void;
  onRetry: (runId: string) => void;
}

function RunDetailPanel({
  runId,
  projectId,
  runDetail,
  detailLoading,
  onApprove,
  onRetry,
}: RunDetailPanelProps) {
  const isForThisRun = runDetail?.run && (runDetail.run as { id?: string }).id === runId;
  if (detailLoading || !runDetail || !isForThisRun) {
    return (
      <div className="mt-2 pt-2 border-t border-border">
        <RunStatusSkeleton />
      </div>
    );
  }
  const { run, assignments, checks, approvals } = runDetail;
  const allChecksPassed =
    checks.length > 0 && checks.every((c) => c.status === "passed");
  const hasCreatePrApproval = approvals.some(
    (a) => a.approval_type === "create_pr" && a.status !== "rejected"
  );
  const hasMergeApproval = approvals.some(
    (a) => a.approval_type === "merge_pr" && a.status !== "rejected"
  );

  return (
    <div className="mt-2 pt-2 border-t border-border space-y-2">
      <div className="text-[10px]">
        <div className="font-mono text-muted-foreground mb-1">Assignments</div>
        {assignments.map((a) => (
          <div key={a.id} className="flex gap-2">
            <span className="text-muted-foreground">{a.card_id.slice(0, 8)}…</span>
            <span className={statusBadgeClass[a.status] ?? ""}>{a.status}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px]">
        <div className="font-mono text-muted-foreground mb-1">Checks</div>
        {checks.map((c) => (
          <div key={c.check_type} className="flex gap-2">
            <span>{c.check_type}</span>
            <span className={statusBadgeClass[c.status] ?? ""}>{c.status}</span>
          </div>
        ))}
      </div>
      {projectId && (
        <div className="flex flex-wrap gap-1">
          {run.status === "failed" && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => onRetry(runId)}
            >
              Retry
            </Button>
          )}
          {allChecksPassed && !hasCreatePrApproval && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => onApprove(runId, "create_pr")}
            >
              Approve PR Creation
            </Button>
          )}
          {allChecksPassed && hasCreatePrApproval && !hasMergeApproval && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => onApprove(runId, "merge_pr")}
            >
              Approve Merge
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function RightPanel({
  isOpen,
  onClose,
  activeDoc,
  activeFile,
  activeTab,
  onTabChange,
  projectId,
}: RightPanelProps) {
  const { data: projectFiles, loading: filesLoading } = useProjectFiles(projectId);
  const { data: runs, loading: runsLoading } = useOrchestrationRuns(projectId, { limit: 20 });
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const { data: runDetail, loading: detailLoading, refetch: refetchDetail } = useRunDetail(
    projectId,
    expandedRunId ?? undefined
  );
  const fileTree = projectFiles && projectFiles.length > 0 ? projectFiles : [];

  const handleApprove = useCallback(
    async (runId: string, approvalType: "create_pr" | "merge_pr") => {
      if (!projectId) return;
      try {
        const res = await fetch(`/api/projects/${projectId}/orchestration/approvals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ run_id: runId, approval_type: approvalType, requested_by: "user" }),
        });
        if (res.ok) refetchDetail();
      } catch {
        /* ignore */
      }
    },
    [projectId, refetchDetail]
  );

  const handleRetry = useCallback(
    async (runId: string) => {
      if (!projectId) return;
      try {
        const res = await fetch(`/api/projects/${projectId}/orchestration/runs/${runId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "queued" }),
        });
        if (res.ok) refetchDetail();
      } catch {
        /* ignore */
      }
    },
    [projectId, refetchDetail]
  );

  if (!isOpen) return null;

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col">
      {/* Panel Header */}
      <div className="h-12 border-b border-border flex items-center justify-between px-3">
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === "files" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-[10px] uppercase tracking-wider"
            onClick={() => onTabChange("files")}
          >
            <GitBranch className="h-3 w-3 mr-1" />
            Files
          </Button>
          <Button
            variant={activeTab === "terminal" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-[10px] uppercase tracking-wider"
            onClick={() => onTabChange("terminal")}
          >
            <Terminal className="h-3 w-3 mr-1" />
            Terminal
          </Button>
          <Button
            variant={activeTab === "docs" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-[10px] uppercase tracking-wider"
            onClick={() => onTabChange("docs")}
          >
            <FileText className="h-3 w-3 mr-1" />
            Docs
          </Button>
          <Button
            variant={activeTab === "runs" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-[10px] uppercase tracking-wider"
            onClick={() => onTabChange("runs")}
          >
            <Play className="h-3 w-3 mr-1" />
            Runs
          </Button>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "files" && (
          <ScrollArea className="h-full">
            <div className="py-2">
              <div className="px-3 pb-2 mb-2 border-b border-border">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span>main</span>
                  {filesLoading && projectId && (
                    <>
                      <span className="text-foreground/40">•</span>
                      <Skeleton className="h-3 w-16 rounded" />
                    </>
                  )}
                </div>
              </div>
              {filesLoading && projectId ? (
                <div className="space-y-1 px-3 py-2">
                  <Skeleton className="h-6 w-32 rounded" />
                  <Skeleton className="h-6 w-40 rounded ml-3" />
                  <Skeleton className="h-6 w-36 rounded ml-3" />
                  <Skeleton className="h-6 w-28 rounded ml-6" />
                  <Skeleton className="h-6 w-24 rounded" />
                </div>
              ) : (
                fileTree.map((node) => (
                  <FileTreeNode key={node.path} node={node} />
                ))
              )}
            </div>
          </ScrollArea>
        )}

        {activeTab === "terminal" && (
          <div className="h-full bg-[#0a0a0a] p-4 font-mono text-xs overflow-auto">
            {activeFile && activeFile.code ? (
              <>
                <div className="text-green-400 mb-2">{`$ cat ${activeFile.path}`}</div>
                <div className="space-y-1 text-gray-300 whitespace-pre-wrap break-words">
                  {activeFile.code}
                </div>
                <div className="mt-4 text-green-400">$ _</div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Select a file to view code</p>
                  <p className="text-[10px] mt-1 opacity-75">or run a build to see output</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "runs" && (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-foreground">
                  Build Runs
                </h3>
              </div>
              {runsLoading && !runs?.length ? (
                <RunStatusSkeleton />
              ) : runs && runs.length > 0 ? (
                <div className="space-y-2">
                  {runs.map((run) => (
                    <div
                      key={run.id}
                      className="border border-border rounded p-3 text-xs space-y-1"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() =>
                          setExpandedRunId(expandedRunId === run.id ? null : run.id)
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {run.id.slice(0, 8)}…
                          </span>
                          <span
                            className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                              statusBadgeClass[run.status] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {run.status}
                          </span>
                        </div>
                        <div className="text-muted-foreground">
                          {run.scope} • {run.trigger_type}
                        </div>
                        {run.created_at && (
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(run.created_at).toLocaleString()}
                          </div>
                        )}
                      </button>
                      {expandedRunId === run.id && (
                        <RunDetailPanel
                          runId={run.id}
                          projectId={projectId}
                          runDetail={runDetail}
                          detailLoading={detailLoading}
                          onApprove={handleApprove}
                          onRetry={handleRetry}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Play className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">No runs yet</p>
                  <p className="text-[10px] mt-1 opacity-75">
                    Trigger a build from a card or Build All
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {activeTab === "docs" && (
          <ScrollArea className="h-full">
            {activeDoc ? (
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-mono font-bold text-sm text-foreground">{activeDoc.title ?? activeDoc.name}</h3>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                      {activeDoc.type}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Content rendering */}
                <div className="space-y-3 text-xs text-muted-foreground">
                  {activeDoc.content ? (
                    activeDoc.content.split('\n').map((line, idx) => {
                      if (line.startsWith('# ')) {
                        return (
                          <h2 key={idx} className="text-sm font-bold text-foreground mt-4 mb-2 uppercase tracking-widest">
                            {line.substring(2)}
                          </h2>
                        );
                      }
                      if (line.startsWith('## ')) {
                        return (
                          <h3 key={idx} className="text-xs font-bold text-foreground mt-3 mb-1">
                            {line.substring(3)}
                          </h3>
                        );
                      }
                      if (line.startsWith('- ')) {
                        return (
                          <div key={idx} className="ml-3">
                            • {line.substring(2)}
                          </div>
                        );
                      }
                      if (line.trim().length === 0) {
                        return <div key={idx} className="h-1" />;
                      }
                      if (line.startsWith('```')) {
                        return null;
                      }
                      return (
                        <div key={idx} className="leading-relaxed">
                          {line}
                        </div>
                      );
                    })
                  ) : (
                    <p>No content available</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Select a context doc to view
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
