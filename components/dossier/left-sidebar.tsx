'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Bot, User, Send, Github, Check, FolderOpen, Folder, FileCode, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChatSkeleton } from './chat-skeleton';
import { Button } from '@/components/ui/button';
import { ChatPreviewPanel } from '@/components/dossier/chat-preview-panel';
import { useProjectFiles, type FileNode } from '@/lib/hooks/use-project-files';

interface ProjectInfo {
  name: string;
  description: string;
  status: 'active' | 'planning' | 'completed';
}

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

function normalizePreviewErrors(
  errs: string[] | Array<{ action: unknown; reason: string }> | undefined
): Array<{ action: unknown; reason: string }> | undefined {
  if (!errs?.length) return undefined;
  const first = errs[0];
  if (typeof first === 'object' && first !== null && 'reason' in first) {
    return errs as Array<{ action: unknown; reason: string }>;
  }
  return (errs as string[]).map((msg) => ({ action: null as unknown, reason: msg }));
}

interface ChatPreviewResponse {
  status?: "success" | "error";
  message?: string;
  actions?: Array<{ id: string; action_type: string; target_ref: unknown; payload: unknown }>;
  preview?: {
    added: { workflows: string[]; activities: string[]; steps: string[]; cards: string[] };
    modified: { cards: string[]; artifacts: string[] };
    reordered: string[];
    summary: string;
  } | null;
  errors?: string[] | Array<{ action: unknown; reason: string }>;
  metadata?: { tokens: number; model: string };
}

interface LeftSidebarProps {
  isCollapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  project: ProjectInfo;
  projectId?: string;
  /** Called when user accepts preview and actions are applied (map should refresh) */
  onPlanningApplied?: () => void;
}

function FileTreeNode({ node, depth = 0, selectedFiles, onToggleFile }: { node: FileNode; depth?: number; selectedFiles: string[]; onToggleFile: (path: string) => void }) {
  const [isOpen, setIsOpen] = useState(depth < 1);
  const isSelected = selectedFiles.includes(node.path);
  return (
    <div>
      <button
        type="button"
        onClick={() => node.type === 'folder' ? setIsOpen(!isOpen) : onToggleFile(node.path)}
        className={`w-full flex items-center gap-1 py-1 px-1 hover:bg-secondary text-left text-[11px] ${isSelected ? 'bg-primary/10 text-primary' : ''}`}
        style={{ paddingLeft: `${depth * 8 + 4}px` }}
      >
        {node.type === 'folder' ? (
          <>{isOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}{isOpen ? <FolderOpen className="h-3 w-3" /> : <Folder className="h-3 w-3" />}</>
        ) : (
          <><span className="w-2.5" /><FileCode className="h-3 w-3" /></>
        )}
        <span className="truncate flex-1">{node.name}</span>
        {node.type === 'file' && isSelected && <Check className="h-2.5 w-2.5" />}
      </button>
      {node.type === 'folder' && isOpen && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} selectedFiles={selectedFiles} onToggleFile={onToggleFile} />
      ))}
    </div>
  );
}

export function LeftSidebar({ isCollapsed, onToggle, project, projectId, onPlanningApplied }: LeftSidebarProps) {
  const { data: projectFiles } = useProjectFiles(projectId);
  const contextFileTree = projectFiles && projectFiles.length > 0 ? projectFiles : [];

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['chat', 'github'])
  );
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Planning LLM state
  const [pendingPreview, setPendingPreview] = useState<ChatPreviewResponse['preview'] | null>(null);
  const [pendingActions, setPendingActions] = useState<ChatPreviewResponse['actions']>([]);
  const [pendingErrors, setPendingErrors] = useState<ChatPreviewResponse['errors']>([]);
  const [isApplying, setIsApplying] = useState(false);
  
  // GitHub state
  const [githubConnected, setGithubConnected] = useState(false);
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);
  const repoName = 'acme/servicepro-app';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const addMessage = (role: 'user' | 'agent', content: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content }]);
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    addMessage('user', text);
    setInput('');
    setIsThinking(true);

    if (!projectId) {
      setIsThinking(false);
      addMessage('agent', 'No project selected. Please select or create a project first.');
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as ChatPreviewResponse;
      if (!res.ok) {
        addMessage('agent', data.message ?? 'Planning service error. Try again.');
        return;
      }
      setPendingActions(data.actions ?? []);
      setPendingPreview(data.preview ?? null);
      setPendingErrors(data.errors ?? []);
      if (data.preview) {
        addMessage('agent', data.preview.summary);
      } else if (data.errors?.length) {
        addMessage('agent', `${data.errors.length} action(s) could not be applied. Check the preview.`);
      } else {
        addMessage('agent', data.message ?? 'No changes suggested. Try rephrasing your request.');
      }
    } catch {
      addMessage('agent', 'Planning service unavailable. Check your connection.');
    } finally {
      setIsThinking(false);
    }
  };

  const handleAcceptPreview = async () => {
    if (!projectId || !pendingActions?.length) return;
    setIsApplying(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions: pendingActions }),
      });
      const data = await res.json();
      if (res.ok && (data.applied ?? 0) > 0) {
        setPendingPreview(null);
        setPendingActions([]);
        setPendingErrors([]);
        onPlanningApplied?.();
        addMessage('agent', `Applied ${data.applied ?? (pendingActions?.length ?? 0)} change(s).`);
      } else {
        addMessage('agent', data.message ?? data.details?.validation?.[0] ?? 'Failed to apply changes.');
      }
    } catch {
      addMessage('agent', 'Failed to apply changes. Try again.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancelPreview = () => {
    setPendingPreview(null);
    setPendingActions([]);
    setPendingErrors([]);
  };

  const toggleContextFile = (path: string) => {
    setSelectedContextFiles(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const statusColors = {
    active: 'bg-green-900 text-green-50',
    planning: 'bg-yellow-900 text-yellow-50',
    completed: 'bg-gray-700 text-gray-50',
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-grid-line bg-background flex flex-col items-center py-4 gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggle(false)}
          className="h-8 w-8 p-0"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-grid-line bg-background overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-grid-line">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1">
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
              {project.name}
            </h2>
            <span className={`inline-block mt-2 px-2 py-1 text-xs uppercase tracking-wider font-mono ${statusColors[project.status]}`}>
              {project.status}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(true)}
            className="h-6 w-6 p-0"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-2">
          {project.description}
        </p>
      </div>


      {/* Agent Chat Section */}
      <div className="border-b border-grid-line flex-1 flex flex-col min-h-0">
        <button
          onClick={() => toggleSection('chat')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors shrink-0"
        >
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" />
            <span className="text-xs uppercase tracking-wider font-mono font-bold">Agent</span>
          </div>
          {expandedSections.has('chat') ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        {expandedSections.has('chat') && (
          <div className="flex-1 flex flex-col min-h-0 border-t border-grid-line">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[200px]">
              {messages.length === 0 && (
                <div className="text-center py-4">
                  <Bot className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-[11px] text-muted-foreground">Describe what you want to build</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                    {msg.role === 'user' ? <User className="h-2.5 w-2.5" /> : <Bot className="h-2.5 w-2.5" />}
                  </div>
                  <div className={`max-w-[85%] rounded px-2 py-1.5 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
                    <p className="text-[11px] leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isThinking && (
                messages.length === 0 ? (
                  <ChatSkeleton />
                ) : (
                  <div className="flex gap-2">
                    <div className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center shrink-0">
                      <Bot className="h-2.5 w-2.5" />
                    </div>
                    <Skeleton className="h-12 w-48 rounded-lg shrink-0" />
                  </div>
                )
              )}
              {pendingPreview && (
                <ChatPreviewPanel
                  preview={pendingPreview}
                  errors={normalizePreviewErrors(pendingErrors)}
                  onAccept={handleAcceptPreview}
                  onCancel={handleCancelPreview}
                  isApplying={isApplying}
                />
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Input */}
            <div className="p-3 border-t border-grid-line">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit())}
                  placeholder="Describe what you want to build..."
                  className="flex-1 px-2 py-1.5 text-xs bg-secondary border border-grid-line rounded focus:outline-none focus:ring-1 focus:ring-primary/50"
                  disabled={isThinking}
                />
                <Button size="sm" className="h-7 w-7 p-0" onClick={handleSubmit} disabled={!input.trim() || isThinking}>
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* GitHub Section */}
      <div className="border-b border-grid-line">
        <button
          onClick={() => toggleSection('github')}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors"
        >
          <div className="flex items-center gap-2">
            <Github className="h-3.5 w-3.5" />
            <span className="text-xs uppercase tracking-wider font-mono font-bold">Repository</span>
          </div>
          {expandedSections.has('github') ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        {expandedSections.has('github') && (
          <div className="px-3 pb-3 border-t border-grid-line pt-3">
            {githubConnected ? (
              <>
                <div className="flex items-center gap-2 px-2 py-1.5 bg-secondary rounded border border-grid-line mb-2">
                  <Github className="h-3 w-3" />
                  <span className="text-[11px] font-mono flex-1 truncate">{repoName}</span>
                  <Check className="h-3 w-3 text-green-500" />
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Select files for context:
                </p>
                <div className="border border-grid-line rounded bg-background max-h-32 overflow-y-auto">
                  {contextFileTree.map((node) => (
                    <FileTreeNode key={node.path} node={node} selectedFiles={selectedContextFiles} onToggleFile={toggleContextFile} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground mb-2">Connect a repo to include existing code as context.</p>
                <Button variant="outline" size="sm" className="w-full text-[11px] h-7 bg-transparent" onClick={() => setGithubConnected(true)}>
                  <Github className="h-3 w-3 mr-1.5" />Connect Repository
                </Button>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
