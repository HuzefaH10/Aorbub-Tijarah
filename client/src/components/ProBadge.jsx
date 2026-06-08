import React from 'react';
import { usePlan } from '../hooks/usePlan';

export default function ProBadge({ size = 'sm', className = '' }) {
  const { isFree } = usePlan();

  if (!isFree) return null;

  const sizeClasses = size === 'sm' 
    ? 'px-1.5 py-0.5 text-[9px] leading-none' 
    : 'px-2 py-1 text-[10px] leading-tight';

  return (
    <span className={`inline-flex items-center font-bold uppercase tracking-wider rounded text-amber-700 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-300/50 dark:border-amber-500/30 shadow-[0_0_6px_rgba(245,158,11,0.15)] dark:shadow-[0_0_8px_rgba(245,158,11,0.2)] select-none ${sizeClasses} ${className}`}>
      PRO
    </span>
  );
}
