import type { Variants, Transition } from 'framer-motion';

// Shared easing — smooth, no bounce, no overshoot
export const ease = [0.25, 0.1, 0.25, 1] as const;
export const easeOut = [0, 0, 0.2, 1] as const;

// Default transition
export const smooth: Transition = {
  duration: 0.3,
  ease,
};

// ── Stagger container ──────────────────────────────────────────────
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
};

// ── Fade in + slight rise ──────────────────────────────────────────
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease },
  },
};

// ── Simple fade ────────────────────────────────────────────────────
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease },
  },
};

// ── Scale in (for modals/overlays) ─────────────────────────────────
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.15, ease },
  },
};

// ── Slide up (for drawers/panels) ──────────────────────────────────
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease },
  },
};

// ── Spring configs ─────────────────────────────────────────────────
export const springSnappy: Transition = { type: 'spring', stiffness: 500, damping: 30 };
export const springGentle: Transition = { type: 'spring', stiffness: 300, damping: 25 };

// ── Page transition — fast to avoid perceived lag on navigation ────
export const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15, ease } },
  exit: { opacity: 0, transition: { duration: 0.08, ease } },
};

// ── Table row stagger (30ms per row) ───────────────────────────────
export const tableStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.03 },
  },
};

export const tableRow: Variants = {
  hidden: { opacity: 0, x: -4 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.25, ease } },
};

// ── Button tap scale ───────────────────────────────────────────────
export const tapScale = { scale: 0.97 };
