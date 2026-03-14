'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface SectionWrapperProps {
  label: string;
  tag?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function SectionWrapper({ label, tag, toolbar, children }: SectionWrapperProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="pt-8 pb-8 border-t border-border"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold uppercase tracking-[0.1em] text-text-primary">
            {label}
          </h2>
          {tag && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              {tag}
            </span>
          )}
        </div>
        {toolbar && <div className="flex items-center gap-1.5">{toolbar}</div>}
      </div>
      {children}
    </motion.section>
  );
}
