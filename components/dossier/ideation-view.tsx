'use client';

import React from "react"

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';

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

export function IdeationView({ onComplete }: IdeationViewProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userIdea, setUserIdea] = useState('');
  const [phase, setPhase] = useState<'input' | 'questions' | 'generating'>('input');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    // Simulate agent thinking
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
      // All questions answered, generate the map
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
      
      // Acknowledge and move to next question
      const acknowledgments = [
        'Got it, that helps!',
        'Thanks, that\'s useful context.',
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
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">New Project</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Describe your product idea and I'll help you create an implementation roadmap.
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-secondary mb-4">
                <Bot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-medium text-foreground mb-2">What would you like to build?</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Describe your product idea, feature, or problem you want to solve. I'll ask clarifying questions and generate an implementation plan.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {message.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-foreground'
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="bg-secondary rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              </div>
              <div className="bg-primary/10 rounded-lg px-4 py-3 flex-1">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-primary font-medium">Generating implementation roadmap...</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: '80%' }} />
                  <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: '60%' }} />
                  <div className="h-2 bg-primary/20 rounded animate-pulse" style={{ width: '70%' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Answer Options */}
      {currentQuestion?.options && phase === 'questions' && !isThinking && (
        <div className="px-8 pb-2">
          <div className="max-w-2xl mx-auto">
            <div className="flex flex-wrap gap-2">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleAnswerQuestion(option)}
                  className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 text-foreground rounded-full border border-border transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      {phase !== 'generating' && (
        <div className="border-t border-border px-8 py-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  phase === 'input'
                    ? 'Describe your product idea...'
                    : 'Type your answer...'
                }
                className="flex-1 px-4 py-3 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isThinking}
              />
              <button
                onClick={phase === 'input' ? handleSubmitIdea : () => handleAnswerQuestion()}
                disabled={!input.trim() || isThinking}
                className="px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Press Enter to send
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
