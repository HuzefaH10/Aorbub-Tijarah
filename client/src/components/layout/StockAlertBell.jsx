import { useState, useRef, useEffect } from 'react';
import { Bell, X, AlertTriangle, XCircle, ShoppingCart } from 'lucide-react';
import { useStockAlerts } from '../../context/StockAlertContext';
import { useNavigate } from 'react-router-dom';

export default function StockAlertBell() {
  const { alerts, outCount, lowCount } = useStockAlerts();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const navigate = useNavigate();

  const totalCount = outCount + lowCount;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleRestock = (productId) => {
    setOpen(false);
    // Navigate to inventory with a hint to open the quick-load for that product
    navigate(`/inventory?restock=${productId}`);
  };

  if (totalCount === 0) {
    return (
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        title="Stock Alerts"
      >
        <Bell size={20} />
      </button>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
        title="Stock Alerts"
      >
        <Bell size={20} className={open ? 'text-amber-400' : 'animate-[bellRing_1.5s_ease-in-out_infinite]'} />
        {/* Badge */}
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full shadow-lg shadow-red-500/40 leading-none">
          {totalCount > 99 ? '99+' : totalCount}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 animate-fadeIn origin-top-right z-50">
          <div className="glass-opaque rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div>
                <p className="text-sm font-bold text-white">Stock Alerts</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {outCount > 0 && `${outCount} out of stock`}
                  {outCount > 0 && lowCount > 0 && ' · '}
                  {lowCount > 0 && `${lowCount} low stock`}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Alert list */}
            <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-white/5">
              {alerts.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                  {/* Status icon */}
                  <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    item.status === 'out'
                      ? 'bg-red-500/10 border border-red-500/20'
                      : 'bg-amber-500/10 border border-amber-500/20'
                  }`}>
                    {item.status === 'out'
                      ? <XCircle size={16} className="text-red-400" />
                      : <AlertTriangle size={16} className="text-amber-400" />
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                        item.status === 'out'
                          ? 'bg-red-400/10 text-red-400'
                          : 'bg-amber-400/10 text-amber-400'
                      }`}>
                        {item.status === 'out' ? 'Out of Stock' : 'Low Stock'}
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {item.currentStock} / {item.threshold} {item.unit}
                      </span>
                    </div>
                  </div>

                  {/* Restock */}
                  <button
                    onClick={() => handleRestock(item.id)}
                    title="Restock"
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-primary-600/20 hover:bg-primary-600 text-primary-400 hover:text-white rounded-lg text-xs font-bold transition-all"
                  >
                    <ShoppingCart size={12} />
                    Restock
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02]">
              <button
                onClick={() => { setOpen(false); navigate('/inventory'); }}
                className="w-full text-center text-xs font-bold text-primary-400 hover:text-primary-300 transition-colors"
              >
                View all in Inventory →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
