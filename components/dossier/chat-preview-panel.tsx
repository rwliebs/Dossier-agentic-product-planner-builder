"use client";

import { Button } from "@/components/ui/button";
import { Check, X, AlertCircle } from "lucide-react";

export interface ChatPreviewData {
  added: {
    workflows: string[];
    activities: string[];
    steps: string[];
    cards: string[];
  };
  modified: { cards: string[]; artifacts: string[] };
  reordered: string[];
  summary: string;
}

export interface ChatPreviewPanelProps {
  preview: ChatPreviewData;
  errors?: Array<{ action: unknown; reason: string }>;
  onAccept: () => void;
  onCancel: () => void;
  isApplying?: boolean;
}

export function ChatPreviewPanel({
  preview,
  errors = [],
  onAccept,
  onCancel,
  isApplying = false,
}: ChatPreviewPanelProps) {
  const hasChanges =
    preview.added.workflows.length > 0 ||
    preview.added.activities.length > 0 ||
    preview.added.steps.length > 0 ||
    preview.added.cards.length > 0 ||
    preview.modified.cards.length > 0 ||
    preview.modified.artifacts.length > 0 ||
    preview.reordered.length > 0;

  return (
    <div className="rounded border border-grid-line bg-secondary/50 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-foreground">
          Preview Changes
        </h3>
      </div>

      <p className="text-[11px] text-foreground leading-relaxed">
        {preview.summary}
      </p>

      {hasChanges && (
        <div className="space-y-2 text-[10px]">
          {preview.added.workflows.length > 0 && (
            <div>
              <span className="text-muted-foreground">Workflows: </span>
              <span className="text-foreground">
                +{preview.added.workflows.length}
              </span>
            </div>
          )}
          {preview.added.activities.length > 0 && (
            <div>
              <span className="text-muted-foreground">Activities: </span>
              <span className="text-foreground">
                +{preview.added.activities.length}
              </span>
            </div>
          )}
          {preview.added.steps.length > 0 && (
            <div>
              <span className="text-muted-foreground">Steps: </span>
              <span className="text-foreground">
                +{preview.added.steps.length}
              </span>
            </div>
          )}
          {preview.added.cards.length > 0 && (
            <div>
              <span className="text-muted-foreground">Cards: </span>
              <span className="text-foreground">
                +{preview.added.cards.length}
              </span>
            </div>
          )}
          {preview.modified.cards.length > 0 && (
            <div>
              <span className="text-muted-foreground">Modified: </span>
              <span className="text-foreground">
                {preview.modified.cards.length} card(s)
              </span>
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-amber-600">
            <AlertCircle className="h-3 w-3" />
            <span className="text-[10px] font-mono font-bold">
              {errors.length} action(s) rejected
            </span>
          </div>
          <ul className="list-disc list-inside text-[10px] text-muted-foreground space-y-0.5">
            {errors.slice(0, 3).map((e, i) => (
              <li key={i}>{e.reason}</li>
            ))}
            {errors.length > 3 && (
              <li>...and {errors.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="h-7 text-[10px] flex-1"
          onClick={onAccept}
          disabled={!hasChanges || isApplying}
        >
          {isApplying ? (
            <>Applying...</>
          ) : (
            <>
              <Check className="h-2.5 w-2.5 mr-1" />
              Accept
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          onClick={onCancel}
          disabled={isApplying}
        >
          <X className="h-2.5 w-2.5 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
