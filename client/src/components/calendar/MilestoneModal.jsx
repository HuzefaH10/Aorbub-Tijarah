import React, { useState } from 'react';
import { X, Calendar as CalendarIcon, Tag, AlignLeft, Flag } from 'lucide-react';

const CATEGORIES = ['Revenue', 'Operations', 'Team', 'Marketing', 'Other'];

export default function MilestoneModal({ editId, data, onClose, onSave, toast }) {
  const today = new Date().toISOString().split('T')[0];

  const [f, setF] = useState(() => ({
    title: data?.title || '',
    date: data?.date || today,
    category: data?.category || 'Revenue',
    description: data?.description || '',
  }));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return toast('Milestone title is required', 'error');
    if (!f.date) return toast('Date is required', 'error');

    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(),
        date: f.date,
        category: f.category,
        description: f.description.trim() || null,
      };
      await onSave(editId, payload); // Works for both add and edit if handled in parent
      toast(editId ? 'Milestone updated' : 'Milestone added');
      onClose();
    } catch { toast('Error saving milestone', 'error'); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";
  const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="glass w-full max-w-lg shadow-2xl scale-95 animate-[scaleIn_0.2s_ease-out_forwards] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600/20 text-primary-400 rounded-lg">
              <Flag size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white font-heading">{editId ? 'Edit Milestone' : 'Add Business Milestone'}</h2>
              <p className="text-xs text-gray-500">Track key achievements and events</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Row 1: Title */}
          <div>
            <label className={labelCls}>Milestone Title *</label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Flag size={16} /></div>
              <input required autoFocus value={f.title} onChange={e => setF({...f, title: e.target.value})}
                className={inputCls} placeholder="e.g. Reached 1000 sales" />
            </div>
          </div>

          {/* Row 2: Date + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Date *</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><CalendarIcon size={16} /></div>
                <input type="date" required value={f.date} onChange={e => setF({...f, date: e.target.value})} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"><Tag size={16} /></div>
                <select value={f.category} onChange={e => setF({...f, category: e.target.value})} className={inputCls}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: Description */}
          <div>
            <label className={labelCls}>Description</label>
            <div className="relative">
              <div className="absolute left-3 top-3 text-gray-500"><AlignLeft size={16} /></div>
              <textarea value={f.description} onChange={e => setF({...f, description: e.target.value})}
                className={`${inputCls} min-h-[80px] resize-none pt-2.5`} placeholder="Add some context or details... (optional)" />
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-2.5 border border-white/10 hover:bg-white/5 rounded-xl text-sm font-bold text-gray-300 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-600/20 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Milestone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
