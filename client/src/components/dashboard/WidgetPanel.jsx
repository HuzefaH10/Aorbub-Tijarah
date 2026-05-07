import React, { useState, useRef } from 'react';
import { X, Check, Edit2, LayoutGrid, BarChart2, Table as TableIcon, UploadCloud, GripVertical, AlertTriangle } from 'lucide-react';

export default function WidgetPanel({ widgets, onToggle, onRename, onRemove, onOpenPicker, onReorder, onOpenCsvUploader }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const startEdit = (w) => {
    setEditingId(w.id);
    setEditName(w.name);
  };

  const saveEdit = (id) => {
    if (editName.trim()) onRename(id, editName.trim());
    setEditingId(null);
  };

  // Drag-to-reorder handlers
  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOverItem.current = index; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const reordered = [...widgets];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    dragItem.current = null;
    dragOverItem.current = null;
    onReorder(reordered);
  };

  return (
    <div className="w-full h-full glass !border-r-0 !border-y-0 !rounded-none flex flex-col shadow-xl">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-2 shrink-0">
        <LayoutGrid size={18} className="text-primary-500" />
        <h2 className="font-bold text-white font-heading">Dashboard Widgets</h2>
        <div className="ml-auto group relative cursor-help">
          <div className="w-5 h-5 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center text-xs font-bold">?</div>
          <div className="absolute right-0 top-full mt-2 w-52 bg-gray-900 border border-white/10 text-white text-xs p-2.5 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 leading-relaxed">
            Toggle widgets on/off. Drag <GripVertical size={10} className="inline" /> to reorder. Click name to rename.
          </div>
        </div>
      </div>

      {/* Widget List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {widgets.length === 0 ? (
          <p className="text-center text-xs text-gray-500 mt-6 italic">No widgets yet. Add a chart or table below.</p>
        ) : (
          widgets.map((w, index) => (
            <div
              key={w.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnter={() => handleDragEnter(index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={`glass transition-all select-none ${w.enabled ? '' : 'opacity-50'}`}
            >
              {/* Card top row */}
              <div className="flex items-center gap-2 p-3 pb-2">
                {/* Drag handle */}
                <GripVertical size={14} className="text-gray-600 cursor-grab active:cursor-grabbing shrink-0" />

                {/* Name / Edit */}
                {editingId === w.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(w.id)}
                    onBlur={() => saveEdit(w.id)}
                    className="flex-1 bg-gray-900 border border-primary-500 rounded-lg px-2 py-1 text-xs text-white outline-none"
                  />
                ) : (
                  <h3
                    className="flex-1 text-sm font-semibold text-white truncate cursor-pointer hover:text-primary-400 transition-colors flex items-center gap-1 group"
                    onClick={() => startEdit(w)}
                  >
                    {w.name}
                    <Edit2 size={9} className="opacity-0 group-hover:opacity-60 shrink-0" />
                  </h3>
                )}

                {/* Toggle */}
                <button
                  onClick={() => onToggle(w.id)}
                  className={`relative w-8 h-4 rounded-full shrink-0 transition-colors ${w.enabled ? 'bg-primary-500' : 'bg-gray-700'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${w.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Card bottom row */}
              <div className="flex items-center justify-between px-3 pb-3">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold bg-gray-800 px-2 py-0.5 rounded">
                  {w.isChart ? 'Chart' : 'Table'}
                </span>

                {/* Delete with inline confirmation */}
                {confirmDeleteId === w.id ? (
                  <div className="flex items-center gap-1.5 bg-red-900/30 border border-red-500/30 rounded-xl px-2.5 py-1.5 animate-fadeIn">
                    <AlertTriangle size={11} className="text-red-400 shrink-0" />
                    <span className="text-[11px] text-red-300 whitespace-nowrap">Remove widget?</span>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[10px] font-bold text-gray-400 hover:text-white px-1.5 py-0.5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => { onRemove(w.id); setConfirmDeleteId(null); }}
                      className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 px-2 py-0.5 rounded-lg transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(w.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-900/20"
                    title="Remove Widget"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-white/10 space-y-2 bg-black/10 shrink-0">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onOpenPicker('chart')}
            className="flex items-center justify-center gap-1.5 glass text-white py-2.5 rounded-xl text-xs font-bold hover:border-primary-500 hover:text-primary-400 transition-all"
          >
            <BarChart2 size={14} /> Add Chart
          </button>
          <button
            onClick={() => onOpenPicker('table')}
            className="flex items-center justify-center gap-1.5 glass text-white py-2.5 rounded-xl text-xs font-bold hover:border-primary-500 hover:text-primary-400 transition-all"
          >
            <TableIcon size={14} /> Add Table
          </button>
        </div>

        <button
          onClick={() => onOpenCsvUploader?.()}
          className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-primary-700 hover:-translate-y-0.5 transition-all shadow-lg shadow-primary-600/30"
        >
          <UploadCloud size={18} className="animate-pulse" /> Upload CSV / Excel
        </button>
      </div>
    </div>
  );
}
