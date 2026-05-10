import React from 'react';
import { Loader2 } from 'lucide-react';

export default function PageLoader() {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center">
      <Loader2 size={40} className="animate-spin text-primary-500 mb-4" />
      <p className="text-sm font-bold text-gray-400 animate-pulse">Loading...</p>
    </div>
  );
}
