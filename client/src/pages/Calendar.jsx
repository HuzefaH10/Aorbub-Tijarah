import React, { useState, useMemo, useEffect } from 'react';
import { useEvents, useMilestones, useProducts, useBills, useStockLogs } from '../hooks/useFirestore';
import { 
  Calendar as CalendarIcon, Clock, CheckCircle2, AlertTriangle, 
  ChevronLeft, ChevronRight, Plus, Search, X, Edit2, Trash2,
  CalendarDays, ListTodo, MapPin, TrendingUp, DollarSign, Package, ShieldAlert
} from 'lucide-react';
import Toast, { useToast } from '../components/ui/Toast';

const EVENT_TYPES = [
  { id: 'reminder',      label: 'General Reminder',      color: '#5b8dee', bg: 'bg-blue-500',    tint: 'bg-blue-500/10 text-blue-400' },
  { id: 'stock_order',   label: 'Stock Order Reminder',  color: '#e8944a', bg: 'bg-orange-500', tint: 'bg-orange-500/10 text-orange-400' },
  { id: 'milestone',     label: 'Business Milestone',    color: '#c9a84c', bg: 'bg-[#c9a84c]',  tint: 'bg-[#c9a84c]/10 text-[#c9a84c]' },
  { id: 'credit_due',    label: 'Credit Due',            color: '#e05c5c', bg: 'bg-red-500',    tint: 'bg-red-500/10 text-red-400' },
  { id: 'expiry_warning',label: 'Expiry Warning',        color: '#9b7fe8', bg: 'bg-purple-500', tint: 'bg-purple-500/10 text-purple-400' },
  { id: 'recurring',     label: 'Recurring',             color: '#4caf7d', bg: 'bg-green-500',  tint: 'bg-green-500/10 text-green-400' },
];
const getType = t => EVENT_TYPES.find(x => x.id === t) || EVENT_TYPES[0];

const MILESTONE_ICONS = ['🏆', '🚀', '💰', '📦', '🎯', '🔑', '🌟', '📈', '🤝', '🎉', '🏪', '✅'];

export default function CalendarPage() {
  const { events, addEvent, updateEvent, deleteEvent } = useEvents();
  const { milestones, addMilestone, deleteMilestone } = useMilestones();
  const { products } = useProducts();
  const { bills } = useBills();
  const { stockLogs } = useStockLogs();
  const { toast, showToast, hideToast } = useToast();

  const [view, setView] = useState('month'); // 'month' | 'agenda'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [search, setSearch] = useState('');
  
  const [selectedDay, setSelectedDay] = useState(null); // String YYYY-MM-DD
  const [eventModal, setEventModal] = useState({ open: false, editId: null, data: null, prefillDate: null });
  const [milestoneModal, setMilestoneModal] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  // Auto-Overdue Logic on Mount
  useEffect(() => {
    if (!events.length) return;
    let changed = false;
    events.forEach(e => {
      if (e.status === 'upcoming' && e.date < todayStr) {
        updateEvent(e.id, { status: 'overdue' });
        changed = true;
      }
    });
    // Silent update, no toast needed for background task
  }, [events.length]); // run when events load initially

  // Filtered Events
  const filteredEvents = useMemo(() => {
    let list = events;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e => e.title.toLowerCase().includes(q) || e.note?.toLowerCase().includes(q) || getType(e.type).label.toLowerCase().includes(q));
    }
    return list;
  }, [events, search]);

  // Computed Stats
  const stats = useMemo(() => ({
    total: events.length,
    upcoming: events.filter(e => e.status === 'upcoming' && e.date >= todayStr).length,
    overdue: events.filter(e => e.status === 'overdue').length,
    completed: events.filter(e => e.status === 'completed').length,
  }), [events, todayStr]);

  // Heatmap Data (Tint + Dots)
  const heatmapData = useMemo(() => {
    const data = {};
    const viewYear = currentDate.getFullYear();
    const viewMonthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${viewYear}-${viewMonthStr}`;
    
    // 1. Sales Intensity (Background Tint)
    const dailySales = {};
    bills.forEach(b => {
      if (b.date && b.date.startsWith(monthPrefix) && b.status !== 'cancelled') {
        if (!dailySales[b.date]) dailySales[b.date] = 0;
        dailySales[b.date] += (Number(b.netTotal) || 0);
      }
    });
    
    const salesArray = Object.values(dailySales).sort((a, b) => a - b);
    let p75 = Infinity, p25 = Infinity;
    if (salesArray.length > 0) {
      p75 = salesArray[Math.floor(salesArray.length * 0.75)];
      p25 = salesArray[Math.floor(salesArray.length * 0.25)];
    }
  
    Object.keys(dailySales).forEach(date => {
      if (!data[date]) data[date] = { tint: '', dots: [] };
      const total = dailySales[date];
      if (total >= p75) data[date].tint = 'bg-purple-900/40';
      else if (total >= p25) data[date].tint = 'bg-blue-900/30';
    });
  
    // 2. Colored Dots
    events.forEach(e => {
      if (!e.date) return;
      if (!data[e.date]) data[e.date] = { tint: '', dots: [] };
      if (e.type === 'stock_order' && e.status === 'completed') {
        data[e.date].dots.push({ color: 'bg-green-500', label: 'Stock order cleared' });
      } else {
        data[e.date].dots.push({ color: 'bg-amber-500', label: e.title || 'Event' });
      }
    });
  
    bills.forEach(b => {
      if (b.status === 'unpaid' && b.dueDate && b.dueDate < todayStr) {
        if (!data[b.dueDate]) data[b.dueDate] = { tint: '', dots: [] };
        data[b.dueDate].dots.push({ color: 'bg-red-500', label: 'Overdue bill' });
      }
    });
  
    products.forEach(p => {
      if (p.expiryDate) {
        const expTime = new Date(p.expiryDate).getTime();
        for (let i = 0; i <= 7; i++) {
          const d = new Date(expTime - i * 86400000);
          const dStr = d.toISOString().split('T')[0];
          if (!data[dStr]) data[dStr] = { tint: '', dots: [] };
          data[dStr].dots.push({ color: 'bg-orange-500', label: `Expiring ${i === 0 ? 'today' : `in ${i}d`}: ${p.name}` });
        }
      }
    });
  
    return data;
  }, [bills, events, products, currentDate, todayStr]);

  // Calendar Grid Math
  const monthCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    const cells = [];
    const offset = firstDay === 0 ? 6 : firstDay - 1; // Make Monday=0
    
    // Prev month padding
    for (let i = offset - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, dateStr: `${year}-${String(month).padStart(2, '0')}-${String(prevMonthDays - i).padStart(2, '0')}`, isCurrent: false });
    }
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({ day: i, dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`, isCurrent: true });
    }
    // Next month padding to fill 35 or 42 cells
    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let i = 1; i <= remaining; i++) {
      cells.push({ day: i, dateStr: `${month === 11 ? year + 1 : year}-${String(month === 11 ? 1 : month + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}`, isCurrent: false });
    }
    return cells;
  }, [currentDate]);

  const next7Days = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const str = d.toISOString().split('T')[0];
      days.push({ 
        dateStr: str, 
        name: d.toLocaleDateString('en-GB', { weekday: 'short' }), 
        num: d.getDate(),
        events: filteredEvents.filter(e => (e.date <= str && (!e.endDate || e.endDate >= str)))
      });
    }
    return days;
  }, [filteredEvents]);

  const handlePrevMonth = () => { const d = new Date(currentDate); d.setMonth(d.getMonth() - 1); setCurrentDate(d); };
  const handleNextMonth = () => { const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); setCurrentDate(d); };

  const handleAction = async (action, e) => {
    if (action === 'complete') {
      await updateEvent(e.id, { status: 'completed' });
      showToast('Event marked complete');
    } else if (action === 'delete') {
      if (confirm('Delete this event?')) {
        await deleteEvent(e.id);
        showToast('Event deleted');
      }
    } else if (action === 'edit') {
      setEventModal({ open: true, editId: e.id, data: e });
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-32 min-h-screen relative overflow-hidden">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* TOPBAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 glass p-5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 font-heading">Calendar & Scheduling</h1>
          <p className="text-sm text-gray-500">{currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
        </div>
        <button onClick={() => setEventModal({ open: true })} className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-primary-600/20 hover:bg-primary-700 hover:-translate-y-0.5 transition-all">
          <Plus size={16} /> Add Event
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={stats.total} icon={CalendarIcon} color="text-white" />
        <StatCard label="Upcoming" value={stats.upcoming} icon={Clock} color="text-blue-400" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertTriangle} color="text-red-400" pulse={stats.overdue > 0} />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} color="text-green-400" />
      </div>

      {/* UPCOMING STRIP */}
      <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
        {next7Days.map((d, i) => {
          const isToday = d.dateStr === todayStr;
          return (
            <div key={d.dateStr} onClick={() => { setView('month'); setCurrentDate(new Date(d.dateStr)); setSelectedDay(d.dateStr); }} 
              className={`flex-shrink-0 w-[85px] p-3 glass cursor-pointer hover:-translate-y-1 transition-all ${isToday ? '!bg-primary-900/10 border-primary-500/50' : 'hover:border-primary-500/30'}`}
              style={{ animation: `fadeIn 0.3s ease-out ${i * 0.03}s both` }}>
              <p className={`text-[10px] uppercase font-bold text-center mb-1 ${isToday ? 'text-primary-500' : 'text-gray-500'}`}>{d.name}</p>
              <p className={`text-2xl font-heading font-bold text-center mb-3 ${isToday ? 'text-primary-400' : 'text-white'}`}>{d.num}</p>
              <div className="flex justify-center gap-1 flex-wrap">
                {d.events.slice(0, 4).map(e => <div key={e.id} className={`w-2 h-2 rounded-full ${getType(e.type).bg}`} />)}
                {d.events.length > 4 && <span className="text-[8px] text-gray-500 leading-none">+{d.events.length - 4}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* CONTROLS */}
      <div className="flex flex-col md:flex-row justify-between gap-4">
        <div className="flex glass p-1 !rounded-xl w-fit">
          <button onClick={() => setView('month')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === 'month' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}><CalendarDays size={16} /> Month</button>
          <button onClick={() => setView('agenda')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${view === 'agenda' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'}`}><ListTodo size={16} /> Agenda</button>
        </div>
        <div className="relative w-full md:w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="w-full glass pl-9 pr-8 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14} /></button>}
        </div>
      </div>

      {/* VIEWS */}
      <div className="relative">
        {events.length === 0 ? (
          <div className="glass p-10 flex flex-col items-center justify-center text-center">
            <CalendarIcon size={48} className="text-gray-800 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No events yet</h3>
            <p className="text-gray-500 text-sm mb-6">Start planning your business operations</p>
            <button onClick={() => setEventModal({ open: true })} className="px-5 py-2.5 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-primary-600/20 hover:bg-primary-700 transition-all">
              + Add Your First Event
            </button>
          </div>
        ) : (
          view === 'month' ? (
            <MonthView cells={monthCells} events={filteredEvents} heatmapData={heatmapData} currentDate={currentDate} onPrev={handlePrevMonth} onNext={handleNextMonth} onDayClick={setSelectedDay} todayStr={todayStr} />
          ) : (
            <AgendaView events={filteredEvents} onAction={handleAction} todayStr={todayStr} />
          )
        )}

        {/* DAY SUMMARY POPUP */}
        {selectedDay && (
          <DaySummaryPopup
            dateStr={selectedDay}
            onClose={() => setSelectedDay(null)}
            events={filteredEvents}
            bills={bills}
            products={products}
            stockLogs={stockLogs}
            todayStr={todayStr}
            onAddEvent={() => setEventModal({ open: true, prefillDate: selectedDay })}
            onEventAction={handleAction}
            getType={getType}
          />
        )}
      </div>

      {/* MILESTONES TIMELINE */}
      <div className="fixed bottom-0 left-[64px] right-0 bg-gray-950/80 backdrop-blur-xl border-t border-white/10 p-4 z-30">
        <div className="flex items-center justify-between mb-3 max-w-[1400px] mx-auto px-4">
          <h2 className="text-[11px] font-bold text-primary-500/70 uppercase tracking-[0.2em]">Business Milestones</h2>
          <button onClick={() => setMilestoneModal(true)} className="text-xs font-bold text-gray-400 border border-white/10 px-3 py-1 rounded hover:text-white hover:border-white/30 transition-colors">+ Add Milestone</button>
        </div>
        <div className="flex items-center overflow-x-auto custom-scrollbar max-w-[1400px] mx-auto px-4 pb-2 relative h-[60px]">
          {/* Main timeline axis */}
          <div className="absolute top-1/2 left-4 right-4 h-px bg-white/10 -translate-y-1/2" />
          
          {milestones.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No milestones added yet.</p>
          ) : (
            milestones.map(m => {
              const isToday = m.date === todayStr;
              return (
                <div key={m.id} className="relative flex-shrink-0 w-32 flex flex-col items-center group cursor-pointer" title={m.description}>
                  <div className={`text-xs font-bold mb-2 truncate max-w-full px-1 ${isToday ? 'text-primary-400' : 'text-gray-300 group-hover:text-white transition-colors'}`}>{m.title}</div>
                  <div className={`w-3 h-3 rounded-full border-2 z-10 flex items-center justify-center text-[10px] ${isToday ? 'bg-primary-600 border-primary-400 w-5 h-5' : 'bg-gray-900 border-gray-500 group-hover:border-white transition-colors'}`}>
                    {isToday ? '⭐' : ''}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-2">{m.date}</div>
                  
                  {/* Tooltip for description */}
                  {m.description && (
                    <div className="absolute bottom-full mb-2 bg-gray-800 text-white text-[10px] p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity w-48 text-center z-50">
                      {m.description}
                    </div>
                  )}
                  {/* Delete button */}
                  <button onClick={(e) => { e.stopPropagation(); deleteMilestone(m.id); }} className="absolute -top-4 right-2 text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={12} />
                  </button>
                </div>
              );
            })
          )}
          {/* Today vertical marker */}
          {milestones.some(m => m.date === todayStr) === false && (
            <div className="absolute left-1/2 top-0 bottom-0 w-px border-l border-dashed border-primary-500/50 -translate-x-1/2 pointer-events-none flex flex-col items-center justify-center">
              <span className="bg-gray-950 text-primary-500 text-[8px] font-bold px-1 rounded absolute top-0">TODAY</span>
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {eventModal.open && <EventModal {...eventModal} onClose={() => setEventModal({ open: false })} onSave={eventModal.editId ? updateEvent : addEvent} products={products} toast={showToast} />}
      {milestoneModal && <MilestoneModal onClose={() => setMilestoneModal(false)} onSave={addMilestone} toast={showToast} />}
    </div>
  );
}

// ---- Sub Components ----

function StatCard({ label, value, icon: Icon, color, pulse }) {
  return (
    <div className="glass p-5 flex flex-col justify-between hover:border-white/10 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
        <Icon size={16} className={`text-gray-600 ${pulse && value > 0 ? 'animate-pulse text-red-500' : ''}`} />
      </div>
      <div className={`text-3xl font-bold font-heading ${color}`}>{value}</div>
    </div>
  );
}

function DaySummaryPopup({ dateStr, onClose, events, bills, products, stockLogs, todayStr, onAddEvent, onEventAction, getType }) {
  // Format the title: "Thursday, 7 May 2026"
  const dateObj = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone issues
  const formattedDate = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // 1. Sales Summary for this day
  const dayBills = useMemo(() => bills.filter(b => b.date === dateStr), [bills, dateStr]);
  const dayRevenue = useMemo(() => dayBills.filter(b => b.status === 'paid').reduce((s, b) => s + (Number(b.netTotal) || 0), 0), [dayBills]);
  const dayCash = useMemo(() => dayBills.filter(b => b.paymentMethod === 'cash' && b.status === 'paid').reduce((s, b) => s + (Number(b.netTotal) || 0), 0), [dayBills]);
  const dayCredit = useMemo(() => dayBills.filter(b => b.paymentMethod === 'credit').reduce((s, b) => s + (Number(b.netTotal) || 0), 0), [dayBills]);

  // 2. Events & Reminders for this day
  const dayEvents = useMemo(() => events.filter(e => e.date === dateStr), [events, dateStr]);

  // 3. Overdue Credits (unpaid bills with dueDate <= this day)
  const overdueCredits = useMemo(() =>
    bills.filter(b => b.status === 'unpaid' && b.credit?.dueDate && b.credit.dueDate <= dateStr),
  [bills, dateStr]);

  // 4. Stock Alerts for this day
  const expiringProducts = useMemo(() => {
    const dayMs = new Date(dateStr + 'T12:00:00').getTime();
    return products.filter(p => {
      if (!p.expiryDate) return false;
      const expMs = new Date(p.expiryDate).getTime();
      const diffDays = Math.round((expMs - dayMs) / 86400000);
      return diffDays >= 0 && diffDays <= 7;
    });
  }, [products, dateStr]);

  const loadedOnDay = useMemo(() => stockLogs.filter(l => l.date === dateStr), [stockLogs, dateStr]);

  // 5. Weekly Revenue (Mon–Sun of the week containing this date)
  const weekRevenue = useMemo(() => {
    const d = new Date(dateStr + 'T12:00:00');
    const day = d.getDay(); // 0=Sun
    const monday = new Date(d); monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const monStr = monday.toISOString().split('T')[0];
    const sunStr = sunday.toISOString().split('T')[0];
    return bills
      .filter(b => b.status === 'paid' && b.date >= monStr && b.date <= sunStr)
      .reduce((s, b) => s + (Number(b.netTotal) || 0), 0);
  }, [bills, dateStr]);

  const fmt = (n) => `$${Number(n).toFixed(2)}`;
  const daysOverdue = (dueDate) => { const diff = Math.floor((new Date(todayStr) - new Date(dueDate)) / 86400000); return diff; };

  const SectionHeader = ({ icon: Icon, label, color = 'text-gray-400' }) => (
    <div className={`flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider mb-2 ${color}`}>
      <Icon size={13} />{label}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="glass w-full max-w-md shadow-2xl scale-95 animate-[scaleIn_0.2s_ease-out_forwards] overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white font-heading">{formattedDate}</h2>
            {dateStr === todayStr && <span className="text-[10px] font-bold text-primary-400 uppercase tracking-wider">Today</span>}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><X size={18} /></button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          <div className="p-6 space-y-6">

            {/* 1. Sales Summary */}
            <div>
              <SectionHeader icon={TrendingUp} label="Sales Summary" color="text-primary-400" />
              {dayBills.length === 0 ? (
                <p className="text-sm text-gray-600 italic">No sales recorded</p>
              ) : (
                <div className="bg-gray-900/60 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Bills</span>
                    <span className="font-bold text-white">{dayBills.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Revenue</span>
                    <span className="font-bold text-green-400">{fmt(dayRevenue)}</span>
                  </div>
                  <div className="border-t border-white/5 pt-2 flex gap-4 text-xs text-gray-500">
                    <span>Cash: <span className="text-white font-bold">{fmt(dayCash)}</span></span>
                    <span>Credit: <span className="text-white font-bold">{fmt(dayCredit)}</span></span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Events & Reminders */}
            <div>
              <SectionHeader icon={CalendarIcon} label="Events & Reminders" color="text-amber-400" />
              {dayEvents.length === 0 ? (
                <p className="text-sm text-gray-600 italic">No events scheduled</p>
              ) : (
                <div className="space-y-2">
                  {dayEvents.map(e => {
                    const t = getType(e.type);
                    const linkedProduct = e.linkedProductId ? products.find(p => p.id === e.linkedProductId) : null;
                    return (
                      <div key={e.id} className="bg-gray-900/60 rounded-xl p-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${t.tint}`}>{t.label}</span>
                            <span className={`text-[9px] font-bold uppercase ${
                              e.status === 'completed' ? 'text-green-500' : e.status === 'overdue' ? 'text-red-500' : 'text-gray-500'
                            }`}>{e.status}</span>
                          </div>
                          <p className="text-sm font-bold text-white truncate">{e.title}</p>
                          {linkedProduct && <p className="text-[11px] text-orange-400 mt-0.5">🔗 {linkedProduct.name}</p>}
                          {e.note && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{e.note}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {e.status !== 'completed' && (
                            <button onClick={() => onEventAction('complete', e)} className="p-1.5 text-green-500 hover:bg-green-500/10 rounded-lg transition-colors" title="Complete"><CheckCircle2 size={14} /></button>
                          )}
                          <button onClick={() => onEventAction('edit', e)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><Edit2 size={14} /></button>
                          <button onClick={() => onEventAction('delete', e)} className="p-1.5 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Overdue Credits */}
            {overdueCredits.length > 0 && (
              <div>
                <SectionHeader icon={ShieldAlert} label="Overdue Credits" color="text-red-400" />
                <div className="space-y-2">
                  {overdueCredits.map(b => (
                    <div key={b.id} className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">{b.credit?.customerName || 'Unknown'}</p>
                        <p className="text-xs text-red-400 mt-0.5">{daysOverdue(b.credit.dueDate)}d overdue · Due {b.credit.dueDate}</p>
                      </div>
                      <span className="font-bold text-red-400 text-sm">{fmt(b.netTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Stock Alerts */}
            {(expiringProducts.length > 0 || loadedOnDay.length > 0) && (
              <div>
                <SectionHeader icon={Package} label="Stock Alerts" color="text-orange-400" />
                <div className="space-y-2">
                  {expiringProducts.map(p => {
                    const dayMs = new Date(dateStr + 'T12:00:00').getTime();
                    const expMs = new Date(p.expiryDate).getTime();
                    const diffDays = Math.round((expMs - dayMs) / 86400000);
                    return (
                      <div key={p.id} className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-white">{p.name}</p>
                          <p className="text-xs text-orange-400 mt-0.5">{diffDays === 0 ? 'Expires today' : `Expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}`}</p>
                        </div>
                        <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded-lg">{p.category || '—'}</span>
                      </div>
                    );
                  })}
                  {loadedOnDay.map(l => (
                    <div key={l.id} className="bg-green-500/5 border border-green-500/20 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">{l.productName}</p>
                        <p className="text-xs text-green-400 mt-0.5">Loaded: +{l.quantityLoaded} {l.unit || ''}</p>
                      </div>
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-lg">Stocked</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer: Add Event + Weekly Revenue */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-1.5"><TrendingUp size={12} className="text-primary-500" /><span>This week</span></div>
            <span className="font-bold text-white">{fmt(weekRevenue)}</span>
          </div>
          <button onClick={() => { onAddEvent(); onClose(); }}
            className="w-full py-2.5 bg-primary-600/20 hover:bg-primary-600 border border-primary-500/30 hover:border-primary-500 rounded-xl text-sm font-bold text-primary-400 hover:text-white transition-all">
            + Add Event on This Day
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthView({ cells, events, heatmapData, currentDate, onPrev, onNext, onDayClick, todayStr }) {
  return (
    <div className="glass overflow-hidden animate-fadeIn">
      <div className="flex items-center justify-between p-4 border-b border-white/5 bg-gray-900/50">
        <button onClick={onPrev} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"><ChevronLeft size={20} /></button>
        <h2 className="text-lg font-bold text-white font-heading">{currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
        <button onClick={onNext} className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"><ChevronRight size={20} /></button>
      </div>
      
      <div className="grid grid-cols-7 border-b border-white/5">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="p-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 grid-rows-5 bg-gray-950 gap-px border-b border-white/5">
        {cells.map((cell, i) => {
          const isToday = cell.dateStr === todayStr;
          const dayEvents = events.filter(e => e.date <= cell.dateStr && (!e.endDate || e.endDate >= cell.dateStr));
          const hData = heatmapData[cell.dateStr] || { tint: '', dots: [] };
          
          return (
            <div key={i} onClick={() => onDayClick(cell.dateStr)} 
              className={`min-h-[100px] p-1.5 glass !rounded-none !border-0 cursor-pointer hover:bg-white/5 transition-colors flex flex-col group ${!cell.isCurrent ? 'opacity-40' : ''} ${hData.tint}`}
            >
              <div className="flex justify-between items-start mb-1 w-full">
                <div className="flex flex-wrap gap-1 mt-1 max-w-[60%]">
                  {hData.dots.slice(0, 3).map((d, idx) => (
                    <div key={idx} className={`w-2 h-2 rounded-full ${d.color}`} title={d.label} />
                  ))}
                  {hData.dots.length > 3 && (
                    <span className="text-[8px] text-gray-500 font-bold leading-none">+{hData.dots.length - 3}</span>
                  )}
                </div>
                <span className={`text-xs font-bold shrink-0 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary-600 text-white' : 'text-gray-400 group-hover:text-white'}`}>{cell.day}</span>
              </div>
              <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                {dayEvents.slice(0, 3).map(e => (
                  <div key={e.id} className={`text-[9px] font-bold px-1.5 py-0.5 rounded truncate ${getType(e.type).bg} text-white`}>
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && <div className="text-[9px] text-gray-500 px-1 font-bold">+{dayEvents.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ events, onAction, todayStr }) {
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showPast, setShowPast] = useState(false);

  const processed = useMemo(() => {
    let list = events;
    if (filterType !== 'all') list = list.filter(e => e.type === filterType);
    if (filterStatus !== 'all') list = list.filter(e => e.status === filterStatus);
    if (!showPast) list = list.filter(e => e.date >= todayStr || (e.endDate && e.endDate >= todayStr) || e.status === 'overdue');
    
    // Group by date
    const groups = {};
    const overdueList = [];

    list.forEach(e => {
      if (e.status === 'overdue') {
        overdueList.push(e);
        return;
      }
      if (!groups[e.date]) groups[e.date] = [];
      groups[e.date].push(e);
    });

    const sortedDates = Object.keys(groups).sort();
    return { groups, sortedDates, overdueList };
  }, [events, filterType, filterStatus, showPast, todayStr]);

  return (
    <div className="glass p-5 animate-fadeIn min-h-[500px]">
      <div className="flex flex-wrap gap-3 mb-6 p-3 bg-gray-900 rounded-xl border border-white/5">
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-gray-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none">
          <option value="all">All Types</option>
          {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-gray-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none">
          <option value="all">All Statuses</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="overdue">Overdue</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer ml-auto">
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} className="accent-primary-500" />
          Show Past Events
        </label>
      </div>

      {processed.overdueList.length === 0 && processed.sortedDates.length === 0 ? (
        <div className="text-center py-20 text-gray-500">No events match your filters.</div>
      ) : (
        <div className="space-y-8">
          {processed.overdueList.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-red-500 uppercase tracking-widest mb-3 flex items-center gap-2"><AlertTriangle size={14} /> Overdue — Action Needed</h3>
              <div className="space-y-2">
                {processed.overdueList.map(e => <AgendaRow key={e.id} e={e} onAction={onAction} todayStr={todayStr} />)}
              </div>
            </div>
          )}

          {processed.sortedDates.map(date => {
            const dateObj = new Date(date);
            const label = date === todayStr ? 'TODAY' : dateObj.toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
            return (
              <div key={date}>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{label}</h3>
                <div className="space-y-2">
                  {processed.groups[date].map(e => <AgendaRow key={e.id} e={e} onAction={onAction} todayStr={todayStr} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgendaRow({ e, onAction, todayStr }) {
  const t = getType(e.type);
  return (
    <div className={`flex items-stretch bg-gray-900 border border-white/5 rounded-xl overflow-hidden hover:border-white/20 transition-colors ${e.status === 'completed' ? 'opacity-60' : ''}`}>
      <div className="w-2 shrink-0" style={{ backgroundColor: t.color }} />
      <div className="p-4 flex-1 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${t.tint}`}>{t.label}</span>
            {e.status === 'completed' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-green-500/10 text-green-400">Completed</span>}
            {e.status === 'overdue' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-red-500/10 text-red-400">Overdue</span>}
          </div>
          <h4 className={`font-bold text-sm ${e.status === 'completed' ? 'line-through text-gray-400' : 'text-white'}`}>{e.title}</h4>
          {e.note && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{e.note}</p>}
        </div>
        
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-xs font-bold text-gray-300">{e.date === todayStr ? 'Today' : new Date(e.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</p>
            {e.endDate && <p className="text-[10px] text-gray-500">→ {new Date(e.endDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}</p>}
          </div>
          <div className="flex gap-1 border-l border-white/10 pl-4">
            {e.status !== 'completed' && <button onClick={() => onAction('complete', e)} className="p-2 text-gray-400 hover:text-green-500 bg-gray-950 rounded-lg transition-colors" title="Mark Complete"><CheckCircle2 size={16} /></button>}
            <button onClick={() => onAction('edit', e)} className="p-2 text-gray-400 hover:text-white bg-gray-950 rounded-lg transition-colors"><Edit2 size={16} /></button>
            <button onClick={() => onAction('delete', e)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-950 rounded-lg transition-colors"><Trash2 size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Modals ----

function EventModal({ editId, data, prefillDate, onClose, onSave, products = [], toast }) {
  const today = new Date().toISOString().split('T')[0];

  const [f, setF] = useState(() => ({
    title: data?.title || '',
    type: data?.type || 'reminder',
    date: data?.date || prefillDate || today,
    status: data?.status || 'pending',
    recurring: data?.recurring || { enabled: false, frequency: null },
    linkedProductId: data?.linkedProductId || null,
    linkedBillId: data?.linkedBillId || null,
    note: data?.note || '',
  }));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) return toast('Event title is required', 'error');
    if (!f.date) return toast('Date is required', 'error');

    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(),
        type: f.type,
        date: f.date,
        status: editId ? f.status : 'pending',
        recurring: f.recurring,
        linkedProductId: f.type === 'stock_order' ? (f.linkedProductId || null) : null,
        linkedBillId: f.linkedBillId || null,
        note: f.note.trim() || null,
      };
      await onSave(editId, payload);
      toast(editId ? 'Event updated' : 'Event added');
      onClose();
    } catch { toast('Error saving event', 'error'); }
    finally { setSaving(false); }
  };

  const t = getType(f.type);
  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";
  const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4 overflow-y-auto">
      <div className="glass w-full max-w-md shadow-2xl scale-95 animate-[scaleIn_0.2s_ease-out_forwards] my-auto overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white font-heading">{editId ? 'Edit Event' : 'Add Event'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 custom-scrollbar">
          <div className="p-6 space-y-4">

            {/* Row 1: Title */}
            <div>
              <label className={labelCls}>Event Title *</label>
              <input required autoFocus value={f.title} onChange={e => setF({...f, title: e.target.value})}
                className={inputCls} placeholder="e.g. Restock dairy products" />
            </div>

            {/* Row 2: Date + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date *</label>
                <input type="date" required value={f.date} onChange={e => setF({...f, date: e.target.value})} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select value={f.type} onChange={e => setF({...f, type: e.target.value, linkedProductId: null})} className={inputCls}>
                  {EVENT_TYPES.map(et => <option key={et.id} value={et.id}>{et.label}</option>)}
                </select>
              </div>
            </div>

            {/* Row 3: Recurring + Note */}
            <div className="grid grid-cols-2 gap-3">
              {/* Recurring toggle */}
              <div>
                <label className={labelCls}>Recurring</label>
                <div className="flex items-center gap-3 h-[42px]">
                  <button type="button" onClick={() => setF(p => ({ ...p, recurring: { enabled: !p.recurring.enabled, frequency: !p.recurring.enabled ? 'weekly' : null } }))}
                    className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 shrink-0 ${f.recurring.enabled ? 'bg-primary-600' : 'bg-gray-700'}`}>
                    <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${f.recurring.enabled ? 'left-[20px]' : 'left-[2px]'}`} />
                  </button>
                  {f.recurring.enabled && (
                    <select value={f.recurring.frequency || 'weekly'}
                      onChange={e => setF(p => ({ ...p, recurring: { ...p.recurring, frequency: e.target.value } }))}
                      className="flex-1 bg-gray-950 border border-white/10 rounded-xl px-2 py-1.5 text-sm text-white outline-none focus:border-primary-500">
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className={labelCls}>Note</label>
                <input value={f.note} onChange={e => setF({...f, note: e.target.value})}
                  className={inputCls} placeholder="Optional..." />
              </div>
            </div>

            {/* Linked Product — shown only for stock_order type */}
            {f.type === 'stock_order' && (
              <div>
                <label className={labelCls}>Linked Product <span className="text-gray-600 normal-case font-normal">(optional)</span></label>
                <select value={f.linkedProductId || ''} onChange={e => setF({...f, linkedProductId: e.target.value || null})} className={inputCls}>
                  <option value="">No linked product</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name} {p.category ? `— ${p.category}` : ''}</option>)}
                </select>
                <p className="text-[10px] text-gray-600 mt-1">When a Load Stock entry is confirmed for this product, the event auto-completes.</p>
              </div>
            )}

            {/* Edit-only: Status */}
            {editId && (
              <div>
                <label className={labelCls}>Status</label>
                <select value={f.status} onChange={e => setF({...f, status: e.target.value})} className={inputCls}>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            )}

            {/* Preview */}
            <div className="border-t border-white/5 pt-4">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2 font-bold text-center">Preview</p>
              <div className="p-3 rounded-xl border border-white/5 flex items-center gap-3 bg-gray-900/80">
                <div className={`w-3 h-3 rounded-full shrink-0 ${t.bg}`} />
                <div className="flex-1 truncate text-sm font-bold text-gray-200">{f.title || 'Event Title'}</div>
                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${t.tint}`}>{t.label}</div>
                {f.recurring.enabled && <span className="text-[9px] font-bold text-gray-500 uppercase">↻ {f.recurring.frequency}</span>}
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50">
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Save Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MilestoneModal({ onClose, onSave, toast }) {
  const [f, setF] = useState({ title: '', date: new Date().toISOString().split('T')[0], description: '', icon: '🏆' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.title || !f.date) return toast('Title and date required', 'error');
    try {
      await onSave(f);
      toast('Milestone added');
      onClose();
    } catch {
      toast('Error saving milestone', 'error');
    }
  };

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="glass w-full max-w-sm shadow-2xl p-6 scale-95 animate-[scaleIn_0.2s_ease-out_forwards]">
        <h2 className="text-xl font-bold text-white font-heading mb-6">Add Milestone</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-bold text-gray-500 mb-1">Title</label><input required autoFocus value={f.title} onChange={e => setF({...f, title: e.target.value})} className={inputCls} placeholder="e.g. 1st Anniversary" /></div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">Date</label><input type="date" required value={f.date} onChange={e => setF({...f, date: e.target.value})} className={inputCls} /></div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">Description (Optional)</label><input value={f.description} onChange={e => setF({...f, description: e.target.value})} className={inputCls} /></div>
          
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2">Select Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {MILESTONE_ICONS.map(icon => (
                <button key={icon} type="button" onClick={() => setF({...f, icon})} className={`text-xl p-2 rounded-lg transition-colors ${f.icon === icon ? 'bg-primary-600 shadow-lg shadow-primary-600/30' : 'bg-gray-900 hover:bg-gray-800'}`}>{icon}</button>
              ))}
            </div>
          </div>
          
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
