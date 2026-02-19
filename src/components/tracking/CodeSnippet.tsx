'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

interface CodeSnippetProps {
  code: string;
  language?: string;
}

export function CodeSnippet({ code, language = 'html' }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-lg bg-gray-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-gray-400">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md bg-gray-700 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono text-green-400">{code}</code>
      </pre>
    </div>
  );
}
