'use client';

import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { StoryMapCanvas, type StoryMapCanvasProps } from './story-map-canvas';
import { ArchitectureView } from './architecture-view';
import { Button } from '@/components/ui/button';
import type { MapSnapshot, MapCard, ContextArtifact, CardKnowledgeForDisplay, CodeFile } from '@/lib/types/ui';
import type { CodeFileForPanel } from './implementation-card';

const EPIC_COLORS = ['yellow', 'blue', 'purple', 'green', 'orange', 'pink'] as const;

function allCardsFromSnapshot(snapshot: MapSnapshot): MapCard[] {
  return snapshot.workflows.flatMap((wf) =>
    wf.activities.flatMap((act) => act.cards)
  );
}

interface WorkflowBlockProps {
  snapshot: MapSnapshot;
  viewMode: 'functionality' | 'architecture';
  expandedCardId: string | null;
  onExpandCard: (cardId: string | null) => void;
  onCardAction: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onApprovePlannedFile?: (cardId: string, plannedFileId: string, status: 'approved' | 'proposed') => void;
  onBuildCard?: (cardId: string) => void;
  onBuildAll?: (workflowId: string) => void;
  onSelectDoc?: (doc: ContextArtifact) => void;
  onFileClick?: (file: CodeFileForPanel | CodeFile) => void;
  onUpdateFileDescription?: (fileId: string, description: string) => void;
  getCardKnowledge?: (cardId: string) => CardKnowledgeForDisplay | undefined;
  getCardKnowledgeLoading?: (cardId: string) => boolean;
}

export function WorkflowBlock({
  snapshot,
  viewMode,
  expandedCardId,
  onExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onApprovePlannedFile,
  onBuildCard,
  onBuildAll,
  onSelectDoc,
  onFileClick,
  onUpdateFileDescription,
  getCardKnowledge,
  getCardKnowledgeLoading,
}: WorkflowBlockProps) {
  const allCards = useMemo(() => allCardsFromSnapshot(snapshot), [snapshot]);
  const statusCounts = useMemo(
    () => ({
      todo: allCards.filter((c) => c.status === 'todo').length,
      active: allCards.filter((c) => c.status === 'active').length,
      questions: allCards.filter((c) => c.status === 'questions').length,
      review: allCards.filter((c) => c.status === 'review').length,
      production: allCards.filter((c) => c.status === 'production').length,
    }),
    [allCards]
  );
  const totalPending = statusCounts.todo + statusCounts.active + statusCounts.questions;

  return (
    <div className="border-b border-grid-line last:border-b-0">
      <div className="bg-secondary/50 border-b border-grid-line px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-lg font-bold uppercase tracking-widest text-foreground">
                Implementation Map
              </h2>
              <p className="text-xs text-muted-foreground">{snapshot.project.name}</p>
            </div>
            <div className="flex gap-4 mt-3 text-xs font-mono">
              {statusCounts.active > 0 && <div className="text-green-400"><span className="font-bold">{statusCounts.active}</span> active</div>}
              {statusCounts.questions > 0 && <div className="text-yellow-400"><span className="font-bold">{statusCounts.questions}</span> blocked</div>}
              {statusCounts.review > 0 && <div className="text-blue-400"><span className="font-bold">{statusCounts.review}</span> review</div>}
              {statusCounts.production > 0 && <div className="text-green-600"><span className="font-bold">{statusCounts.production}</span> live</div>}
              {statusCounts.todo > 0 && <div className="text-muted-foreground"><span className="text-foreground font-bold">{statusCounts.todo}</span> pending</div>}
            </div>
          </div>
          {totalPending > 0 && onBuildAll && snapshot.workflows[0] && (
            <Button
              className="h-8 gap-2 bg-primary text-primary-foreground whitespace-nowrap"
              onClick={() => onBuildAll(snapshot.workflows[0].id)}
            >
              <Zap className="h-3 w-3" />
              <span className="text-xs uppercase tracking-widest font-mono">Build All</span>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        {viewMode === 'functionality' ? (
          <StoryMapCanvas
            workflows={snapshot.workflows}
            expandedCardId={expandedCardId}
            onExpandCard={onExpandCard}
            onCardAction={onCardAction}
            onUpdateCardDescription={onUpdateCardDescription}
            onUpdateQuickAnswer={onUpdateQuickAnswer}
            onApprovePlannedFile={onApprovePlannedFile}
            onBuildCard={onBuildCard}
            onSelectDoc={onSelectDoc}
            onSelectFile={onFileClick}
            getCardKnowledge={getCardKnowledge}
            getCardKnowledgeLoading={getCardKnowledgeLoading}
          />
        ) : (
          <ArchitectureView
            snapshot={snapshot}
            onUpdateFileDescription={onUpdateFileDescription}
            onFileClick={onFileClick}
          />
        )}
      </div>
    </div>
  );
}
