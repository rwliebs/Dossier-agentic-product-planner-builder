'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from '@/components/dossier/header';
import { LeftSidebar } from '@/components/dossier/left-sidebar';
import { WorkflowBlock } from '@/components/dossier/workflow-block';
import { RightPanel } from '@/components/dossier/right-panel';
import { ProjectSelector } from '@/components/dossier/project-selector';
import { MessageSquare, Sparkles } from 'lucide-react';
import type { ProjectContext, ContextArtifact, CardKnowledgeForDisplay } from '@/lib/types/ui';
import type { CodeFileForPanel } from '@/components/dossier/implementation-card';
import { useMapSnapshot, useCardKnowledge, useCardPlannedFiles, useSubmitAction, useTriggerBuild } from '@/lib/hooks';
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
  const { data: cardKnowledge, loading: cardKnowledgeLoading } = useCardKnowledge(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const { data: cardPlannedFiles, loading: cardPlannedFilesLoading } = useCardPlannedFiles(
    appMode === 'active' ? projectId : undefined,
    expandedCardId ?? undefined
  );
  const cardKnowledgeLoadingState = cardKnowledgeLoading || cardPlannedFilesLoading;

  const getCardKnowledgeLoading = useCallback(
    (cardId: string): boolean =>
      cardId === expandedCardId && cardKnowledgeLoadingState,
    [expandedCardId, cardKnowledgeLoadingState]
  );

  const getCardKnowledge = useCallback(
    (cardId: string): CardKnowledgeForDisplay | undefined => {
      if (cardId !== expandedCardId) return undefined;
      const card = snapshot?.workflows
        .flatMap((wf) => wf.activities.flatMap((a) => [...a.steps.flatMap((s) => s.cards), ...a.cards]))
        .find((c) => c.id === cardId);
      const out: CardKnowledgeForDisplay = {};
      if (cardKnowledge?.requirements?.length) out.requirements = cardKnowledge.requirements;
      if (cardPlannedFiles?.length) out.plannedFiles = cardPlannedFiles;
      if (cardKnowledge?.facts?.length) out.facts = cardKnowledge.facts;
      if (cardKnowledge?.assumptions?.length) out.assumptions = cardKnowledge.assumptions;
      if (cardKnowledge?.questions?.length) out.questions = cardKnowledge.questions;
      if (card?.quick_answer != null) out.quickAnswer = card.quick_answer;
      return Object.keys(out).length ? out : undefined;
    },
    [expandedCardId, cardKnowledge, cardPlannedFiles, snapshot]
  );

  const projectContext: ProjectContext = {
    userRequest: snapshot?.project?.name ?? 'Describe your idea in the Agent chat to get started',
    generatedAt: snapshot?.project?.name ? 'Just now' : '—',
    activeAgents: 3,
    lastUpdate: 'Just now',
  };

  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'files' | 'terminal' | 'docs' | 'chat' | 'runs'>('files');
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
        setRightPanelTab('runs');
        setRightPanelOpen(true);
        refetch();
      }
    },
    [triggerBuild, refetch]
  );

  const handleBuildAll = useCallback(
    async (workflowId: string) => {
      const result = await triggerBuild({ scope: 'workflow', workflow_id: workflowId });
      if (result.runId) {
        setRightPanelTab('runs');
        setRightPanelOpen(true);
        refetch();
      }
    },
    [triggerBuild, refetch]
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
    async (updates: { name?: string; description?: string | null; repo_url?: string | null; default_branch?: string }) => {
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
        onBuildAll={handleBuildAll}
        firstWorkflowId={snapshot?.workflows?.[0]?.id ?? null}
        selectedProjectId={projectId}
        onSelectProjectId={handleSelectProjectId}
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
              <div className="shrink-0 bg-secondary/80 backdrop-blur border-b border-border px-6 py-4">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                      <MessageSquare className="h-3 w-3" />
                      Your Request
                    </div>
                    <p className="text-sm text-foreground font-medium leading-relaxed">
                      &quot;{projectContext.userRequest}&quot;
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <ProjectSelector
                      selectedProjectId={projectId}
                      onSelectProjectId={handleSelectProjectId}
                    />
                    {/* Placeholder indicators hidden for now: agents working, last update */}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                  This implementation map was generated from your request. Each card represents a task agents are working on.
                  <span className="text-foreground"> Click any card</span> to see details, provide answers, or guide the work.
                </p>
              </div>

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
                    onApprovePlannedFile={handleApprovePlannedFile}
                    onBuildCard={handleBuildCard}
                    onBuildAll={handleBuildAll}
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
