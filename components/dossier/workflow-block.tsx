'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { Pencil, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ACTION_BUTTONS } from '@/lib/constants/action-buttons';
import { StoryMapCanvas, type StoryMapCanvasProps } from './story-map-canvas';
import { ArchitectureView } from './architecture-view';
import type { MapSnapshot, MapCard, ContextArtifact, CardKnowledgeForDisplay, CodeFile } from '@/lib/types/ui';
import type { CodeFileForPanel } from './implementation-card';

const EPIC_COLORS = ['yellow', 'blue', 'purple', 'green', 'orange', 'pink'] as const;

type ProjectContextField = 'description' | 'customer_personas' | 'tech_stack' | 'deployment' | 'design_inspiration';

const FIELD_CONFIG: Record<
  ProjectContextField,
  { label: string; placeholder: string; multiline: boolean }
> = {
  description: {
    label: 'Description',
    placeholder: 'Describe what the project does and who it\'s for...',
    multiline: true,
  },
  customer_personas: {
    label: 'Customer Personas',
    placeholder: 'e.g. Buyers, Sellers, Admin, Power users',
    multiline: false,
  },
  tech_stack: {
    label: 'Tech Stack',
    placeholder: 'e.g. React, Node.js, PostgreSQL, Tailwind',
    multiline: false,
  },
  deployment: {
    label: 'Deployment',
    placeholder: 'e.g. Vercel, local dev, mobile app, web service',
    multiline: false,
  },
  design_inspiration: {
    label: 'Design Inspiration',
    placeholder: 'e.g. Notion, Linear, Stripe dashboard, Dribbble references',
    multiline: false,
  },
};

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
  onUpdateRequirement?: (cardId: string, requirementId: string, text: string) => void | Promise<void>;
  onAddRequirement?: (cardId: string, text: string) => void | Promise<void>;
  onLinkContextArtifact?: (cardId: string, artifactId: string) => void | Promise<void>;
  onAddPlannedFile?: (cardId: string, logicalFilePath: string) => void | Promise<void>;
  availableArtifacts?: ContextArtifact[];
  availableFilePaths?: string[];
  onApprovePlannedFile?: (cardId: string, plannedFileId: string, status: 'approved' | 'proposed') => void;
  onBuildCard?: (cardId: string) => void;
  onFinalizeCard?: (cardId: string) => void;
  onSelectDoc?: (doc: ContextArtifact) => void;
  onFileClick?: (file: CodeFileForPanel | CodeFile) => void;
  onUpdateFileDescription?: (fileId: string, description: string) => void;
  getCardKnowledge?: (cardId: string) => CardKnowledgeForDisplay | undefined;
  getCardKnowledgeLoading?: (cardId: string) => boolean;
  onPopulateWorkflow?: (workflowId: string, workflowTitle: string, workflowDescription: string | null) => void;
  populatingWorkflowId?: string | null;
  onFinalizeProject?: () => void;
  finalizingProject?: boolean;
  /** Called when user edits project context (description, personas, tech stack, deployment, design inspiration) */
  onProjectUpdate?: (updates: {
    description?: string | null;
    customer_personas?: string | null;
    tech_stack?: string | null;
    deployment?: string | null;
    design_inspiration?: string | null;
  }) => void | Promise<boolean | void>;
}

export function WorkflowBlock({
  snapshot,
  viewMode,
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
  onFinalizeCard,
  onSelectDoc,
  onFileClick,
  onUpdateFileDescription,
  getCardKnowledge,
  getCardKnowledgeLoading,
  onPopulateWorkflow,
  populatingWorkflowId,
  onFinalizeProject,
  finalizingProject,
  onProjectUpdate,
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
  const project = snapshot.project as {
    description?: string | null;
    customer_personas?: string | null;
    tech_stack?: string | null;
    deployment?: string | null;
  };
  const [editingField, setEditingField] = useState<ProjectContextField | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const getValue = useCallback(
    (field: ProjectContextField) => project[field] ?? null,
    [project]
  );

  const commitEdit = useCallback(() => {
    if (editingField && onProjectUpdate) {
      const current = getValue(editingField) ?? '';
      if (draftValue.trim() !== current.trim()) {
        onProjectUpdate({ [editingField]: draftValue.trim() || null });
      }
    }
    setEditingField(null);
  }, [editingField, draftValue, getValue, onProjectUpdate]);

  const startEdit = useCallback((field: ProjectContextField) => {
    setEditingField(field);
    setDraftValue(project[field] ?? '');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [project]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, field: ProjectContextField) => {
      if (e.key === 'Enter' && !FIELD_CONFIG[field].multiline) {
        e.preventDefault();
        commitEdit();
      }
      if (e.key === 'Escape') {
        setDraftValue(project[field] ?? '');
        setEditingField(null);
      }
    },
    [commitEdit, project]
  );

  return (
    <div className="border-b border-grid-line last:border-b-0">
      <div className="bg-secondary border-b border-grid-line px-6 py-4 sticky top-0 z-20">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4 mb-3">
              <h2 className="font-mono text-lg font-bold uppercase tracking-widest text-foreground shrink-0">
                Implementation Map
              </h2>
              <div className="flex items-center gap-4 text-xs font-mono shrink-0">
                {statusCounts.active > 0 && <div className="text-green-400"><span className="font-bold">{statusCounts.active}</span> active</div>}
                {statusCounts.questions > 0 && <div className="text-yellow-400"><span className="font-bold">{statusCounts.questions}</span> blocked</div>}
                {statusCounts.review > 0 && <div className="text-blue-400"><span className="font-bold">{statusCounts.review}</span> review</div>}
                {statusCounts.production > 0 && <div className="text-green-600"><span className="font-bold">{statusCounts.production}</span> live</div>}
                {statusCounts.todo > 0 && <div className="text-muted-foreground"><span className="text-foreground font-bold">{statusCounts.todo}</span> pending</div>}
                {onFinalizeProject && allCards.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-[11px] font-mono uppercase tracking-wider ml-2 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100"
                    onClick={onFinalizeProject}
                    disabled={finalizingProject}
                  >
                    <Sparkles className="h-3 w-3" />
                    {finalizingProject ? ACTION_BUTTONS.FINALIZING_PROJECT : ACTION_BUTTONS.FINALIZE_PROJECT}
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {(Object.keys(FIELD_CONFIG) as ProjectContextField[]).map((field) => {
                const config = FIELD_CONFIG[field];
                const value = getValue(field);
                const isEditing = editingField === field;
                return (
                  <div key={field} className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {config.label}
                    </span>
                    {isEditing && onProjectUpdate ? (
                      config.multiline ? (
                        <textarea
                          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => handleKeyDown(e, field)}
                          rows={2}
                          className="text-xs text-foreground bg-background border border-grid-line rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                          placeholder={config.placeholder}
                        />
                      ) : (
                        <input
                          ref={inputRef as React.RefObject<HTMLInputElement>}
                          type="text"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => handleKeyDown(e, field)}
                          className="text-xs text-foreground bg-background border border-grid-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50"
                          placeholder={config.placeholder}
                        />
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => onProjectUpdate ? startEdit(field) : undefined}
                        className={`group flex items-start gap-1.5 text-left w-full text-xs leading-relaxed ${
                          value ? 'text-foreground' : 'text-muted-foreground'
                        } ${onProjectUpdate ? 'hover:bg-background/50 rounded px-1 py-0.5 -mx-1 -my-0.5' : ''}`}
                      >
                        <span className="flex-1 min-w-0">
                          {value || (onProjectUpdate ? config.placeholder : '—')}
                        </span>
                        {onProjectUpdate && (
                          <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
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
            onUpdateRequirement={onUpdateRequirement}
            onAddRequirement={onAddRequirement}
            onLinkContextArtifact={onLinkContextArtifact}
            onAddPlannedFile={onAddPlannedFile}
            availableArtifacts={availableArtifacts}
            availableFilePaths={availableFilePaths}
            onApprovePlannedFile={onApprovePlannedFile}
            onBuildCard={onBuildCard}
            onFinalizeCard={onFinalizeCard}
            onSelectDoc={onSelectDoc}
            onSelectFile={onFileClick}
            getCardKnowledge={getCardKnowledge}
            getCardKnowledgeLoading={getCardKnowledgeLoading}
            onPopulateWorkflow={onPopulateWorkflow}
            populatingWorkflowId={populatingWorkflowId}
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
