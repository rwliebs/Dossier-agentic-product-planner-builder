'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'workflow' | 'activity' | 'card';
  entityName: string;
  cascadeMessage?: string;
  /** Return true to close the dialog (success), false to keep it open (failure). */
  onConfirm: () => boolean | Promise<boolean>;
  isDeleting?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  entityType,
  entityName,
  cascadeMessage,
  onConfirm,
  isDeleting = false,
}: ConfirmDeleteDialogProps) {
  const entityLabel =
    entityType === 'workflow'
      ? 'Workflow'
      : entityType === 'activity'
        ? 'Activity'
        : 'Card';

  const handleConfirm = async () => {
    const success = await onConfirm();
    if (success) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!isDeleting}>
        <DialogHeader>
          <DialogTitle>Delete {entityLabel}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &quot;{entityName}&quot;?
            {cascadeMessage && (
              <span className="mt-2 block text-destructive/90">
                {cascadeMessage}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
