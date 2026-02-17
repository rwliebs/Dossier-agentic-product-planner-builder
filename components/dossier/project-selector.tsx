'use client';

import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/lib/hooks/use-projects';
import type { Project } from '@/lib/types/ui';

interface ProjectSelectorProps {
  selectedProjectId: string;
  onSelectProjectId: (id: string) => void;
  className?: string;
}

export function ProjectSelector({
  selectedProjectId,
  onSelectProjectId,
  className,
}: ProjectSelectorProps) {
  const { data: projects, loading, refetch } = useProjects();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const selectedProject = projects?.find((p) => p.id === selectedProjectId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) return;
      const project: Project = await res.json();
      onSelectProjectId(project.id);
      setNewName('');
      setCreateOpen(false);
      refetch();
    } catch {
      // ignore
    }
  };

  return (
    <div className={`relative ${className ?? ''}`}>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-xs font-mono"
        onClick={() => setOpen(!open)}
      >
        {loading ? (
          <span className="text-muted-foreground">Loading…</span>
        ) : selectedProject ? (
          <>
            <span className="truncate max-w-[140px]">{selectedProject.name}</span>
            <ChevronDown className="h-3 w-3" />
          </>
        ) : (
          <>
            <span className="text-muted-foreground">Select project</span>
            <ChevronDown className="h-3 w-3" />
          </>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full left-0 mt-1 z-20 min-w-[200px] bg-popover border border-border rounded-md shadow-md py-1">
            {projects?.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-accent"
                onClick={() => {
                  onSelectProjectId(p.id);
                  setOpen(false);
                }}
              >
                {p.name}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              {createOpen ? (
                <div className="px-3 py-2 space-y-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Project name"
                    className="w-full text-xs px-2 py-1 border border-border rounded bg-background"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs" onClick={handleCreate}>
                      Create
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="h-3 w-3" /> New project
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
