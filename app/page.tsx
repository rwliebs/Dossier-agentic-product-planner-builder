'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dossier/header';
import { LeftSidebar } from '@/components/dossier/left-sidebar';
import { IterationBlock } from '@/components/dossier/iteration-block';
import { RightPanel } from '@/components/dossier/right-panel';
import { MessageSquare, Bot, Clock, Sparkles } from 'lucide-react';
import type { Iteration, ContextDoc, CodeFile, ProjectContext } from '@/components/dossier/types';
import { mapSnapshotToIterations } from '@/lib/map-adapter';

const defaultProjectId = process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ?? '';

export default function DossierPage() {
  const [appMode, setAppMode] = useState<'ideation' | 'active'>('ideation');
  const [viewMode, setViewMode] = useState<'functionality' | 'architecture'>('functionality');
  const [agentStatus, setAgentStatus] = useState<'idle' | 'building' | 'reviewing'>('idle');
  const [userRequest, setUserRequest] = useState('');
  
  // Project context - shows users what spawned this map
  const projectContext: ProjectContext = {
    userRequest: userRequest || "Build a field service management app like Jobber - capture leads, send quotes, schedule jobs, and invoice customers",
    generatedAt: "Just now",
    activeAgents: 3,
    lastUpdate: "Just now",
  };
  
  const handleIdeationComplete = (request: string) => {
    setUserRequest(request);
    setAppMode('active');
    setAgentStatus('building');
  };
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'files' | 'terminal' | 'docs'>('files');
  const [selectedDoc, setSelectedDoc] = useState<ContextDoc | null>(null);
  const [selectedFile, setSelectedFile] = useState<CodeFile | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const fetchMap = useCallback(async () => {
    if (!defaultProjectId) return;
    setMapLoading(true);
    setMapError(null);
    try {
      const res = await fetch(`/api/projects/${defaultProjectId}/map`);
      if (!res.ok) {
        setMapError(res.status === 404 ? 'Project not found' : 'Failed to load map');
        setIterations([]);
        return;
      }
      const snapshot = await res.json();
      setIterations(mapSnapshotToIterations(snapshot));
    } catch {
      setMapError('Failed to load map');
      setIterations([]);
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    if (appMode === 'active' && defaultProjectId) {
      fetchMap();
    }
  }, [appMode, defaultProjectId, fetchMap]);

  const handleCardAction = (cardId: string, action: string) => {
    // Find the card to get context
    const card = iterations.flatMap(i => i.epics).flatMap(e => e.activities).flatMap(a => a.cards).find(c => c.id === cardId);
    if (!card) return;

    if (action === 'monitor') {
      // Show the code file the agent is working on
      const codeFileId = card.codeFileIds?.[0];
      if (codeFileId) {
        const codeFile = iterations.flatMap(i => i.codeFiles).find(f => f.id === codeFileId);
        if (codeFile) {
          setSelectedFile(codeFile);
          setRightPanelTab('terminal');
          setRightPanelOpen(true);
        }
      }
    } else if (action === 'test') {
      // Show the test files for this card
      const testFileIds = card.testFileIds || [];
      if (testFileIds.length > 0) {
        const testFile = iterations.flatMap(i => i.codeFiles).find(f => f.id === testFileIds[0]);
        if (testFile) {
          setSelectedFile(testFile);
          setRightPanelTab('terminal');
          setRightPanelOpen(true);
        }
      }
    }
  };

  const handleUpdateCardDescription = (cardId: string, description: string) => {
    setIterations((prevIterations) =>
      prevIterations.map((iteration) => ({
        ...iteration,
        epics: iteration.epics.map((epic) => ({
          ...epic,
          activities: epic.activities.map((activity) => ({
            ...activity,
            cards: activity.cards.map((card) =>
              card.id === cardId ? { ...card, description } : card
            ),
          })),
        })),
      }))
    );
  };

  const handleUpdateQuickAnswer = (cardId: string, quickAnswer: string) => {
    setIterations((prevIterations) =>
      prevIterations.map((iteration) => ({
        ...iteration,
        epics: iteration.epics.map((epic) => ({
          ...epic,
          activities: epic.activities.map((activity) => ({
            ...activity,
            cards: activity.cards.map((card) =>
              card.id === cardId ? { ...card, quickAnswer } : card
            ),
          })),
        })),
      }))
    );
  };

  const handleUpdateFileDescription = (fileId: string, description: string) => {
    setIterations((prevIterations) =>
      prevIterations.map((iteration) => ({
        ...iteration,
        codeFiles: iteration.codeFiles?.map((file) =>
          file.id === fileId ? { ...file, description } : file
        ),
      }))
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Header */}
      <Header 
        viewMode={viewMode} 
        onViewModeChange={setViewMode} 
        agentStatus={agentStatus} 
      />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Collapsible */}
        <LeftSidebar
          isCollapsed={leftSidebarCollapsed}
          onToggle={setLeftSidebarCollapsed}
          project={{
            name: 'Dossier',
            description: 'Break vision into flow maps. Bundle context. Ship at AI speed.',
            status: appMode === 'ideation' ? 'planning' : 'active',
            collaborators: ['You', 'AI Agent'],
          }}
          projectId={process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID}
          isIdeationMode={appMode === 'ideation'}
          onIdeationComplete={handleIdeationComplete}
          onPlanningApplied={() => {
            setAgentStatus('reviewing');
            fetchMap();
          }}
        />

        {/* Center - Iteration Blocks or Empty State */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
          {appMode === 'ideation' ? (
            /* Empty state during ideation */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md px-6">
                <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-secondary mb-6">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-3">Describe your idea</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Use the Agent chat in the left panel to describe what you want to build. 
                  I'll ask a few questions, then generate an implementation roadmap.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                  <span>Waiting for your input...</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Project Context Banner - Fixed at top */}
              <div className="shrink-0 bg-secondary/80 backdrop-blur border-b border-border px-6 py-4">
                <div className="flex items-start justify-between gap-6">
                  {/* User's original request */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-1">
                      <MessageSquare className="h-3 w-3" />
                      Your Request
                    </div>
                    <p className="text-sm text-foreground font-medium leading-relaxed">
                      "{projectContext.userRequest}"
                    </p>
                  </div>
                  
                  {/* Agent status */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5 text-green-500" />
                        <span className="text-green-500 font-mono font-bold">{projectContext.activeAgents}</span>
                        <span className="text-muted-foreground">agents working</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Updated {projectContext.lastUpdate}</span>
                    </div>
                  </div>
                </div>
                
                {/* Explanation */}
                <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                  This implementation map was generated from your request. Each card represents a task agents are working on. 
                  <span className="text-foreground"> Click any card</span> to see details, provide answers, or guide the work.
                </p>
              </div>

              {/* Iterations */}
              <div className="flex-1 overflow-y-auto">
                {mapLoading && (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-sm text-muted-foreground">Loading map...</div>
                  </div>
                )}
                {!mapLoading && mapError && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <p className="text-sm text-destructive">{mapError}</p>
                    <button
                      type="button"
                      onClick={() => fetchMap()}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Retry
                    </button>
                  </div>
                )}
                {!mapLoading && !mapError && iterations.map((iteration) => (
                  <IterationBlock
                    key={iteration.id}
                    iteration={iteration}
                    viewMode={viewMode}
                    expandedCardId={expandedCardId}
                    onExpandCard={setExpandedCardId}
                    onCardAction={handleCardAction}
                    onUpdateCardDescription={handleUpdateCardDescription}
                    onUpdateQuickAnswer={handleUpdateQuickAnswer}
                    onUpdateFileDescription={handleUpdateFileDescription}
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
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right Panel - Files/Terminal/Docs (Collapsible) */}
        {rightPanelOpen && (
        <RightPanel
          isOpen={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          activeDoc={selectedDoc}
          activeFile={selectedFile}
          activeTab={rightPanelTab}
          onTabChange={setRightPanelTab}
        />
        )}
      </div>
    </div>
  );
}
