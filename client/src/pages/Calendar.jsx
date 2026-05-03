import { useState, useMemo } from 'react';
import { useEvents } from '../hooks/useFirestore';
import { Card } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

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

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); setSelDay(null); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); setSelDay(null); };

  const upcoming = useMemo(() => {
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      events.filter(e => e.date === ds).forEach(e => list.push({ ...e }));
    }
    return list;
  }, [events]);

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all";

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      <Card>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">Add Event</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div><label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Date</label><input type="date" value={f.date} onChange={e => setF(p => ({ ...p, date: e.target.value }))} className={inputCls} /></div>
          <div><label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Title</label><input value={f.title} onChange={e => setF(p => ({ ...p, title: e.target.value }))} className={inputCls} placeholder="Event title" /></div>
          <div><label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Type</label><select value={f.type} onChange={e => setF(p => ({ ...p, type: e.target.value }))} className={inputCls}>{types.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
          <div><label className="block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1">Note (optional)</label><input value={f.note} onChange={e => setF(p => ({ ...p, note: e.target.value }))} className={inputCls} placeholder="Optional note" /></div>
          <div className="flex items-end"><button type="submit" className="w-full bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">Add Event</button></div>
        </form>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-5">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><ChevronLeft size={18} className="text-gray-500 dark:text-gray-400" /></button>
              <h3 className="text-lg font-bold text-gray-800 dark:text-white font-heading">{monthNames[month]} {year}</h3>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"><ChevronRight size={18} className="text-gray-500 dark:text-gray-400" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-400 dark:text-gray-500 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const ds = dayStr(d); const de = eventsOnDay(d);
                const isToday = ds === todayStr; const isSel = selDay === d;
                return (
                  <div key={i} onClick={() => setSelDay(d)}
                    className={`aspect-square flex flex-col items-center justify-center rounded-xl cursor-pointer text-sm font-medium transition-all hover:bg-primary-50 dark:hover:bg-gray-800 ${isToday ? 'ring-2 ring-primary-500 text-primary-600 dark:text-primary-400 font-bold' : ''} ${isSel ? 'bg-primary-600 text-white hover:bg-primary-700 dark:hover:bg-primary-700 dark:bg-primary-600' : 'text-gray-600 dark:text-gray-300'}`}>
                    {d}
                    {de.length > 0 && <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSel ? 'bg-white' : 'bg-primary-500'}`} />}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <Card>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">{selDay ? `Events — ${monthNames[month]} ${selDay}` : 'Select a day'}</h3>
          {selDay ? (
            <div className="space-y-2">
              {eventsOnDay(selDay).length === 0 ? <p className="text-gray-400 dark:text-gray-500 text-sm">No events this day</p> :
              eventsOnDay(selDay).map(e => (
                <div key={e.id} className="bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${typeBadge(e.type)}`}>{e.type}</span>
                    <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 size={14} className="text-red-400" /></button>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-white font-semibold">{e.title}</p>
                  {e.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{e.note}</p>}
                </div>
              ))}
            </div>
          ) : <p className="text-gray-400 dark:text-gray-500 text-sm">Click a day on the calendar</p>}
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Upcoming Events (7 days)</h3>
        {upcoming.length === 0 ? <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-4">No upcoming events</p> :
        <div className="space-y-2">{upcoming.map(e => (
          <div key={e.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[70px] font-medium">{e.date}</span>
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${typeBadge(e.type)}`}>{e.type}</span>
            <span className="text-sm text-gray-800 dark:text-white flex-1 font-medium">{e.title}</span>
            {e.note && <span className="text-xs text-gray-400 dark:text-gray-500">{e.note}</span>}
            <button onClick={() => handleDelete(e.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"><Trash2 size={14} className="text-red-400" /></button>
          </div>
        ))}</div>}
      </Card>
    </div>
  );
}
