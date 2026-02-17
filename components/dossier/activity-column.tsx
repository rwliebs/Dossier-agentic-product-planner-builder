'use client';

import { ImplementationCard, type CodeFileForPanel } from './implementation-card';
import { StepGroup, type StepGroupProps } from './step-group';
import type {
  MapActivity,
  MapCard,
  ContextArtifact,
  CardRequirement,
  CardKnownFact,
  CardAssumption,
  CardQuestion,
  CardPlannedFile,
} from '@/lib/types/ui';

export interface ActivityColumnProps {
  activity: MapActivity;
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
  } | undefined;
}

export function ActivityColumn({
  activity,
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
}: ActivityColumnProps) {
  const sortedSteps = [...activity.steps].sort((a, b) => a.position - b.position);
  const activityLevelCards = activity.cards.filter((c) => !c.step_id);
  const sortedActivityCards = [...activityLevelCards].sort((a, b) => a.priority - b.priority);

  return (
    <div className="flex flex-col min-w-72 max-w-80">
      <div className="border-b-2 border-foreground pb-2 mb-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-foreground">
          {activity.title}
        </h3>
      </div>

      <div className="space-y-4">
        {sortedSteps.map((step) => (
          <StepGroup
            key={step.id}
            step={step}
            expandedCardId={expandedCardId}
            onExpandCard={onExpandCard}
            onCardAction={onCardAction}
            onUpdateCardDescription={onUpdateCardDescription}
            onUpdateQuickAnswer={onUpdateQuickAnswer}
            onApprovePlannedFile={onApprovePlannedFile}
            onBuildCard={onBuildCard}
            onSelectDoc={onSelectDoc}
            onSelectFile={onSelectFile}
            codeFiles={codeFiles}
            getCardKnowledge={getCardKnowledge as never}
          />
        ))}
        {sortedActivityCards.map((card) => {
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
