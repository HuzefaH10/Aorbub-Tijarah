import { useState, useMemo } from 'react';
import { useEvents, useEntries } from '../hooks/useFirestore';
import { Card } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { ChevronLeft, ChevronRight, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

const types = [
  { v: 'restock', l: 'Restock', c: 'bg-blue-500', ct: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400' },
  { v: 'sale-event', l: 'Sale Event', c: 'bg-emerald-500', ct: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { v: 'meeting', l: 'Meeting', c: 'bg-primary-500', ct: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-400' },
  { v: 'custom', l: 'Custom', c: 'bg-gray-400', ct: 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400' },
];
const typeBadge = t => (types.find(x => x.v === t) || types[3]).ct;
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
  const { events, addEvent, deleteEvent } = useEvents();
  const { entries } = useEntries();
  const { toast, showToast, hideToast } = useToast();
  
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selDay, setSelDay] = useState(null);
  const blank = { date: '', title: '', type: 'restock', note: '' };
  const [f, setF] = useState(blank);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!f.date || !f.title) { showToast('Date and title required', 'error'); return; }
    try { await addEvent({ date: f.date, title: f.title, type: f.type, note: f.note }); setF(blank); showToast('Event added'); }
    catch { showToast('Error saving', 'error'); }
  };
  
  const handleDelete = async (id) => { await deleteEvent(id); showToast('Deleted'); };

  const { cells, todayStr } = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    return { cells, todayStr: new Date().toISOString().split('T')[0] };
  }, [month, year]);

  const dayStr = d => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  
  const eventsOnDay = d => events.filter(e => e.date === dayStr(d));
  const entriesOnDay = d => entries.filter(e => e.date === dayStr(d));

  // Calculate profit heatmap stats
  const { maxProfit, minProfit } = useMemo(() => {
    let max = 0; let min = 0;
    const dailyProfits = {};
    entries.forEach(e => {
      if (!dailyProfits[e.date]) dailyProfits[e.date] = 0;
      dailyProfits[e.date] += (e.revenue - e.cost);
    });
    Object.values(dailyProfits).forEach(p => {
      if (p > max) max = p;
      if (p < min) min = p;
    });
    return { maxProfit: max || 1, minProfit: min || -1 };
  }, [entries]);

  const getHeatmapColor = (profit) => {
    if (profit === 0) return 'transparent';
    if (profit > 0) {
      const intensity = Math.max(10, Math.floor((profit / maxProfit) * 100));
      return `rgba(16, 185, 129, ${intensity / 100})`; // Emerald scale
    } else {
      const intensity = Math.max(10, Math.floor((profit / minProfit) * 100));
      return `rgba(239, 68, 68, ${intensity / 100})`; // Red scale
    }
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelDay(null); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelDay(null); };

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all";

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-5">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><ChevronLeft size={18} className="text-gray-500 dark:text-gray-400" /></button>
              <div>
                <h3 className="text-xl font-bold text-gray-800 dark:text-white font-heading text-center">{monthNames[month]} {year}</h3>
                <p className="text-xs text-gray-400 text-center mt-1">Events & Profit Heatmap</p>
              </div>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><ChevronRight size={18} className="text-gray-500 dark:text-gray-400" /></button>
            </div>
            
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wide">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const ds = dayStr(d); 
                const de = eventsOnDay(d);
                const dailyEntries = entriesOnDay(d);
                const dailyProfit = dailyEntries.reduce((s, e) => s + (e.revenue - e.cost), 0);
                
                const isToday = ds === todayStr; 
                const isSel = selDay === d;
                
                return (
                  <div key={i} onClick={() => setSelDay(d)}
                    className={`aspect-square relative flex flex-col items-center justify-center rounded-xl cursor-pointer text-sm font-medium transition-all hover:ring-2 hover:ring-primary-400 ${isToday ? 'ring-2 ring-primary-500 text-primary-600 dark:text-primary-400 font-bold' : ''} ${isSel ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-600 dark:text-gray-300'}`}
                    style={!isSel && dailyProfit !== 0 ? { backgroundColor: getHeatmapColor(dailyProfit) } : {}}
                  >
                    <span className="z-10">{d}</span>
                    
                    {/* Event indicators */}
                    {de.length > 0 && (
                      <div className="absolute bottom-1.5 flex gap-0.5 z-10">
                        {de.slice(0, 3).map((_, idx) => <span key={idx} className={`w-1.5 h-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-primary-500 dark:bg-primary-400'}`} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-500/50" /> Loss</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800" /> Neutral</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-emerald-500/50" /> Profit</div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h3 className="text-sm font-bold text-gray-800 dark:text-white font-heading mb-4">Add Event</h3>
            <form onSubmit={handleAdd} className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Date</label><input type="date" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} className={inputCls} /></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Title</label><input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} className={inputCls} placeholder="Event title" /></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Type</label><select value={f.type} onChange={e => setF(p => ({ ...p, type: e.target.value }))} className={inputCls}>{types.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Note</label><input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} className={inputCls} placeholder="Optional note" /></div>
              <button type="submit" className="w-full bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors mt-2">Save Event</button>
            </form>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-gray-800 dark:text-white font-heading mb-3">{selDay ? `Details for ${monthNames[month]} ${selDay}` : 'Select a day'}</h3>
            {selDay ? (() => {
              const dp = entriesOnDay(selDay).reduce((s, e) => s + (e.revenue - e.cost), 0);
              return (
              <div className="space-y-4">
                {/* Heatmap Profit Summary */}
                <div className={`p-3 rounded-xl border ${dp > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400' : dp < 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 text-red-700 dark:text-red-400' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>
                  <p className="text-xs font-semibold mb-1 uppercase tracking-wider">Net Profit</p>
                  <div className="flex items-center gap-2">
                    {dp > 0 ? <TrendingUp size={18} /> : dp < 0 ? <TrendingDown size={18} /> : null}
                    <span className="font-bold text-lg">${Math.abs(dp).toLocaleString()}</span>
                  </div>
                </div>

                {/* Events */}
                <div className="space-y-2">
                  {eventsOnDay(selDay).length === 0 ? <p className="text-gray-400 dark:text-gray-500 text-xs">No manual events scheduled.</p> :
                  eventsOnDay(selDay).map(e => (
                    <div key={e.id} className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${typeBadge(e.type)}`}>{e.type}</span>
                        <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 size={14} className="text-red-400" /></button>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-white font-semibold">{e.title}</p>
                      {e.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{e.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )})() : <p className="text-gray-400 dark:text-gray-500 text-xs">Click a day on the calendar to see events and profit metrics.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
