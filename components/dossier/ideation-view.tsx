'use client';

import React from 'react';
import { useState, useRef, useEffect } from 'react';
import { 
  Send, Bot, User, Loader2, Sparkles, Github, Check, FileCode, Plus, X, 
  ChevronDown, ChevronUp, FileText, Upload, Link, FolderOpen, Folder,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Message {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface ClarifyingQuestion {
  id: string;
  question: string;
  options?: string[];
}

interface ContextFile {
  id: string;
  name: string;
  path: string;
  type: 'code' | 'doc' | 'schema';
}

interface IdeationViewProps {
  onComplete: (request: string) => void;
}

const initialQuestions: ClarifyingQuestion[] = [
  {
    id: 'q1',
    question: 'Who are the primary users of this product?',
    options: ['Small business owners', 'Enterprise teams', 'Consumers', 'Field workers'],
  },
  {
    id: 'q2',
    question: 'What\'s the most critical workflow they need to accomplish?',
  },
  {
    id: 'q3',
    question: 'Do you have existing systems this needs to integrate with?',
    options: ['Accounting software', 'CRM', 'Calendar/scheduling', 'Payment processing', 'None yet'],
  },
];

// Mock GitHub repo file tree
interface FileNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileNode[];
}

const mockFileTree: FileNode[] = [
  {
    name: 'src',
    type: 'folder',
    path: '/src',
    children: [
      {
        name: 'components',
        type: 'folder',
        path: '/src/components',
        children: [
          { name: 'Dashboard.tsx', type: 'file', path: '/src/components/Dashboard.tsx' },
          { name: 'CustomerList.tsx', type: 'file', path: '/src/components/CustomerList.tsx' },
          { name: 'InvoiceTable.tsx', type: 'file', path: '/src/components/InvoiceTable.tsx' },
        ],
      },
      {
        name: 'api',
        type: 'folder',
        path: '/src/api',
        children: [
          { name: 'customers.ts', type: 'file', path: '/src/api/customers.ts' },
          { name: 'invoices.ts', type: 'file', path: '/src/api/invoices.ts' },
        ],
      },
      {
        name: 'hooks',
        type: 'folder',
        path: '/src/hooks',
        children: [
          { name: 'useCustomers.ts', type: 'file', path: '/src/hooks/useCustomers.ts' },
        ],
      },
    ],
  },
  {
    name: 'prisma',
    type: 'folder',
    path: '/prisma',
    children: [
      { name: 'schema.prisma', type: 'file', path: '/prisma/schema.prisma' },
    ],
  },
];

function FileTreeNode({
  node,
  depth = 0,
  selectedFiles,
  onToggleFile,
}: {
  node: FileNode;
  depth?: number;
  selectedFiles: string[];
  onToggleFile: (path: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth < 2);
  const isSelected = selectedFiles.includes(node.path);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (node.type === 'folder') {
            setIsOpen(!isOpen);
          } else {
            onToggleFile(node.path);
          }
        }}
        className={`w-full flex items-center gap-1.5 py-1.5 px-2 hover:bg-secondary text-left group transition-colors ${
          isSelected ? 'bg-primary/10 text-primary' : ''
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'folder' ? (
          <>
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </>
        ) : (
          <>
            <span className="w-3" />
            <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
          </>
        )}
        <span className="text-xs truncate flex-1">{node.name}</span>
        {node.type === 'file' && isSelected && (
          <Check className="h-3 w-3 text-primary" />
        )}
      </button>
      {node.type === 'folder' && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFiles={selectedFiles}
              onToggleFile={onToggleFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function IdeationView({ onComplete }: IdeationViewProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userIdea, setUserIdea] = useState('');
  const [phase, setPhase] = useState<'input' | 'questions' | 'generating'>('input');
  const [selectedContextFiles, setSelectedContextFiles] = useState<string[]>([]);
  const [contextDocs, setContextDocs] = useState<ContextFile[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['github', 'context']));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mock GitHub connection - toggle to false to see unconnected state
  const [githubConnected, setGithubConnected] = useState(true);
  const repoName = 'acme/servicepro-app';

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const toggleContextFile = (path: string) => {
    setSelectedContextFiles((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const addContextDoc = () => {
    const newDoc: ContextFile = {
      id: crypto.randomUUID(),
      name: 'New Document',
      path: '',
      type: 'doc',
    };
    setContextDocs((prev) => [...prev, newDoc]);
  };

  const removeContextDoc = (id: string) => {
    setContextDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const addMessage = (role: 'user' | 'agent', content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role, content, timestamp: new Date() },
    ]);
  };

  const handleSubmitIdea = () => {
    if (!input.trim()) return;

    const idea = input.trim();
    setUserIdea(idea);
    addMessage('user', idea);
    setInput('');
    setIsThinking(true);

    setTimeout(() => {
      setIsThinking(false);
      addMessage(
        'agent',
        `Great idea! I'd like to understand your vision better so I can create a comprehensive implementation plan. Let me ask a few clarifying questions.`
      );

      setTimeout(() => {
        setPhase('questions');
        askQuestion(0);
      }, 800);
    }, 1500);
  };

  const askQuestion = (index: number) => {
    if (index >= initialQuestions.length) {
      setPhase('generating');
      addMessage('agent', 'Perfect! I have enough context now. Let me generate your implementation roadmap...');

      setTimeout(() => {
        onComplete(userIdea);
      }, 2500);
      return;
    }

    const q = initialQuestions[index];
    setCurrentQuestionIndex(index);

    setTimeout(() => {
      addMessage('agent', q.question);
    }, 500);
  };

  const handleAnswerQuestion = (answer?: string) => {
    const response = answer || input.trim();
    if (!response) return;

    addMessage('user', response);
    setInput('');
    setIsThinking(true);

    setTimeout(() => {
      setIsThinking(false);

      const acknowledgments = [
        'Got it, that helps!',
        "Thanks, that's useful context.",
        'Understood!',
        'Great, that gives me a clearer picture.',
      ];

      addMessage('agent', acknowledgments[currentQuestionIndex % acknowledgments.length]);

      setTimeout(() => {
        askQuestion(currentQuestionIndex + 1);
      }, 600);
    }, 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (phase === 'input') {
        handleSubmitIdea();
      } else if (phase === 'questions') {
        handleAnswerQuestion();
      }
    }
  };

  const currentQuestion = phase === 'questions' ? initialQuestions[currentQuestionIndex] : null;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left Sidebar - GitHub & Context */}
      <div className="w-72 border-r border-border bg-background flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-mono text-sm font-bold uppercase tracking-wider text-foreground">
                New Project
              </h1>
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono bg-yellow-900 text-yellow-50">
                Planning
              </span>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1">
          {/* GitHub Section */}
          <div className="border-b border-border">
            <button
              onClick={() => toggleSection('github')}
              className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                <Github className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider font-mono font-bold">Repository</span>
              </div>
              {expandedSections.has('github') ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </button>
            {expandedSections.has('github') && (
              <div className="px-4 pb-4 border-t border-border pt-3">
                {githubConnected ? (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded border border-border mb-3">
                      <Github className="h-4 w-4 text-foreground" />
                      <span className="text-xs font-mono text-foreground flex-1 truncate">{repoName}</span>
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    </div>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      Select files to include as context for planning.
                    </p>
                    <div className="border border-border rounded bg-background max-h-64 overflow-y-auto">
                      {mockFileTree.map((node) => (
                        <FileTreeNode
                          key={node.path}
                          node={node}
                          selectedFiles={selectedContextFiles}
                          onToggleFile={toggleContextFile}
                        />
                      ))}
                    </div>
                    {selectedContextFiles.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {selectedContextFiles.map((path) => (
                          <div
                            key={path}
                            className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-[10px] rounded"
                          >
                            <span>{path.split('/').pop()}</span>
                            <button onClick={() => toggleContextFile(path)} className="hover:bg-primary/20 rounded p-0.5">
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Connect a GitHub repo to include existing code as context.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs bg-transparent"
                      onClick={() => setGithubConnected(true)}
                    >
                      <Github className="h-3.5 w-3.5 mr-2" />
                      Connect Repository
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Context Documents Section */}
          <div className="border-b border-border">
            <button
              onClick={() => toggleSection('context')}
              className="w-full flex items-center justify-between p-4 hover:bg-secondary transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider font-mono font-bold">
                  Context Docs ({contextDocs.length})
                </span>
              </div>
              {expandedSections.has('context') ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </button>
            {expandedSections.has('context') && (
              <div className="px-4 pb-4 border-t border-border pt-3 space-y-2">
                <p className="text-[11px] text-muted-foreground mb-3">
                  Add documents, specs, or links to inform planning.
                </p>
                {contextDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 p-2 rounded border border-border hover:bg-secondary transition-colors group"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-mono text-foreground flex-1 truncate">{doc.name}</span>
                    <button
                      onClick={() => removeContextDoc(doc.id)}
                      className="opacity-0 group-hover:opacity-100 hover:bg-secondary rounded p-1 transition-opacity"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8 bg-transparent" onClick={addContextDoc}>
                    <Upload className="h-3 w-3 mr-1.5" />
                    Upload
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8 bg-transparent" onClick={addContextDoc}>
                    <Link className="h-3 w-3 mr-1.5" />
                    Add Link
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Center - Chat */}
      <div className="flex-1 flex flex-col bg-background">
        {/* Chat Header */}
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-sm font-medium text-foreground">Describe your idea</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Tell me what you want to build and I'll create an implementation roadmap.
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-secondary mb-4">
                  <Bot className="h-6 w-6 text-muted-foreground" />
                </div>
                <h2 className="text-base font-medium text-foreground mb-2">What would you like to build?</h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Describe your product idea or feature. I'll ask a few questions then generate a plan.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                  }`}
                >
                  {message.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="bg-secondary rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {phase === 'generating' && (
              <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse" />
                </div>
                <div className="bg-primary/10 rounded-lg px-3 py-2 flex-1 max-w-[80%]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="text-sm text-primary font-medium">Generating roadmap...</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div className="h-1.5 bg-primary/20 rounded animate-pulse" style={{ width: '80%' }} />
                    <div className="h-1.5 bg-primary/20 rounded animate-pulse" style={{ width: '60%' }} />
                    <div className="h-1.5 bg-primary/20 rounded animate-pulse" style={{ width: '70%' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Quick Options */}
        {currentQuestion?.options && phase === 'questions' && !isThinking && (
          <div className="px-6 pb-2">
            <div className="max-w-2xl mx-auto flex flex-wrap gap-2">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleAnswerQuestion(option)}
                  className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground rounded-full border border-border transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        {phase !== 'generating' && (
          <div className="border-t border-border px-6 py-4">
            <div className="max-w-2xl mx-auto flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={phase === 'input' ? 'Describe your product idea...' : 'Type your answer...'}
                className="flex-1 px-4 py-2.5 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isThinking}
              />
              <button
                onClick={phase === 'input' ? handleSubmitIdea : () => handleAnswerQuestion()}
                disabled={!input.trim() || isThinking}
                className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
