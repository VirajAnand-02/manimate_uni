import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function Button({
  children,
  onClick,
  icon: Icon,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  className = ''
}: ButtonProps) {
  const baseStyles = "relative inline-flex items-center justify-center font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl overflow-hidden group";
  
  const variants = {
    primary: "bg-brand-500 hover:bg-brand-600 text-white shadow-lg shadow-brand-500/20",
    secondary: "bg-white/10 hover:bg-white/20 text-white",
    ghost: "bg-transparent hover:bg-white/5 text-slate-400 hover:text-white",
    outline: "bg-transparent border border-white/10 hover:border-brand-500/50 text-white hover:bg-brand-500/5",
    glass: "bg-white/5 backdrop-blur-md border border-white/10 text-white hover:bg-white/10"
  };

  const sizes = {
    sm: "px-4 py-2 text-xs gap-1.5",
    md: "px-6 py-3 text-sm gap-2",
    lg: "px-8 py-4 text-base gap-3"
  };

  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseStyles} 
        ${variants[variant]} 
        ${sizes[size]} 
        ${fullWidth ? 'w-full' : ''} 
        ${className}
      `}
    >
      {/* Animated Shine Effect */}
      {variant === 'primary' && (
        <span className="absolute inset-0 w-1/2 h-full skew-x-[-35deg] bg-white/20 -translate-x-[200%] group-hover:translate-x-[300%] transition-transform duration-1000 ease-in-out" />
      )}
      
      {Icon && <Icon className={`${size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'} relative z-10`} />}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
