'use client';

import { useMemo } from 'react';
import { ArchitectureCanvas } from './architecture-canvas';
import { ArchitectureLegend } from './architecture-legend';
import type { MapSnapshot, EpicLike, CodeFile, MapCard, DataFlow } from '@/lib/types/ui';

const EPIC_COLORS: EpicLike['color'][] = ['yellow', 'blue', 'purple', 'green', 'orange', 'pink'];

function snapshotToEpics(snapshot: MapSnapshot): EpicLike[] {
  return snapshot.workflows.map((wf, i) => ({
    id: wf.id,
    title: wf.title,
    color: EPIC_COLORS[i % EPIC_COLORS.length],
    activities: wf.activities.map((act) => ({
      id: act.id,
      epicId: wf.id,
      title: act.title,
      cards: [...act.cards].sort((a, b) => a.priority - b.priority),
    })),
  }));
}

interface ArchitectureViewProps {
  snapshot: MapSnapshot;
  onUpdateFileDescription?: (fileId: string, description: string) => void;
}

export function ArchitectureView({
  snapshot,
  onUpdateFileDescription,
}: ArchitectureViewProps) {
  const epics = useMemo(() => snapshotToEpics(snapshot), [snapshot]);
  const codeFiles: CodeFile[] = []; // TODO: from snapshot or project when API provides
  const dataFlows: DataFlow[] = [];
  const allCards: MapCard[] = useMemo(
    () => epics.flatMap((epic) => epic.activities.flatMap((a) => a.cards)),
    [epics]
  );

  if (codeFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <p>No architecture data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ArchitectureLegend />
      <ArchitectureCanvas
        codeFiles={codeFiles}
        dataFlows={dataFlows}
        cards={allCards}
        epics={epics}
        onUpdateFileDescription={onUpdateFileDescription}
      />
    </div>
  );
}
