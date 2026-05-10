import React from 'react';
import { X, Package, TrendingUp, Clock, User, Inbox } from 'lucide-react';
import { useStockHistory } from '../../hooks/useFirestore';
import Pagination from '../ui/Pagination';

const PAGE_SIZE = 20;

export default function ProductHistoryDrawer({ product, onClose }) {
  const { history, loading } = useStockHistory(product.id);
  const [page, setPage] = React.useState(1);

  const visible = history.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasMore = history.length > visible.length;

  const formatTs = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-[60] flex bg-black/70 backdrop-blur-sm animate-fadeIn">
      {/* Backdrop click closes */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer panel */}
      <div className="w-full max-w-md h-full flex flex-col bg-gray-950 border-l border-white/10 shadow-2xl animate-[slideInRight_0.25s_ease-out_forwards]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600/15 rounded-xl">
              <Package size={18} className="text-primary-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white font-heading truncate">Stock History</h2>
              <p className="text-xs text-gray-500 truncate">{product.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-900/60 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-primary-400" />
            <span className="text-xs text-gray-400">{history.length} load{history.length !== 1 ? 's' : ''} total</span>
          </div>
          <div className="flex items-center gap-2">
            <Package size={14} className="text-green-400" />
            <span className="text-xs text-gray-400">
              Current: <span className="text-white font-bold">{product.currentStock} {product.unit}</span>
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Loading history…</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-900 border border-white/5 flex items-center justify-center">
                <Inbox size={24} className="text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-400">No stock history yet</p>
                <p className="text-xs text-gray-600 mt-1">Load stock for this product to see a history here.</p>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {visible.map((entry, i) => (
                <div
                  key={entry.id}
                  className="relative pl-8 pb-4"
                  style={{ animation: `fadeIn 0.25s ease-out ${Math.min(i, 10) * 0.04}s both` }}
                >
                  {/* Timeline line */}
                  {i < visible.length - 1 && (
                    <div className="absolute left-[13px] top-6 bottom-0 w-px bg-white/5" />
                  )}
                  {/* Timeline dot */}
                  <div className="absolute left-2 top-1.5 w-3 h-3 rounded-full bg-primary-600 border-2 border-gray-950 ring-1 ring-primary-500/40" />

                  {/* Card */}
                  <div className="bg-gray-900/70 border border-white/5 rounded-xl p-3.5 space-y-2.5">
                    {/* Qty badge + date */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-lg text-xs font-bold text-green-400">
                        <TrendingUp size={12} />
                        +{entry.quantityAdded} {entry.unit}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 shrink-0">
                        <Clock size={11} />
                        {formatTs(entry.loadedAt)}
                      </div>
                    </div>

                    {/* Stock after */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Stock after:</span>
                      <span className="font-bold text-white">{entry.stockAfter} {entry.unit}</span>
                    </div>

                    {/* Loaded by */}
                    {entry.loadedByName && (
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <div className="w-5 h-5 rounded-full bg-primary-600/20 flex items-center justify-center shrink-0">
                          <User size={10} className="text-primary-400" />
                        </div>
                        <span className="text-xs text-gray-500 truncate">{entry.loadedByName}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Pagination */}
              <div className="pt-2">
                <Pagination 
                  currentPage={page}
                  totalPages={Math.max(1, Math.ceil(history.length / PAGE_SIZE))}
                  totalCount={history.length}
                  pageSize={PAGE_SIZE}
                  onNext={() => setPage(p => p + 1)}
                  onPrevious={() => setPage(p => p - 1)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
