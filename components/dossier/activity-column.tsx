'use client';

import { Trash2 } from 'lucide-react';
import { ImplementationCard, type CodeFileForPanel } from './implementation-card';
import { InlineAddInput } from './inline-add-input';
import type { MapActivity, ContextArtifact, CardKnowledgeForDisplay } from '@/lib/types/ui';

export interface ActivityColumnProps {
  activity: MapActivity;
  expandedCardId: string | null;
  onExpandCard: (cardId: string) => void;
  onCardAction: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onUpdateRequirement?: (cardId: string, requirementId: string, text: string) => void | Promise<void>;
  onAddRequirement?: (cardId: string, text: string) => void | Promise<void>;
  onLinkContextArtifact?: (cardId: string, artifactId: string) => void | Promise<void>;
  onAddPlannedFile?: (cardId: string, logicalFilePath: string) => void | Promise<void>;
  availableArtifacts?: import('@/lib/types/ui').ContextArtifact[];
  availableFilePaths?: string[];
  onApprovePlannedFile?: (cardId: string, plannedFileId: string, status: 'approved' | 'proposed') => void;
  onBuildCard?: (cardId: string) => void;
  buildingCardId?: string | null;
  onFinalizeCard?: (cardId: string) => void;
  finalizingCardId?: string | null;
  cardFinalizeProgress?: string;
  onSelectDoc?: (doc: ContextArtifact) => void;
  onSelectFile?: (file: CodeFileForPanel) => void;
  codeFiles?: CodeFileForPanel[];
  getCardKnowledge?: (cardId: string) => CardKnowledgeForDisplay | undefined;
  getCardKnowledgeLoading?: (cardId: string) => boolean;
  onAddCard?: (title: string) => void | Promise<void>;
  onDeleteActivity?: (activityId: string, activityTitle: string, cardCount: number) => void;
  onDeleteCard?: (cardId: string, cardTitle: string) => void;
}

export function ActivityColumn({
  activity,
  expandedCardId,
  onExpandCard,
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
  onSelectFile,
  codeFiles = [],
  getCardKnowledge,
  getCardKnowledgeLoading,
  onAddCard,
  onDeleteActivity,
  onDeleteCard,
}: ActivityColumnProps) {
  const sortedCards = [...activity.cards].sort((a, b) => a.priority - b.priority || 0);

  return (
    <div className="flex flex-col min-w-72 max-w-80">
      <div className="group flex items-center justify-between gap-2 border-b-2 border-foreground pb-2 mb-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-foreground">
          {activity.title}
        </h3>
        {onDeleteActivity && (
          <button
            type="button"
            onClick={() => onDeleteActivity(activity.id, activity.title, activity.cards.length)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
            aria-label={`Delete activity ${activity.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-4">
        {sortedCards.map((card) => {
          const k = getCardKnowledge?.(card.id);
          return (
            <ImplementationCard
              key={card.id}
              card={card}
              isExpanded={expandedCardId === card.id}
              onExpand={onExpandCard}
              onAction={onCardAction}
              onUpdateDescription={onUpdateCardDescription ?? (() => {})}
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
              onSelectFile={onSelectFile}
              codeFiles={codeFiles}
              requirements={k?.requirements}
              contextArtifacts={k?.contextArtifacts}
              plannedFiles={k?.plannedFiles}
              facts={k?.facts}
              assumptions={k?.assumptions}
              questions={k?.questions}
              quickAnswer={k?.quickAnswer}
              knowledgeLoading={getCardKnowledgeLoading?.(card.id)}
              onDeleteCard={onDeleteCard ? () => onDeleteCard(card.id, card.title) : undefined}
            />
          );
        })}
        {onAddCard && (
          <div className="pt-2 border border-dashed border-border rounded px-3 py-2">
            <InlineAddInput
              placeholder="Card title"
              buttonLabel="+ Card"
              onConfirm={onAddCard}
            />
          </div>
        )}
      </div>
    </div>
  );
}
