'use client';

import { useState } from 'react';
import { Settings, Plus, KeyRound, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjects } from '@/lib/hooks/use-projects';
import type { Project } from '@/lib/types/ui';
import { ApiKeysDialog } from '@/components/dossier/api-keys-dialog';
import { Input } from '@/components/ui/input';

interface SettingsMenuProps {
  selectedProjectId: string;
  onSelectProjectId: (id: string) => void;
}

export function SettingsMenu({
  selectedProjectId,
  onSelectProjectId,
}: SettingsMenuProps) {
  const { data: projects, loading, refetch } = useProjects();
  const [apiKeysOpen, setApiKeysOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!res.ok) return;
      const project: Project = await res.json();
      onSelectProjectId(project.id);
      setNewProjectName('');
      refetch();
    } catch {
      // ignore
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 bg-transparent"
            aria-label="Settings"
          >
            <Settings className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Projects
            </DropdownMenuLabel>
            {loading ? (
              <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
            ) : (
              projects?.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => onSelectProjectId(p.id)}
                >
                  {selectedProjectId === p.id ? (
                    <Check className="h-3.5 w-3.5 mr-2" />
                  ) : (
                    <span className="w-[14px] mr-2" aria-hidden />
                  )}
                  <span className="truncate">{p.name}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Plus className="h-3.5 w-3.5 mr-2" />
                New project…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <div className="p-2 space-y-2">
                  <Input
                    placeholder="Project name"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateProject();
                      }
                    }}
                  />
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs flex-1"
                      onClick={handleCreateProject}
                      disabled={!newProjectName.trim()}
                    >
                      Create
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setNewProjectName('')}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              API Keys
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setApiKeysOpen(true)}>
              <KeyRound className="h-3.5 w-3.5 mr-2" />
              Edit keys &amp; tokens…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ApiKeysDialog open={apiKeysOpen} onOpenChange={setApiKeysOpen} />
    </>
  );
}
