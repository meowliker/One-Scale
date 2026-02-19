'use client';

import { cn } from '@/lib/utils';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'default',
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-text-secondary">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-lg border border-border-light px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
            variant === 'danger'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-primary hover:bg-primary-dark'
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
