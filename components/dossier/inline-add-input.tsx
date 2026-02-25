'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export interface InlineAddInputProps {
  placeholder: string;
  onConfirm: (title: string) => void | Promise<void>;
  onCancel?: () => void;
  buttonLabel?: string;
  className?: string;
}

export function InlineAddInput({
  placeholder,
  onConfirm,
  onCancel,
  buttonLabel = '+',
  className = '',
}: InlineAddInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setValue('');
      setIsEditing(false);
      onCancel?.();
    }
  };

  const handleConfirm = async () => {
    const trimmed = value.trim();
    if (trimmed) {
      try {
        await onConfirm(trimmed);
        setValue('');
        setIsEditing(false);
      } catch {
        // Keep input open on error
      }
    }
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (value.trim()) handleConfirm();
            else {
              setIsEditing(false);
              onCancel?.();
            }
          }}
          placeholder={placeholder}
          className="h-7 text-xs font-mono"
        />
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={`h-7 gap-1.5 text-[11px] font-mono uppercase tracking-wider border-dashed ${className}`}
      onClick={() => setIsEditing(true)}
    >
      {buttonLabel}
    </Button>
  );
}
