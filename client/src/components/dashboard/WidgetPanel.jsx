import React, { useState } from 'react';
import { X, Check, Edit2, LayoutGrid, Plus, BarChart2, Table as TableIcon } from 'lucide-react';

export default function WidgetPanel({ widgets, onToggle, onRename, onRemove, onOpenPicker }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const startEdit = (w) => {
    setEditingId(w.id);
    setEditName(w.name);
  };

  const saveEdit = (id) => {
    if (editName.trim()) {
      onRename(id, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-full h-full bg-white dark:bg-gray-950 border-l border-gray-100 dark:border-gray-800 flex flex-col shadow-xl">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <LayoutGrid size={18} className="text-primary-500" />
        <h2 className="font-bold text-gray-800 dark:text-white font-heading">Dashboard Widgets</h2>
        <div className="ml-auto group relative cursor-help">
          <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center text-xs font-bold">?</div>
          <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900 text-white text-xs p-2 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            Toggle widgets on/off, rename them, or drag them on the grid when in Edit Mode.
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {widgets.length === 0 ? (
          <p className="text-center text-xs text-gray-400 mt-4">No widgets added yet.</p>
        ) : (
          widgets.map(w => (
            <div key={w.id} className={`p-3 rounded-xl border transition-all ${w.enabled ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 shadow-sm' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800 opacity-60'}`}>
              <div className="flex items-center gap-2 mb-2">
                {editingId === w.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(w.id)}
                    onBlur={() => saveEdit(w.id)}
                    className="flex-1 bg-gray-100 dark:bg-gray-950 border border-primary-500 rounded px-2 py-1 text-xs text-gray-800 dark:text-white outline-none"
                  />
                ) : (
                  <h3 className="flex-1 text-sm font-semibold text-gray-800 dark:text-white truncate cursor-pointer hover:text-primary-500 transition-colors flex items-center gap-1 group" onClick={() => startEdit(w)}>
                    {w.name}
                    <Edit2 size={10} className="opacity-0 group-hover:opacity-100" />
                  </h3>
                )}
                
                {/* Toggle switch */}
                <button 
                  onClick={() => onToggle(w.id)}
                  className={`relative w-8 h-4 rounded-full transition-colors ${w.enabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${w.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                  {w.isChart ? 'Chart' : 'Table'}
                </span>
                <button 
                  onClick={() => onRemove(w.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Remove Widget"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2 bg-gray-50/50 dark:bg-gray-900/50">
        <button 
          onClick={() => onOpenPicker('chart')}
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white py-2.5 rounded-xl text-sm font-semibold hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-all shadow-sm"
        >
          <BarChart2 size={16} /> Add Chart
        </button>
        <button 
          onClick={() => onOpenPicker('table')}
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white py-2.5 rounded-xl text-sm font-semibold hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-all shadow-sm"
        >
          <TableIcon size={16} /> Add Table
        </button>
      </div>
    </div>
  );
}
