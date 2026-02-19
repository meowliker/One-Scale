'use client';

import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from '@/types/ai';

interface ChatMessageProps {
  message: ChatMessageType;
}

/**
 * Renders markdown-like formatting: **bold**, bullet lists, tables, headers.
 */
function formatContent(content: string) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-2">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              {tableRows[0].map((cell, i) => (
                <th
                  key={i}
                  className="text-left px-2 py-1 border-b border-gray-300 font-semibold"
                >
                  {cell.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.slice(2).map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-2 py-1 border-b border-gray-200">
                    {cell.trim()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect table rows (lines starting and ending with |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) inTable = true;
      tableRows.push(
        line
          .trim()
          .slice(1, -1)
          .split('|')
      );
      continue;
    } else if (inTable) {
      inTable = false;
      flushTable();
    }

    // Blank line
    if (line.trim() === '') {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Header lines (bold with ** on both ends only)
    if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(
        <p key={i} className="font-semibold mt-2 mb-1">
          {line.slice(2, -2)}
        </p>
      );
      continue;
    }

    // Numbered list items (1. ..., 2. ...)
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedMatch) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-gray-400 shrink-0">{numberedMatch[1]}.</span>
          <span dangerouslySetInnerHTML={{ __html: inlineBold(numberedMatch[2]) }} />
        </div>
      );
      continue;
    }

    // Bullet list items
    if (line.startsWith('- ')) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-gray-400 shrink-0">&bull;</span>
          <span dangerouslySetInnerHTML={{ __html: inlineBold(line.slice(2)) }} />
        </div>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p
        key={i}
        className="my-0.5"
        dangerouslySetInnerHTML={{ __html: inlineBold(line) }}
      />
    );
  }

  // Flush any remaining table
  if (inTable) flushTable();

  return elements;
}

/** Replace **text** with <strong>text</strong> in a string */
function inlineBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('flex gap-3 mb-4', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-blue-600' : 'bg-gray-200'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-gray-600" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-800 rounded-bl-md'
        )}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="space-y-0">{formatContent(message.content)}</div>
        )}
        <p
          className={cn(
            'text-[10px] mt-2',
            isUser ? 'text-blue-200 text-right' : 'text-gray-400'
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}
