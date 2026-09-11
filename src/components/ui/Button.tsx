"use client";

import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  className?: string;
}

const variants: Record<string, string> = {
  // The amber marker. One primary action per view.
  primary:
    'bg-amber-400 text-ink-950 font-semibold hover:bg-amber-300 shadow-[0_6px_20px_-8px_rgba(247,185,85,0.55)]',
  secondary:
    'bg-ink-800 text-chalk-200 border border-ink-600 hover:bg-ink-700 hover:border-ink-500 hover:text-chalk-100',
  outline:
    'bg-transparent text-chalk-300 border border-ink-600 hover:border-amber-400/50 hover:text-chalk-100 hover:bg-amber-400/[0.06]',
  ghost:
    'bg-transparent text-chalk-400 hover:text-chalk-100 hover:bg-chalk-100/[0.05]',
  danger:
    'bg-transparent text-alert-400 border border-alert-500/30 hover:bg-alert-500/10 hover:border-alert-500/50',
};

const sizes: Record<string, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-xl',
};

const iconSizes: Record<string, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-[18px] h-[18px]',
};

export default function Button({
  children,
  onClick,
  icon: Icon,
  iconRight: IconRight,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  type = 'button',
  title,
  className = '',
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      title={title}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { y: 0, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative inline-flex items-center justify-center whitespace-nowrap',
        'transition-colors duration-150',
        'disabled:opacity-40 disabled:pointer-events-none',
        variant === 'primary' ? 'sweep-host' : '',
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {Icon && <Icon className={`${iconSizes[size]} shrink-0`} />}
      {children}
      {IconRight && <IconRight className={`${iconSizes[size]} shrink-0`} />}
    </motion.button>
  );
}
