import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ currentPage, totalPages, onNext, onPrevious, totalCount, pageSize }) {
  if (totalCount === 0 || totalPages <= 1) return null;
  
  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalCount);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 border-t border-white/5 pt-4">
      <div className="text-xs font-bold text-gray-500">
        Showing {startIdx}–{endIdx} of {totalCount} results
      </div>
      
      <div className="flex items-center gap-4">
        <button 
          onClick={onPrevious} 
          disabled={currentPage === 1}
          className="px-4 py-2 flex items-center gap-1 text-sm font-bold text-gray-300 hover:bg-white/10 rounded-xl disabled:opacity-50 transition-colors"
        >
          <ChevronLeft size={16} /> Previous
        </button>
        <span className="text-sm font-bold text-gray-500">Page {currentPage} of {totalPages}</span>
        <button 
          onClick={onNext} 
          disabled={currentPage === totalPages}
          className="px-4 py-2 flex items-center gap-1 text-sm font-bold text-gray-300 hover:bg-white/10 rounded-xl disabled:opacity-50 transition-colors"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
