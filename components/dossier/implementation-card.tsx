'use client';

import { useState } from 'react';
import { ChevronDown, Edit2, Check, X, Plus, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CardSkeleton } from './card-skeleton';
import { ACTION_BUTTONS } from '@/lib/constants/action-buttons';
import type {
  MapCard,
  CardStatus,
  ContextArtifact,
  CardRequirement,
  CardKnownFact,
  CardAssumption,
  CardQuestion,
  CardPlannedFile,
} from '@/lib/types/ui';

// Minimal file type for terminal/code view (e.g. planned file or code file)
export interface CodeFileForPanel {
  id: string;
  path: string;
  name: string;
  type?: string;
  code?: string;
}

interface ImplementationCardProps {
  card: MapCard;
  isExpanded: boolean;
  onExpand: (cardId: string | null) => void;
  onAction: (cardId: string, action: string) => void;
  onUpdateDescription: (cardId: string, description: string) => void;
  onUpdateQuickAnswer?: (cardId: string, quickAnswer: string) => void;
  onUpdateRequirement?: (cardId: string, requirementId: string, text: string) => void | Promise<void>;
  onAddRequirement?: (cardId: string, text: string) => void | Promise<void>;
  onLinkContextArtifact?: (cardId: string, artifactId: string) => void | Promise<void>;
  onAddPlannedFile?: (cardId: string, logicalFilePath: string) => void | Promise<void>;
  availableArtifacts?: ContextArtifact[];
  availableFilePaths?: string[];
  onBuildCard?: (cardId: string) => void;
  onResumeBlockedCard?: (cardId: string) => void;
  /** When provided, shows a Review button that opens the files pane with this card's feature branch */
  onShowCardFiles?: (cardId: string) => void;
  buildingCardId?: string | null;
  onFinalizeCard?: (cardId: string) => void;
  finalizingCardId?: string | null;
  cardFinalizeProgress?: string;
  /** When false, Approve button is hidden (project must be approved first) */
  projectFinalized?: boolean;
  onSelectDoc?: (doc: ContextArtifact) => void;
  /** Canonical knowledge (optional; when loaded) */
  requirements?: CardRequirement[];
  contextArtifacts?: ContextArtifact[];
  plannedFiles?: CardPlannedFile[];
  facts?: CardKnownFact[];
  assumptions?: CardAssumption[];
  questions?: CardQuestion[];
  quickAnswer?: string | null;
  /** Show skeleton when expanded and knowledge/planned files are loading */
  knowledgeLoading?: boolean;
  /** Callback when user confirms delete (no args; parent has card context) */
  onDeleteCard?: () => void;
}

const CARD_STATUS = ['todo', 'active', 'questions', 'review', 'production'] as const;
type CardStatusType = (typeof CARD_STATUS)[number];

const statusConfig: Record<CardStatusType, { bg: string; text: string; border: string; badge: string; button: string }> = {
  todo: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300', badge: 'bg-gray-200 text-gray-700', button: 'bg-gray-500 hover:bg-gray-600' },
  active: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', badge: 'bg-green-200 text-green-700', button: 'bg-green-600 hover:bg-green-700' },
  questions: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', badge: 'bg-yellow-200 text-yellow-700', button: 'bg-red-600 hover:bg-red-700' },
  review: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', badge: 'bg-blue-200 text-blue-700', button: 'bg-blue-600 hover:bg-blue-700' },
  production: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-200 text-emerald-700', button: 'bg-emerald-600 hover:bg-emerald-700' },
};

const statusLabels: Record<CardStatusType, string> = {
  todo: 'todo',
  active: 'active',
  questions: 'questions',
  review: 'review',
  production: 'live',
};


export function ImplementationCard({
  card,
  isExpanded,
  onExpand,
  onAction,
  onUpdateDescription,
  onUpdateQuickAnswer = () => {},
  onUpdateRequirement,
  onAddRequirement,
  onLinkContextArtifact,
  onAddPlannedFile,
  availableArtifacts = [],
  availableFilePaths = [],
  onBuildCard,
  onResumeBlockedCard,
  onShowCardFiles,
  buildingCardId,
  onFinalizeCard,
  finalizingCardId,
  cardFinalizeProgress,
  projectFinalized = true,
  onSelectDoc,
  requirements = [],
  contextArtifacts = [],
  plannedFiles = [],
  facts = [],
  assumptions = [],
  questions = [],
  quickAnswer: quickAnswerProp,
  knowledgeLoading = false,
  onDeleteCard,
}: ImplementationCardProps) {
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState(card.description || '');
  const [isEditingQuickAnswer, setIsEditingQuickAnswer] = useState(false);
  const [editedQuickAnswer, setEditedQuickAnswer] = useState(quickAnswerProp || '');
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null);
  const [editedRequirementText, setEditedRequirementText] = useState('');
  const [isAddingRequirement, setIsAddingRequirement] = useState(false);
  const [newRequirementText, setNewRequirementText] = useState('');

  const status = (CARD_STATUS.includes(card.status as CardStatusType) ? card.status : 'todo') as CardStatusType;
  const config = statusConfig[status];
  const sortedArtifacts = [...contextArtifacts].sort((a, b) => a.name.localeCompare(b.name));
  const e2eTestArtifacts = sortedArtifacts.filter((a) => (a as { type?: string }).type === 'test');
  const contextDocArtifacts = sortedArtifacts.filter((a) => (a as { type?: string }).type !== 'test');
  const quickAnswer = quickAnswerProp ?? editedQuickAnswer;

  const getActionButtonText = () =>
    ACTION_BUTTONS.CARD_ACTION[status as keyof typeof ACTION_BUTTONS.CARD_ACTION] ?? ACTION_BUTTONS.CARD_ACTION.todo;

  /** Unified action button: single button with priority-ordered label and behavior. */
  const getUnifiedActionState = () => {
    const buildState = card.build_state ?? null;
    const isBuilding = buildingCardId === card.id;
    const isQueuedOrRunning = buildState === 'queued' || buildState === 'running';
    const isBlocked = buildState === 'blocked';
    const isCompleted = buildState === 'completed';
    const isFinalized = !!card.finalized_at;
    const canResume = isBlocked && !!onResumeBlockedCard;

    if (isBuilding || isQueuedOrRunning) {
      return {
        label: (buildState === 'running' || isBuilding) ? ACTION_BUTTONS.UNIFIED.BUILDING : ACTION_BUTTONS.UNIFIED.QUEUED,
        disabled: true,
        action: null as string | null,
        buttonClass: 'bg-amber-500 cursor-not-allowed animate-pulse',
      };
    }
    if (isBlocked && canResume) {
      return {
        label: ACTION_BUTTONS.UNIFIED.RESUME_BUILD,
        disabled: false,
        action: 'resume',
        buttonClass: 'bg-amber-600 hover:bg-amber-700',
      };
    }
    if (isBlocked && !canResume) {
      return {
        label: ACTION_BUTTONS.CARD_ACTION.todo,
        disabled: false,
        action: 'build',
        buttonClass: config.button,
      };
    }
    if (isCompleted) {
      return {
        label: ACTION_BUTTONS.UNIFIED.MERGE_FEATURE,
        disabled: false,
        action: 'merge',
        buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
      };
    }
    if (!isFinalized && onFinalizeCard && projectFinalized) {
      return {
        label: finalizingCardId === card.id ? ACTION_BUTTONS.FINALIZING_CARD : ACTION_BUTTONS.FINALIZE_CARD,
        disabled: finalizingCardId === card.id,
        action: 'finalize',
        buttonClass: finalizingCardId === card.id
          ? 'bg-indigo-400 cursor-not-allowed animate-pulse'
          : 'bg-indigo-600 hover:bg-indigo-700',
      };
    }
    if (status === 'questions') {
      return {
        label: ACTION_BUTTONS.CARD_ACTION.questions,
        disabled: false,
        action: 'reply',
        buttonClass: config.button,
      };
    }
    if (status === 'review') {
      return {
        label: ACTION_BUTTONS.CARD_ACTION.review,
        disabled: false,
        action: 'test',
        buttonClass: config.button,
      };
    }
    if (status === 'active') {
      return {
        label: ACTION_BUTTONS.CARD_ACTION.active,
        disabled: false,
        action: 'monitor',
        buttonClass: config.button,
      };
    }
    if ((status === 'todo' || status === 'production') && isFinalized && onBuildCard) {
      return {
        label: ACTION_BUTTONS.CARD_ACTION.todo,
        disabled: false,
        action: 'build',
        buttonClass: config.button,
      };
    }
    if ((status === 'todo' || status === 'production') && !isFinalized && onFinalizeCard && projectFinalized) {
      return {
        label: finalizingCardId === card.id ? ACTION_BUTTONS.FINALIZING_CARD : ACTION_BUTTONS.FINALIZE_CARD,
        disabled: finalizingCardId === card.id,
        action: 'finalize',
        buttonClass: finalizingCardId === card.id
          ? 'bg-indigo-400 cursor-not-allowed animate-pulse'
          : 'bg-indigo-600 hover:bg-indigo-700',
      };
    }
    return {
      label: getActionButtonText(),
      disabled: false,
      action: 'build',
      buttonClass: config.button,
    };
  };

  const unifiedState = getUnifiedActionState();

  const handleUnifiedAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (unifiedState.disabled) return;
    switch (unifiedState.action) {
      case 'resume':
        onResumeBlockedCard?.(card.id);
        break;
      case 'build':
        if (onBuildCard) {
          onBuildCard(card.id);
        } else {
          onAction(card.id, 'build');
        }
        break;
      case 'merge':
        onAction(card.id, 'merge');
        break;
      case 'finalize':
        onFinalizeCard?.(card.id);
        break;
      case 'reply':
        onAction(card.id, 'reply');
        break;
      case 'test':
        onAction(card.id, 'test');
        break;
      case 'monitor':
        onAction(card.id, 'monitor');
        break;
      default:
        onAction(card.id, unifiedState.action ?? 'build');
    }
  };

  const handleSaveDescription = () => {
    onUpdateDescription(card.id, editedDescription);
    setIsEditingDescription(false);
  };

  const handleCancelEdit = () => {
    setEditedDescription(card.description || '');
    setIsEditingDescription(false);
  };

  const handleSaveQuickAnswer = () => {
    onUpdateQuickAnswer(card.id, editedQuickAnswer);
    setIsEditingQuickAnswer(false);
  };

  const handleCancelQuickAnswer = () => {
    setEditedQuickAnswer(quickAnswer || '');
    setIsEditingQuickAnswer(false);
  };

  const handleStartEditRequirement = (req: CardRequirement) => {
    setEditingRequirementId(req.id);
    setEditedRequirementText(req.text);
  };

  const handleSaveRequirement = async () => {
    if (!editingRequirementId || !onUpdateRequirement) return;
    const trimmed = editedRequirementText.trim();
    if (trimmed) {
      await onUpdateRequirement(card.id, editingRequirementId, trimmed);
    }
    setEditingRequirementId(null);
    setEditedRequirementText('');
  };

  const handleCancelEditRequirement = () => {
    setEditingRequirementId(null);
    setEditedRequirementText('');
  };

  const handleStartAddRequirement = () => {
    setIsAddingRequirement(true);
    setNewRequirementText('');
  };

  const handleSaveNewRequirement = async () => {
    if (!onAddRequirement) return;
    const trimmed = newRequirementText.trim();
    if (trimmed) {
      await onAddRequirement(card.id, trimmed);
    }
    setIsAddingRequirement(false);
    setNewRequirementText('');
  };

  const handleCancelAddRequirement = () => {
    setIsAddingRequirement(false);
    setNewRequirementText('');
  };

  return (
    <div className={`border-2 rounded transition-all group ${config.bg} ${config.border}`}>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} truncate`}>
                {card.title}
              </h4>
              {onDeleteCard && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCard();
                  }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
                  aria-label={`Delete card ${card.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {isEditingDescription ? (
              <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-gray-300 rounded text-gray-900"
                  placeholder="Enter description or user story..."
                  rows={3}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleSaveDescription(); }} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-green-600 text-white rounded hover:bg-green-700">
                    <Check className="h-3 w-3" /> Save
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="group/desc flex items-start gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs text-gray-600 flex-1">{card.description || 'No description'}</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setIsEditingDescription(true); }} className="opacity-0 group-hover/desc:opacity-100 transition-opacity p-1 hover:bg-black/5 rounded">
                  <Edit2 className="h-3 w-3 text-gray-400" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(card.build_state === 'queued' || card.build_state === 'running' || buildingCardId === card.id) && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 animate-pulse">
              {card.build_state === 'running' ? 'Agent building…' : 'Build queued…'}
            </span>
          )}
          {card.build_state === 'blocked' && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900">
              Blocked — answer questions
            </span>
          )}
          {card.build_state === 'completed' && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-green-100 text-green-800">
              Built {card.last_built_at ? new Date(card.last_built_at).toLocaleDateString() : ''}
            </span>
          )}
          {card.build_state === 'failed' && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-100 text-red-800">
              Build failed
            </span>
          )}
          {sortedArtifacts.slice(0, 2).map((doc) => (
            <span key={doc.id} className="text-[10px] px-2 py-0.5 bg-white/60 text-gray-600 rounded">
              {doc.name}
            </span>
          ))}
          {sortedArtifacts.length > 2 && <span className="text-[10px] text-gray-500">+{sortedArtifacts.length - 2}</span>}
        </div>

        {card.build_state === 'failed' && card.last_build_error && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-red-800 mb-1">
              Failure reason
            </p>
            <p className="text-xs text-red-900/90 leading-relaxed break-words">
              {card.last_build_error}
            </p>
          </div>
        )}

        {card.build_state === 'blocked' && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2">
            <p className="text-[10px] font-mono uppercase tracking-wider text-amber-800 mb-1">
              Decision required
            </p>
            {card.last_build_error && (
              <p className="text-xs text-amber-900/90 mb-2 leading-relaxed break-words">
                {card.last_build_error}
              </p>
            )}
            {isEditingQuickAnswer ? (
              <div className="space-y-2">
                <textarea
                  value={editedQuickAnswer}
                  onChange={(e) => setEditedQuickAnswer(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-amber-300 rounded text-gray-900"
                  placeholder="Provide clarification so the agent can continue..."
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveQuickAnswer}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    <Check className="h-3 w-3" /> Save answer
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelQuickAnswer}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    <X className="h-3 w-3" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="group/blocked-answer flex items-start gap-2">
                <p className="text-xs text-amber-900/90 flex-1 leading-relaxed">
                  {quickAnswer || 'Agent is waiting for your decision. Add a short answer or instruction.'}
                </p>
                <button
                  type="button"
                  onClick={() => setIsEditingQuickAnswer(true)}
                  className="opacity-0 group-hover/blocked-answer:opacity-100 transition-opacity p-1 hover:bg-amber-100 rounded"
                  title="Provide clarification"
                >
                  <Edit2 className="h-3 w-3 text-amber-700" />
                </button>
              </div>
            )}
          </div>
        )}

        {status === 'questions' && quickAnswer && (
          <div className="mt-2 pt-2 border-t border-yellow-200">
            <p className="text-xs text-gray-600 leading-relaxed italic">{quickAnswer}</p>
          </div>
        )}

        <div className="pt-2 space-y-2">
          {!isExpanded && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onExpand(card.id); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold bg-foreground text-background rounded hover:bg-foreground/90 transition-colors"
            >
              <ChevronDown className="h-4 w-4" /> {ACTION_BUTTONS.VIEW_DETAILS_EDIT}
            </button>
          )}
          {finalizingCardId === card.id && cardFinalizeProgress && (
            <p className="text-[10px] font-mono text-indigo-500 truncate px-1">
              {cardFinalizeProgress}
            </p>
          )}
          {card.finalized_at && unifiedState.action !== 'finalize' && (
            <div className="flex items-center gap-2 px-2 py-1.5 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-700 font-mono">
              <Check className="h-3 w-3" />
              Approved
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={unifiedState.disabled}
              onClick={handleUnifiedAction}
              className={`flex-1 px-2 py-1.5 text-xs font-mono uppercase tracking-widest font-bold text-white rounded transition-colors ${unifiedState.buttonClass}`}
            >
              {unifiedState.label}
            </button>
            {onShowCardFiles && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowCardFiles(card.id);
                }}
                className="px-2 py-1.5 text-xs font-mono uppercase tracking-widest font-medium text-muted-foreground hover:text-foreground border border-border rounded hover:bg-accent/50 transition-colors"
              >
                {ACTION_BUTTONS.REVIEW_FILES}
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t-2 bg-white/50" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 space-y-4">
            {knowledgeLoading ? (
              <CardSkeleton />
            ) : (
            <>
            <div>
              <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>Requirements</h5>
              {requirements.length > 0 || isAddingRequirement ? (
                <ul className="space-y-1">
                  {requirements.map((req) => (
                    <li key={req.id} className="group/req text-xs text-gray-600 flex items-center gap-2 flex-wrap">
                      {editingRequirementId === req.id ? (
                        <div className="flex-1 min-w-0 space-y-2" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editedRequirementText}
                            onChange={(e) => setEditedRequirementText(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-gray-300 rounded text-gray-900"
                            placeholder="Requirement text..."
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button type="button" onClick={handleSaveRequirement} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-green-600 text-white rounded hover:bg-green-700">
                              <Check className="h-3 w-3" /> Save
                            </button>
                            <button type="button" onClick={handleCancelEditRequirement} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                              <X className="h-3 w-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="flex-1">• {req.text}</span>
                          {onUpdateRequirement && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); handleStartEditRequirement(req); }} className="opacity-0 group-hover/req:opacity-100 hover:opacity-100 p-1 hover:bg-black/5 rounded transition-opacity shrink-0" title="Edit">
                              <Edit2 className="h-3 w-3 text-gray-400" />
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                  {isAddingRequirement && (
                    <li className="text-xs" onClick={(e) => e.stopPropagation()}>
                      <div className="space-y-2">
                        <textarea
                          value={newRequirementText}
                          onChange={(e) => setNewRequirementText(e.target.value)}
                          className="w-full text-xs p-2 bg-white border border-gray-300 rounded text-gray-900"
                          placeholder="Add a requirement..."
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleSaveNewRequirement} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-green-600 text-white rounded hover:bg-green-700">
                            <Check className="h-3 w-3" /> Add
                          </button>
                          <button type="button" onClick={handleCancelAddRequirement} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                            <X className="h-3 w-3" /> Cancel
                          </button>
                        </div>
                      </div>
                    </li>
                  )}
                </ul>
              ) : null}
              {requirements.length === 0 && !isAddingRequirement && (
                <p className="text-xs text-muted-foreground italic">None — added by agent when creating card or add below</p>
              )}
              {onAddRequirement && !isAddingRequirement && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleStartAddRequirement(); }}
                  className="mt-2 flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 hover:border-foreground/50 rounded px-2 py-1.5 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
            </div>

            {e2eTestArtifacts.length > 0 && (
              <div>
                <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>E2E tests</h5>
                <div className="space-y-1">
                  {e2eTestArtifacts.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onSelectDoc?.(doc)}
                      className="block w-full text-left text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:border-gray-400 transition-colors text-gray-700 font-mono"
                    >
                      {doc.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>Context documents</h5>
              {contextDocArtifacts.length > 0 ? (
                <div className="space-y-1">
                  {contextDocArtifacts.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => onSelectDoc?.(doc)}
                      className="block w-full text-left text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:border-gray-400 transition-colors text-gray-700"
                    >
                      {doc.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">None — add via chat or documents panel</p>
              )}
              {onLinkContextArtifact && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 hover:border-foreground/50 rounded px-2 py-1.5 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto">
                    {availableArtifacts
                      .filter((a) => !sortedArtifacts.some((d) => d.id === a.id))
                      .map((art) => (
                        <DropdownMenuItem
                          key={art.id}
                          onClick={(e) => { e.stopPropagation(); onLinkContextArtifact(card.id, art.id); }}
                          className="text-xs"
                        >
                          {art.name}
                        </DropdownMenuItem>
                      ))}
                    {availableArtifacts.filter((a) => !sortedArtifacts.some((d) => d.id === a.id)).length === 0 && (
                      <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                        {availableArtifacts.length === 0 ? 'No docs — add via documents panel first' : 'All docs already linked'}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div>
              <h5 className={`text-xs font-mono font-bold uppercase tracking-widest ${config.text} mb-2`}>Code Files to Create/Edit</h5>
              {plannedFiles.length > 0 ? (
                <div className="space-y-1">
                  {plannedFiles.map((pf) => (
                    <div key={pf.id} className="flex items-center gap-2 text-xs px-2 py-1 bg-white border border-gray-300 rounded">
                      <span className="text-gray-700 truncate flex-1 min-w-0">{pf.logical_file_name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{pf.artifact_kind}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">None — added by agent or files panel</p>
              )}
              {onAddPlannedFile && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 hover:border-foreground/50 rounded px-2 py-1.5 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-48 overflow-y-auto">
                    {availableFilePaths
                      .filter((p) => !plannedFiles.some((pf) => pf.logical_file_name === p))
                      .map((path) => (
                        <DropdownMenuItem
                          key={path}
                          onClick={(e) => { e.stopPropagation(); onAddPlannedFile(card.id, path); }}
                          className="text-xs font-mono"
                        >
                          {path}
                        </DropdownMenuItem>
                      ))}
                    {availableFilePaths.filter((p) => !plannedFiles.some((pf) => pf.logical_file_name === p)).length === 0 && (
                      <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                        {availableFilePaths.length === 0 ? 'No files — add via agent first' : 'All files already added'}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            </>
            )}

            <button
              type="button"
              onClick={() => onExpand(null)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-2 text-xs font-semibold bg-secondary text-foreground rounded hover:bg-secondary/80 transition-colors border border-border"
            >
              <ChevronDown className="h-4 w-4 rotate-180" /> Collapse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
