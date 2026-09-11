"use client";

import { ReactNode, Key } from 'react';
import { motion } from 'motion/react';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'panel' | 'raised' | 'quiet' | 'accent';
  onClick?: () => void;
  id?: string;
  key?: Key;
  /** Adds the hairline highlight along the top edge. On by default. */
  edge?: boolean;
  /** Entrance animation delay, in seconds — for staggering a list. */
  delay?: number;
}

const variants: Record<string, string> = {
  panel: 'panel',
  raised: 'panel-raised',
  quiet: 'bg-ink-900/50 border border-ink-800',
  accent: 'bg-amber-400/[0.05] border border-amber-400/20',
};

export default function Card({
  children,
  className = '',
  variant = 'panel',
  onClick,
  id,
  edge = true,
  delay = 0,
}: CardProps) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={onClick ? { y: -3 } : undefined}
      onClick={onClick}
      className={[
        'rounded-[var(--radius-card)] transition-colors duration-200',
        variants[variant],
        edge ? 'edge-light' : '',
        onClick ? 'cursor-pointer hover:border-ink-500' : '',
        className,
      ].join(' ')}
    >
      {children}
    </motion.div>
  );
}
