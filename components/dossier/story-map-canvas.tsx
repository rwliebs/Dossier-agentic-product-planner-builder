'use client';

import { useState } from 'react';
import { Bot, Clock, MessageSquare } from 'lucide-react';
import { ActivityColumn } from './activity-column';
import type { Epic, ContextDoc, CodeFile, ProjectContext } from './types';

interface StoryMapCanvasProps {
  epics: Epic[];
  expandedCardId?: string | null;
  onExpandCard?: (cardId: string | null) => void;
  onCardAction?: (cardId: string, action: string) => void;
  onUpdateCardDescription?: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onSelectDoc?: (doc: ContextDoc) => void;
  onSelectFile?: (file: CodeFile) => void;
  codeFiles?: CodeFile[];
  projectContext?: ProjectContext;
}

export function StoryMapCanvas({
  epics,
  expandedCardId: controlledExpandedCardId,
  onExpandCard: controlledOnExpandCard,
  onCardAction,
  onUpdateCardDescription,
  onUpdateQuickAnswer,
  onSelectDoc,
  onSelectFile,
  codeFiles,
  projectContext,
}: StoryMapCanvasProps) {
  const [uncontrolledExpandedCardId, setUncontrolledExpandedCardId] = useState<string | null>(null);

  // Use controlled or uncontrolled state
  const expandedCardId = controlledExpandedCardId ?? uncontrolledExpandedCardId;
  const handleExpandCard = controlledOnExpandCard ?? setUncontrolledExpandedCardId;

  const handleCardAction = (cardId: string, action: string) => {
    onCardAction?.(cardId, action);
  };

  // Flatten all activities from all epics into a single horizontal flow
  // Each activity knows which epic it belongs to for labeling
  const allActivities = epics.flatMap((epic) =>
    epic.activities.map((activity) => ({
      ...activity,
      epicTitle: epic.title,
      epicId: epic.id,
    }))
  );

  return (
    <div className="flex-1 overflow-x-auto overflow-y-auto bg-background">
      {/* Project Context Banner - Explains what user is looking at */}
      {projectContext && (
        <div className="sticky top-0 z-10 bg-secondary/80 backdrop-blur border-b border-border px-6 py-4">
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
      )}
      
      {/* Horizontal Flow Header - User Journey */}
      <div className="sticky top-[108px] z-10 bg-background border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-muted-foreground uppercase tracking-widest">User Journey</span>
          <span className="text-foreground">→</span>
        </div>
      </div>
      
      {/* Single Horizontal Row - All Activities */}
      <div className="flex gap-6 p-6 min-w-max">
        {allActivities.map((activity, index) => (
          <div key={activity.id} className="flex items-start gap-6">
            <div className="flex flex-col">
              {/* Epic Label above activity */}
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {activity.epicTitle}
              </div>
              <ActivityColumn
                activity={activity}
                expandedCardId={expandedCardId}
                onExpandCard={handleExpandCard}
                onCardAction={handleCardAction}
                onUpdateCardDescription={onUpdateCardDescription}
                onUpdateQuickAnswer={onUpdateQuickAnswer}
                onSelectDoc={onSelectDoc}
                onSelectFile={onSelectFile}
                codeFiles={codeFiles}
              />
            </div>
            {/* Arrow between activities */}
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
