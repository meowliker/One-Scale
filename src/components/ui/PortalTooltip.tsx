'use client';

import { useRef, useEffect, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface PortalTooltipProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  visible: boolean;
  children: ReactNode;
  placement?: 'top' | 'bottom';
  onClose?: () => void;
}

export function PortalTooltip({ anchorRef, visible, children, placement = 'bottom', onClose }: PortalTooltipProps) {
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;

    const rect = anchorRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl?.offsetWidth || 280;
    const tooltipHeight = tooltipEl?.offsetHeight || 200;

    let top: number;
    if (placement === 'top') {
      top = rect.top - tooltipHeight - 8;
      // If tooltip would go above viewport, place below instead
      if (top < 8) {
        top = rect.bottom + 8;
      }
    } else {
      top = rect.bottom + 8;
      // If tooltip would go below viewport, place above instead
      if (top + tooltipHeight > window.innerHeight - 8) {
        top = rect.top - tooltipHeight - 8;
      }
    }

    let left = rect.left + rect.width / 2 - tooltipWidth / 2;
    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));

    setCoords({ top, left });
  }, [anchorRef, placement]);

  useEffect(() => {
    if (!visible || !anchorRef.current) return;

    updatePosition();

    // Reposition on scroll (capture phase to catch scroll inside overflow containers) and resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, anchorRef, updatePosition]);

  if (!mounted || !visible) return null;

  return createPortal(
    <>
      {/* Invisible backdrop to catch outside clicks */}
      {onClose && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
          onClick={onClose}
        />
      )}
      <div
        ref={tooltipRef}
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          zIndex: 9999,
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
