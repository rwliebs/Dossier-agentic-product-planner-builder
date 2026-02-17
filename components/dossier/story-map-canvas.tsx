'use client';

import { useState } from 'react';
import { ActivityColumn, type ActivityColumnProps } from './activity-column';
import type { MapWorkflow, ContextArtifact, CardRequirement, CardKnownFact, CardAssumption, CardQuestion, CardPlannedFile } from '@/lib/types/ui';
import type { CodeFileForPanel } from './implementation-card';

export interface StoryMapCanvasProps {
  workflows: MapWorkflow[];
  expandedCardId: string | null;
  onExpandCard: (cardId: string | null) => void;
  onCardAction: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onApprovePlannedFile?: (cardId: string, plannedFileId: string, status: 'approved' | 'proposed') => void;
  onBuildCard?: (cardId: string) => void;
  onSelectDoc?: (doc: ContextArtifact) => void;
  onSelectFile?: (file: CodeFileForPanel) => void;
  codeFiles?: CodeFileForPanel[];
  getCardKnowledge?: (cardId: string) => {
    requirements?: CardRequirement[];
    contextArtifacts?: ContextArtifact[];
    plannedFiles?: CardPlannedFile[];
    facts?: CardKnownFact[];
    assumptions?: CardAssumption[];
    questions?: CardQuestion[];
    quickAnswer?: string | null;
  } | undefined;
}

export function StoryMapCanvas({
  workflows,
  expandedCardId: controlledExpandedCardId,
  onExpandCard: controlledOnExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onApprovePlannedFile,
  onBuildCard,
  onSelectDoc,
  onSelectFile,
  codeFiles,
  getCardKnowledge,
}: StoryMapCanvasProps) {
  const [uncontrolledExpandedCardId, setUncontrolledExpandedCardId] = useState<string | null>(null);
  const expandedCardId = controlledExpandedCardId ?? uncontrolledExpandedCardId;
  const handleExpandCard = controlledOnExpandCard ?? setUncontrolledExpandedCardId;

  const allActivities = workflows.flatMap((wf) =>
    wf.activities.map((act) => ({
      ...act,
      workflowTitle: wf.title,
      workflowId: wf.id,
    }))
  );

  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-muted-foreground uppercase tracking-widest">User Journey</span>
          <span className="text-foreground">→</span>
        </div>
      </div>

      <div className="flex gap-6 p-6 min-w-max">
        {allActivities.map((activity, index) => (
          <div key={activity.id} className="flex items-start gap-6">
            <div className="flex flex-col">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {(activity as { workflowTitle?: string }).workflowTitle}
              </div>
              <ActivityColumn
                activity={activity}
                expandedCardId={expandedCardId}
                onExpandCard={(id) => handleExpandCard(id)}
                onCardAction={onCardAction}
                onUpdateCardDescription={onUpdateCardDescription}
                onUpdateQuickAnswer={onUpdateQuickAnswer}
                onApprovePlannedFile={onApprovePlannedFile}
                onBuildCard={onBuildCard}
                onSelectDoc={onSelectDoc}
                onSelectFile={onSelectFile}
                codeFiles={codeFiles}
                getCardKnowledge={getCardKnowledge as ActivityColumnProps['getCardKnowledge']}
              />
            </div>
            {index < allActivities.length - 1 && (
              <div className="flex items-center h-24 text-muted-foreground/50">
                <span className="text-lg">→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
