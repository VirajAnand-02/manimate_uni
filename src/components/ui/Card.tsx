import { ReactNode, Key } from 'react';
import { motion } from 'motion/react';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'glass' | 'solid' | 'gradient';
  glow?: 'blue' | 'green' | 'none';
  onClick?: () => void;
  id?: string;
  key?: Key;
}

export default function Card({ children, className = '', variant = 'glass', glow = 'none', onClick, id }: CardProps) {
  const baseStyles = "rounded-2xl p-6 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]";
  
  const variants = {
    glass: "bg-zinc-900/40 backdrop-blur-xl border border-white/5 shadow-2xl",
    solid: "bg-zinc-950 border border-zinc-800/50 shadow-2xl",
    gradient: "bg-gradient-to-br from-brand-950/40 to-black border border-brand-500/10 shadow-2xl"
  };

  const glows = {
    blue: "glow-blue",
    green: "glow-white", // Changed to white for power feel
    none: ""
  };

  return (
    <motion.div
      whileHover={onClick ? { y: -5, scale: 1.01 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={`
        ${baseStyles} 
        ${variants[variant]} 
        ${glows[glow]} 
        ${className}
        ${onClick ? 'cursor-pointer hover:border-white/20' : ''}
      `}
    >
      {children}
    </motion.div>
  );
}
