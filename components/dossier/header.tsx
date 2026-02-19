'use client';

import { SettingsMenu } from '@/components/dossier/settings-menu';

interface DossierHeaderProps {
  viewMode: 'functionality' | 'architecture';
  onViewModeChange: (mode: 'functionality' | 'architecture') => void;
  agentStatus: 'idle' | 'building' | 'reviewing';
  selectedProjectId: string;
  onSelectProjectId: (id: string) => void;
  onSaveCurrentProject?: () => void | Promise<void>;
}

export function Header({ selectedProjectId, onSelectProjectId, onSaveCurrentProject }: DossierHeaderProps) {

  return (
    <header className="border-b border-grid-line bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-foreground">
            DOSSIER
          </h1>
          <div className="text-xs uppercase tracking-widest font-mono text-muted-foreground">
            AI-Native Product Building Platform
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <SettingsMenu
              selectedProjectId={selectedProjectId}
              onSelectProjectId={onSelectProjectId}
              onSaveCurrentProject={onSaveCurrentProject}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
