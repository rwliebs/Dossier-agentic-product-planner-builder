"use client";

import { useState } from "react";
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
} from "lucide-react";
import type { ContextArtifact } from "@/lib/types/ui";
import type { CodeFileForPanel } from "./implementation-card";
import { useProjectFiles, type FileNode } from "@/lib/hooks/use-project-files";
import { Skeleton } from "@/components/ui/skeleton";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeDoc: ContextArtifact | null;
  activeFile: CodeFileForPanel | null;
  activeTab: "files" | "terminal" | "docs" | "chat";
  onTabChange: (tab: "files" | "terminal" | "docs" | "chat") => void;
  /** When set, files tab shows live project file tree from planned files */
  projectId?: string;
  /** Controlled width in pixels */
  width?: number;
  /** Project docs to show in the Docs tab list when no doc is selected */
  docsList?: ContextArtifact[];
  /** Called when user selects a doc from the list; pass null to clear selection */
  onSelectDoc?: (doc: ContextArtifact | null) => void;
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

export function RightPanel({
  isOpen,
  onClose,
  activeDoc,
  activeFile,
  activeTab,
  onTabChange,
  projectId,
  width,
  docsList = [],
  onSelectDoc,
}: RightPanelProps) {
  const { data: projectFiles, loading: filesLoading } = useProjectFiles(projectId);
  const fileTree = projectFiles && projectFiles.length > 0 ? projectFiles : [];

  if (!isOpen) return null;

  return (
    <div
      className="border-l border-border bg-background flex flex-col"
      style={{ width: width ?? 320, flexShrink: 0 }}
    >
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

        {activeTab === "docs" && (
          <ScrollArea className="h-full">
            {activeDoc ? (
              <div className="p-4 space-y-3">
                {docsList.length > 0 && onSelectDoc && (
                  <button
                    type="button"
                    onClick={() => onSelectDoc(null)}
                    className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1"
                  >
                    ← All docs
                  </button>
                )}
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
            ) : docsList.length > 0 ? (
              <div className="p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-2">
                  Project documents
                </p>
                {docsList.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onSelectDoc?.(doc)}
                    className="block w-full text-left text-xs px-3 py-2 rounded-md border border-border bg-background hover:bg-accent/50 hover:border-accent-foreground/20 transition-colors text-foreground"
                  >
                    <span className="font-medium truncate block">{doc.title ?? doc.name}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{doc.type}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Select a context doc to view
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    Add docs via chat or link from a card
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
