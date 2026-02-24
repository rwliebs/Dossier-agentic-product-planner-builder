'use client';

import { useState } from 'react';
import { Layers, Sparkles, Trash2 } from 'lucide-react';
import { ActivityColumn, type ActivityColumnProps } from './activity-column';
import { Button } from '@/components/ui/button';
import { InlineAddInput } from './inline-add-input';
import { ACTION_BUTTONS } from '@/lib/constants/action-buttons';
import type { MapWorkflow, ContextArtifact, CardKnowledgeForDisplay } from '@/lib/types/ui';

export interface StoryMapCanvasProps {
  workflows: MapWorkflow[];
  expandedCardId: string | null;
  onExpandCard: (cardId: string | null) => void;
  onCardAction: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onUpdateRequirement?: (cardId: string, requirementId: string, text: string) => void | Promise<void>;
  onAddRequirement?: (cardId: string, text: string) => void | Promise<void>;
  onLinkContextArtifact?: (cardId: string, artifactId: string) => void | Promise<void>;
  onAddPlannedFile?: (cardId: string, logicalFilePath: string) => void | Promise<void>;
  availableArtifacts?: ContextArtifact[];
  availableFilePaths?: string[];
  onApprovePlannedFile?: (cardId: string, plannedFileId: string, status: 'approved' | 'proposed') => void;
  onBuildCard?: (cardId: string) => void;
  buildingCardId?: string | null;
  onFinalizeCard?: (cardId: string) => void;
  finalizingCardId?: string | null;
  cardFinalizeProgress?: string;
  onSelectDoc?: (doc: ContextArtifact) => void;
  getCardKnowledge?: (cardId: string) => CardKnowledgeForDisplay | undefined;
  getCardKnowledgeLoading?: (cardId: string) => boolean;
  /** When workflows are scaffolded (no activities), call to populate a single workflow. */
  onPopulateWorkflow?: (workflowId: string, workflowTitle: string, workflowDescription: string | null) => void;
  /** ID of workflow currently being populated (shows loading state). */
  populatingWorkflowId?: string | null;
  /** Add workflow/activity/card; delete workflow/activity/card. */
  onAddWorkflow?: (title: string) => void | Promise<void>;
  onAddActivity?: (workflowId: string, title: string, position?: number) => void | Promise<void>;
  onAddCard?: (activityId: string, title: string, position?: number, priority?: number) => void | Promise<void>;
  onDeleteWorkflow?: (workflowId: string, workflowTitle: string, activityCount: number, cardCount: number) => void;
  onDeleteActivity?: (activityId: string, activityTitle: string, cardCount: number) => void;
  onDeleteCard?: (cardId: string, cardTitle: string) => void;
}

export function StoryMapCanvas({
  workflows,
  expandedCardId: controlledExpandedCardId,
  onExpandCard: controlledOnExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onUpdateRequirement,
  onAddRequirement,
  onLinkContextArtifact,
  onAddPlannedFile,
  availableArtifacts = [],
  availableFilePaths = [],
  onApprovePlannedFile,
  onBuildCard,
  buildingCardId,
  onFinalizeCard,
  finalizingCardId,
  cardFinalizeProgress,
  onSelectDoc,
  getCardKnowledge,
  getCardKnowledgeLoading,
  onPopulateWorkflow,
  populatingWorkflowId,
  onAddWorkflow,
  onAddActivity,
  onAddCard,
  onDeleteWorkflow,
  onDeleteActivity,
  onDeleteCard,
}: StoryMapCanvasProps) {
  const [uncontrolledExpandedCardId, setUncontrolledExpandedCardId] = useState<string | null>(null);
  const expandedCardId = controlledExpandedCardId ?? uncontrolledExpandedCardId;
  const handleExpandCard = controlledOnExpandCard ?? setUncontrolledExpandedCardId;

  const hasActivities = workflows.some((wf) => wf.activities.length > 0);
  const workflowsWithNoActivities = !hasActivities && workflows.length > 0;

  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto bg-background">
      {workflowsWithNoActivities ? (
        <div className="p-6 min-w-max">
          {workflows.map((wf) => (
            <div key={wf.id} className="mb-0">
              <div className="flex items-center gap-3 border-b border-border px-0 py-3 mb-4">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  {wf.title}
                </span>
                <span className="text-foreground text-xs">→</span>
                {onPopulateWorkflow && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px] font-mono uppercase tracking-wider ml-2"
                    onClick={() => onPopulateWorkflow(wf.id, wf.title, wf.description ?? null)}
                    disabled={populatingWorkflowId != null}
                  >
                    <Sparkles className="h-3 w-3" />
                    {populatingWorkflowId === wf.id ? ACTION_BUTTONS.POPULATING : ACTION_BUTTONS.POPULATE}
                  </Button>
                )}
              </div>
              <div className="flex gap-6 mb-6">
                <div className="w-48 flex flex-col">
                  <div className="border border-dashed border-border rounded px-3 py-4 text-center">
                    <p className="text-[11px] text-muted-foreground/60 font-mono">—</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="flex flex-col items-center gap-3 py-6 text-center max-w-sm mx-auto">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-secondary">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              Workflows are scaffolded — click Populate on any workflow to add activities and cards.
            </p>
            {onAddWorkflow && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Add workflow</span>
                <div className="border border-dashed border-border rounded px-4 py-3 inline-flex">
                  <InlineAddInput
                    placeholder="Workflow title"
                    buttonLabel="+ Workflow"
                    onConfirm={onAddWorkflow}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 min-w-max">
          {workflows.map((wf) => {
            const sortedActivities = [...wf.activities].sort((a, b) => a.position - b.position);
            if (sortedActivities.length === 0) {
              return (
                <div key={wf.id} className="mb-0">
                  <div className="flex items-center gap-3 border-b border-border px-0 py-3 mb-4">
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                      {wf.title}
                    </span>
                    <span className="text-foreground text-xs">→</span>
                    {onPopulateWorkflow && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-[11px] font-mono uppercase tracking-wider ml-2"
                        onClick={() => onPopulateWorkflow(wf.id, wf.title, wf.description ?? null)}
                        disabled={populatingWorkflowId != null}
                      >
                        <Sparkles className="h-3 w-3" />
                        {populatingWorkflowId === wf.id ? ACTION_BUTTONS.POPULATING : ACTION_BUTTONS.POPULATE}
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-6 mb-6">
                    <div className="w-48 flex flex-col">
                      <div className="border border-dashed border-border rounded px-3 py-4 text-center">
                        <p className="text-[11px] text-muted-foreground/60 font-mono">—</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            const activityCount = sortedActivities.length;
            const cardCount = sortedActivities.reduce((sum, a) => sum + a.cards.length, 0);
            return (
              <div key={wf.id} className="mb-0">
                <div className="group flex items-center gap-3 border-b border-border px-0 py-3 mb-4">
                  <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
                    {wf.title}
                  </span>
                  <span className="text-foreground text-xs">→</span>
                  {onDeleteWorkflow && (
                    <button
                      type="button"
                      onClick={() => onDeleteWorkflow(wf.id, wf.title, activityCount, cardCount)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                      aria-label={`Delete workflow ${wf.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex gap-6 mb-6">
                  {sortedActivities.map((activity, index) => (
                    <div key={activity.id} className="flex items-start gap-4">
                      <ActivityColumn
                        activity={activity}
                        expandedCardId={expandedCardId}
                        onExpandCard={(id) => handleExpandCard(id)}
                        onCardAction={onCardAction}
                        onUpdateCardDescription={onUpdateCardDescription}
                        onUpdateQuickAnswer={onUpdateQuickAnswer}
                        onUpdateRequirement={onUpdateRequirement}
                        onAddRequirement={onAddRequirement}
                        onLinkContextArtifact={onLinkContextArtifact}
                        onAddPlannedFile={onAddPlannedFile}
                        availableArtifacts={availableArtifacts}
                        availableFilePaths={availableFilePaths}
                        onApprovePlannedFile={onApprovePlannedFile}
                        onBuildCard={onBuildCard}
                        buildingCardId={buildingCardId}
                        onFinalizeCard={onFinalizeCard}
                        finalizingCardId={finalizingCardId}
                        cardFinalizeProgress={cardFinalizeProgress}
                        onSelectDoc={onSelectDoc}
                        getCardKnowledge={getCardKnowledge as ActivityColumnProps['getCardKnowledge']}
                        getCardKnowledgeLoading={getCardKnowledgeLoading}
                        onAddCard={onAddCard ? (title, position, priority) => onAddCard(activity.id, title, position, priority) : undefined}
                        onDeleteActivity={onDeleteActivity}
                        onDeleteCard={onDeleteCard}
                      />
                      {onAddActivity && (
                        <div className="flex flex-col items-center gap-0.5 self-start shrink-0">
                          <InlineAddInput
                            placeholder="Activity"
                            buttonLabel="+"
                            onConfirm={(title) => onAddActivity(wf.id, title, index + 1)}
                            className="text-muted-foreground/50 hover:text-muted-foreground/80 bg-transparent border-0 shadow-none h-6 text-[10px]"
                          />
                          {index < sortedActivities.length - 1 && (
                            <span className="text-sm text-muted-foreground/40">→</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {onAddWorkflow && hasActivities && (
            <div className="mt-6 mb-6 flex flex-col gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Add workflow</span>
              <div className="border border-dashed border-border rounded px-4 py-3 inline-flex">
                <InlineAddInput
                  placeholder="Workflow title"
                  buttonLabel="+ Workflow"
                  onConfirm={onAddWorkflow}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
