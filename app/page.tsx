'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from '@/components/dossier/header';
import { LeftSidebar } from '@/components/dossier/left-sidebar';
import { WorkflowBlock } from '@/components/dossier/workflow-block';
import { RightPanel } from '@/components/dossier/right-panel';
import { Sparkles } from 'lucide-react';
import type { ContextArtifact, CardKnowledgeForDisplay } from '@/lib/types/ui';
import type { CodeFileForPanel } from '@/components/dossier/implementation-card';
import { useMapSnapshot, useCardKnowledge, useCardPlannedFiles, useCardContextArtifacts, useArtifacts, useProjectFiles, useSubmitAction, useTriggerBuild } from '@/lib/hooks';
import { useProjects } from '@/lib/hooks/use-projects';
import { MapErrorBoundary } from '@/components/dossier/map-error-boundary';
import { ChatErrorBoundary } from '@/components/dossier/chat-error-boundary';
import { MapSkeleton } from '@/components/dossier/map-skeleton';

const PROJECT_STORAGE_KEY = 'dossier_project_id';

function getStoredProjectId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PROJECT_STORAGE_KEY) ?? '';
}

function setStoredProjectId(id: string): void {
  if (typeof window === 'undefined') return;
  if (id) localStorage.setItem(PROJECT_STORAGE_KEY, id);
  else localStorage.removeItem(PROJECT_STORAGE_KEY);
}

export default function DossierPage() {
  const defaultProjectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? '';
  const [projectIdState, setProjectIdState] = useState<string>(() => getStoredProjectId() || defaultProjectId);
  const { data: projects } = useProjects();

  useEffect(() => {
    const stored = getStoredProjectId();
    if (stored && stored !== projectIdState) {
      setProjectIdState(stored);
      return;
    }
    if (!projectIdState && projects?.length) {
      const firstId = projects[0].id;
      setStoredProjectId(firstId);
      setProjectIdState(firstId);
    }
  }, [projects, projectIdState]);

  const projectId = projectIdState || defaultProjectId;

  const handleSelectProjectId = useCallback((id: string) => {
    setStoredProjectId(id);
    setProjectIdState(id);
  }, []);

  const [viewMode, setViewMode] = useState<'functionality' | 'architecture'>('functionality');
  const [agentStatus, setAgentStatus] = useState<'idle' | 'building' | 'reviewing'>('idle');
  const { data: snapshot, loading: mapLoading, error: mapError, refetch } = useMapSnapshot(
    projectId || undefined
  );

  // hasContent: true only when activities have been populated (not just scaffolded)
  const hasContent = snapshot?.workflows?.some((wf) => wf.activities.length > 0) ?? false;
  // appMode drives which layout to show — active whenever workflows exist so the canvas can render empty-state guidance
  const appMode = (snapshot?.workflows?.length ?? 0) > 0 ? 'active' : 'ideation';
  const { submit: submitAction } = useSubmitAction(appMode === 'active' ? projectId : undefined);
  const { triggerBuild } = useTriggerBuild(appMode === 'active' ? projectId : undefined);

  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const { data: cardKnowledge, loading: cardKnowledgeLoading, refetch: refetchCardKnowledge } = useCardKnowledge(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const { data: cardPlannedFiles, loading: cardPlannedFilesLoading, refetch: refetchCardPlannedFiles } = useCardPlannedFiles(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const { data: cardContextArtifacts, loading: cardContextArtifactsLoading, refetch: refetchCardContextArtifacts } = useCardContextArtifacts(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const { data: projectArtifacts } = useArtifacts(appMode === 'active' ? projectId : undefined);
  const { data: projectFilesTree } = useProjectFiles(appMode === 'active' ? projectId : undefined);
  const cardKnowledgeLoadingState = cardKnowledgeLoading || cardPlannedFilesLoading || cardContextArtifactsLoading;

  const getCardKnowledgeLoading = useCallback(
    (cardId: string): boolean =>
      cardId === expandedCardId && cardKnowledgeLoadingState,
    [expandedCardId, cardKnowledgeLoadingState]
  );

  const getCardKnowledge = useCallback(
    (cardId: string): CardKnowledgeForDisplay | undefined => {
      if (cardId !== expandedCardId) return undefined;
      const card = snapshot?.workflows
        .flatMap((wf) => wf.activities.flatMap((a) => a.cards))
        .find((c) => c.id === cardId);
      const out: CardKnowledgeForDisplay = {};
      out.requirements = cardKnowledge?.requirements ?? [];
      out.contextArtifacts = cardContextArtifacts ?? [];
      out.plannedFiles = cardPlannedFiles ?? [];
      if (cardKnowledge?.facts?.length) out.facts = cardKnowledge.facts;
      if (cardKnowledge?.assumptions?.length) out.assumptions = cardKnowledge.assumptions;
      if (cardKnowledge?.questions?.length) out.questions = cardKnowledge.questions;
      if (card?.quick_answer != null) out.quickAnswer = card.quick_answer;
      return out;
    },
    [expandedCardId, cardKnowledge, cardContextArtifacts, cardPlannedFiles, snapshot]
  );

  function flattenFilePaths(nodes: { path?: string; type?: string; children?: unknown[] }[] | null, acc: string[] = []): string[] {
    if (!nodes) return acc;
    for (const n of nodes) {
      if (n.type === 'file' && n.path) acc.push(n.path);
      if (n.children?.length) flattenFilePaths(n.children as { path?: string; type?: string; children?: unknown[] }[], acc);
    }
    return acc;
  }
  const availableFilePaths = projectFilesTree ? flattenFilePaths(projectFilesTree) : [];

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'files' | 'terminal' | 'docs' | 'chat'>('files');
  const [selectedDoc, setSelectedDoc] = useState<ContextArtifact | null>(null);
  const [selectedFile, setSelectedFile] = useState<CodeFileForPanel | null>(null);

  const LEFT_WIDTH_KEY = 'dossier_left_sidebar_width';
  const RIGHT_WIDTH_KEY = 'dossier_right_panel_width';
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 256;
    return Number(localStorage.getItem(LEFT_WIDTH_KEY)) || 256;
  });
  const [rightWidth, setRightWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 320;
    return Number(localStorage.getItem(RIGHT_WIDTH_KEY)) || 320;
  });

  const dragging = useRef<'left' | 'right' | null>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleResizeMouseDown = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = side;
    dragStartX.current = e.clientX;
    dragStartWidth.current = side === 'left' ? leftWidth : rightWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (dragging.current === 'left') {
        const delta = ev.clientX - dragStartX.current;
        const next = Math.max(180, Math.min(520, dragStartWidth.current + delta));
        setLeftWidth(next);
        localStorage.setItem(LEFT_WIDTH_KEY, String(next));
      } else if (dragging.current === 'right') {
        const delta = dragStartX.current - ev.clientX;
        const next = Math.max(220, Math.min(640, dragStartWidth.current + delta));
        setRightWidth(next);
        localStorage.setItem(RIGHT_WIDTH_KEY, String(next));
      }
    };

    const onMouseUp = () => {
      dragging.current = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [leftWidth, rightWidth]);

  const handleCardAction = useCallback((cardId: string, action: string) => {
    if (action === 'monitor' || action === 'test') {
      setRightPanelTab('terminal');
      setRightPanelOpen(true);
    }
  }, []);

  const handleBuildCard = useCallback(
    async (cardId: string) => {
      const result = await triggerBuild({ scope: 'card', card_id: cardId });
      if (result.runId) {
        setRightPanelTab('files');
        setRightPanelOpen(true);
        refetch();
      }
    },
    [triggerBuild, refetch]
  );

  const [populatingWorkflowId, setPopulatingWorkflowId] = useState<string | null>(null);
  const handlePopulateWorkflow = useCallback(
    async (workflowId: string, workflowTitle: string, workflowDescription: string | null) => {
      if (!projectId) return;
      setPopulatingWorkflowId(workflowId);
      try {
        const parts: string[] = [`Add activities and cards for ${workflowTitle}`];
        if (workflowDescription) parts.push(`Workflow: ${workflowDescription}`);
        if (snapshot?.project?.description) parts.push(`Project: ${snapshot.project.description}`);
        const message = parts.join('. ');
        const res = await fetch(`/api/projects/${projectId}/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, mode: 'populate', workflow_id: workflowId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const msg = (err as { error?: string; message?: string }).error ?? (err as { message?: string }).message ?? `Populate failed (${res.status})`;
          const { toast } = await import('sonner');
          toast.error(msg);
          setPopulatingWorkflowId(null);
          return;
        }
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamError: string | null = null;
        let actionCount = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\n\n+/);
            buffer = blocks.pop() ?? '';
            for (const block of blocks) {
              let eventType = '';
              let dataStr = '';
              for (const line of block.split('\n')) {
                if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                if (line.startsWith('data: ')) dataStr = line.slice(6);
              }
              if (eventType === 'error' && dataStr) {
                try {
                  const data = JSON.parse(dataStr) as { reason?: string };
                  streamError = data.reason ?? 'Populate failed';
                } catch {
                  streamError = 'Populate failed';
                }
              }
              if (eventType === 'action') actionCount++;
            }
          }
        }
        if (streamError) {
          const { toast } = await import('sonner');
          toast.error(streamError);
        } else if (actionCount === 0) {
          const { toast } = await import('sonner');
          toast.warning('No activities or cards were generated. Try again or add more context in the Agent chat.');
        }
        refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Populate failed';
        const { toast } = await import('sonner');
        toast.error(msg);
      } finally {
        setPopulatingWorkflowId(null);
      }
    },
    [projectId, snapshot?.project?.description, refetch]
  );

  const handleUpdateCardDescription = useCallback(
    async (cardId: string, description: string) => {
      const result = await submitAction({
        actions: [
          {
            action_type: 'updateCard',
            target_ref: { card_id: cardId },
            payload: { description: description || null },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
    },
    [submitAction, refetch]
  );

  const handleUpdateQuickAnswer = useCallback(
    async (cardId: string, quickAnswer: string) => {
      const result = await submitAction({
        actions: [
          {
            action_type: 'updateCard',
            target_ref: { card_id: cardId },
            payload: { quick_answer: quickAnswer || null },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
    },
    [submitAction, refetch]
  );

  const handleUpdateRequirement = useCallback(
    async (cardId: string, requirementId: string, text: string) => {
      if (!projectId) return;
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/requirements/${requirementId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      );
      if (res.ok) {
        refetchCardKnowledge();
      }
    },
    [projectId, refetchCardKnowledge]
  );

  const handleAddRequirement = useCallback(
    async (cardId: string, text: string) => {
      if (!projectId) return;
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/requirements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, source: 'user' }),
        }
      );
      if (res.ok) {
        refetchCardKnowledge();
      }
    },
    [projectId, refetchCardKnowledge]
  );

  const handleLinkContextArtifact = useCallback(
    async (cardId: string, artifactId: string) => {
      const result = await submitAction({
        actions: [
          {
            action_type: 'linkContextArtifact',
            target_ref: { card_id: cardId },
            payload: { context_artifact_id: artifactId },
          },
        ],
      });
      if (result && result.applied > 0) {
        refetch();
        refetchCardContextArtifacts();
      }
    },
    [submitAction, refetch, refetchCardContextArtifacts]
  );

  const handleAddPlannedFile = useCallback(
    async (cardId: string, logicalFilePath: string) => {
      if (!projectId) return;
      const res = await fetch(
        `/api/projects/${projectId}/cards/${cardId}/planned-files`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logical_file_name: logicalFilePath,
            artifact_kind: 'util',
            action: 'edit',
            intent_summary: 'Added by user',
          }),
        }
      );
      if (res.ok) {
        refetchCardPlannedFiles();
      }
    },
    [projectId, refetchCardPlannedFiles]
  );

  const handleApprovePlannedFile = useCallback(
    async (cardId: string, plannedFileId: string, status: 'approved' | 'proposed') => {
      const result = await submitAction({
        actions: [
          {
            action_type: 'approveCardPlannedFile',
            target_ref: { card_id: cardId },
            payload: { planned_file_id: plannedFileId, status },
          },
        ],
      });
      if (result && result.applied > 0) refetch();
    },
    [submitAction, refetch]
  );

  const handleUpdateFileDescription = useCallback((_fileId: string, _description: string) => {
    refetch();
  }, [refetch]);

  const handleProjectUpdate = useCallback(
    async (updates: {
      name?: string;
      description?: string | null;
      customer_personas?: string | null;
      tech_stack?: string | null;
      deployment?: string | null;
      design_inspiration?: string | null;
      repo_url?: string | null;
      default_branch?: string;
    }) => {
      if (!projectId) return false;
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        if (res.ok) refetch();
        return res.ok;
      } catch {
        return false;
      }
    },
    [projectId, refetch]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      <Header
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        agentStatus={agentStatus}
        selectedProjectId={projectId}
        onSelectProjectId={handleSelectProjectId}
        onSaveCurrentProject={refetch}
      />

      <div className="flex flex-1 overflow-hidden">
        <ChatErrorBoundary>
        <LeftSidebar
          isCollapsed={leftSidebarCollapsed}
          onToggle={setLeftSidebarCollapsed}
          width={leftSidebarCollapsed ? undefined : leftWidth}
          project={{
            name: snapshot?.project?.name ?? 'Dossier',
            description: snapshot?.project?.description ?? null,
            status: appMode === 'ideation' ? 'planning' : 'active',
            repo_url: snapshot?.project?.repo_url ?? null,
          }}
          projectId={projectId || undefined}
          onPlanningApplied={() => {
            setAgentStatus(hasContent ? 'reviewing' : 'building');
            refetch();
          }}
          onProjectUpdate={handleProjectUpdate}
        />
        </ChatErrorBoundary>

        {!leftSidebarCollapsed && (
          <div
            className="w-1 flex-shrink-0 bg-transparent hover:bg-primary/40 active:bg-primary/60 cursor-col-resize transition-colors z-10"
            onMouseDown={(e) => handleResizeMouseDown('left', e)}
            title="Drag to resize"
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {appMode === 'ideation' ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-secondary mb-6">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Describe your idea</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Use the Agent chat in the left panel to describe what you want to build.
                  The planning agent will generate workflows, activities, and cards for your implementation map.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                  <span>Waiting for your input...</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                {mapLoading && <MapSkeleton />}
                {!mapLoading && mapError && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <p className="text-sm text-destructive">{mapError}</p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!mapLoading && !mapError && snapshot && (
                  <MapErrorBoundary onRetry={refetch}>
                  <WorkflowBlock
                    snapshot={snapshot}
                    viewMode={viewMode}
                    expandedCardId={expandedCardId}
                    onExpandCard={setExpandedCardId}
                    onCardAction={handleCardAction}
                    onUpdateCardDescription={handleUpdateCardDescription}
                    onUpdateQuickAnswer={handleUpdateQuickAnswer}
                    onUpdateRequirement={handleUpdateRequirement}
                    onAddRequirement={handleAddRequirement}
                    onLinkContextArtifact={handleLinkContextArtifact}
                    onAddPlannedFile={handleAddPlannedFile}
                    availableArtifacts={projectArtifacts ?? []}
                    availableFilePaths={availableFilePaths}
                    onApprovePlannedFile={handleApprovePlannedFile}
                    onBuildCard={handleBuildCard}
                    onPopulateWorkflow={handlePopulateWorkflow}
                    populatingWorkflowId={populatingWorkflowId}
                    onProjectUpdate={handleProjectUpdate}
                    onSelectDoc={(doc) => {
                      setSelectedDoc(doc);
                      setRightPanelTab('docs');
                      setRightPanelOpen(true);
                    }}
                    onFileClick={(file) => {
                      setSelectedFile(file);
                      setRightPanelTab('terminal');
                      setRightPanelOpen(true);
                    }}
                    onUpdateFileDescription={handleUpdateFileDescription}
                    getCardKnowledge={getCardKnowledge}
                    getCardKnowledgeLoading={getCardKnowledgeLoading}
                  />
                  </MapErrorBoundary>
                )}
              </div>
            </>
          )}
        </div>

        {rightPanelOpen && (
          <>
            <div
              className="w-1 flex-shrink-0 bg-transparent hover:bg-primary/40 active:bg-primary/60 cursor-col-resize transition-colors z-10"
              onMouseDown={(e) => handleResizeMouseDown('right', e)}
              title="Drag to resize"
            />
            <RightPanel
              isOpen={rightPanelOpen}
              onClose={() => setRightPanelOpen(false)}
              activeDoc={selectedDoc}
              activeFile={selectedFile}
              activeTab={rightPanelTab}
              onTabChange={setRightPanelTab}
              projectId={appMode === 'active' ? projectId : undefined}
              width={rightWidth}
            />
          </>
        )}
      </div>
    </div>
  );
}
