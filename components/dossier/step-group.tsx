'use client';

import { ImplementationCard, type CodeFileForPanel } from './implementation-card';
import type { MapStep, MapCard, ContextArtifact, CardRequirement, CardKnownFact, CardAssumption, CardQuestion, CardPlannedFile } from '@/lib/types/ui';

export interface StepGroupProps {
  step: MapStep;
  expandedCardId: string | null;
  onExpandCard: (cardId: string) => void;
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
  };
}

export function StepGroup({
  step,
  expandedCardId,
  onExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onApprovePlannedFile,
  onBuildCard,
  onSelectDoc,
  onSelectFile,
  codeFiles = [],
  getCardKnowledge,
}: StepGroupProps) {
  const sortedCards = [...step.cards].sort((a, b) => a.priority - b.priority);

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-1">
        {step.title}
      </div>
      <div className="space-y-2">
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
              onApprovePlannedFile={onApprovePlannedFile}
              onBuildCard={onBuildCard}
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
            />
          );
        })}
      </div>
    </div>
  );
}
