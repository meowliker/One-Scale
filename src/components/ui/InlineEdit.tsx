'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  type?: 'text' | 'number';
  prefix?: string;
  placeholder?: string;
}

export function InlineEdit({ value, onSave, type = 'text', prefix, placeholder }: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="inline-flex items-center">
        {prefix && <span className="mr-1 text-text-muted">{prefix}</span>}
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="rounded border border-border-focus px-2 py-1 text-sm outline-none ring-1 ring-primary bg-surface-elevated text-text-primary"
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsEditing(true)}
      className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-hover transition-colors"
    >
      {prefix && <span className="text-text-muted">{prefix}</span>}
      <span>{value || placeholder || '\u2014'}</span>
      <Pencil className="h-3.5 w-3.5 text-text-dimmed opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}
