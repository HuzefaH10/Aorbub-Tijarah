import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useBills, useProducts, useEvents } from '../hooks/useFirestore';
import { todayISO as getTodayISO, todayDisplay as getTodayDisplay, formatDate } from '../utils/dateUtils';
import ReactApexChart from 'react-apexcharts';
import { 
  Receipt, DollarSign, CreditCard, Package, Plus, TrendingUp, Calendar, 
  Clock, CheckCircle, AlertTriangle, XCircle, ArrowRight, X, ShieldAlert
} from 'lucide-react';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBusinessId, displayName, timezone, userProfile } = useBusiness();
  const { bills, loading: billsLoading } = useBills();
  const { products, loading: productsLoading } = useProducts();
  const { events, loading: eventsLoading } = useEvents();

  const [recentLogs, setRecentLogs] = useState([]);
  
  const todayISO = getTodayISO(timezone);
  const todayDisplay = getTodayDisplay(timezone);

  // ── Fetch Audit Logs in Real-time ──
  // Using client-side sorting to bypass missing composite index
  useEffect(() => {
    if (!activeBusinessId) return;
    const q = query(collection(db, 'auditLog'), where('businessId', '==', activeBusinessId));
    const unsub = onSnapshot(q, (snap) => {
      const logs = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        timestamp: d.data().timestamp?.toDate?.() || new Date(),
      }));
      logs.sort((a, b) => b.timestamp - a.timestamp);
      setRecentLogs(logs.slice(0, 5));
    });
    return unsub;
  }, [activeBusinessId]);

  // ── Greeting ──
  const greeting = useMemo(() => {
    const hour = new Date().toLocaleTimeString('en-US', { timeZone: timezone, hour12: false, hour: 'numeric' });
    const h = parseInt(hour, 10);
    if (h >= 5 && h < 12) return 'Good Morning';
    if (h >= 12 && h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, [timezone]);

  // ── Computed Stats & Data ──
  const computed = useMemo(() => {
    // 1. Today's Snapshot
    const todayBills = bills.filter(b => b.date === todayISO);
    const billsToday = todayBills.length;
    const revenueToday = todayBills.filter(b => b.status === 'paid').reduce((s, b) => s + (Number(b.netTotal) || 0), 0);
    const unpaidCredits = bills.filter(b => b.status === 'unpaid').length;
    
    let lowStockCount = 0;
    const activeAlerts = [];
    
    products.forEach(p => {
      const remaining = Number(p.stockRemaining) || 0;
      const threshold = Number(p.lowStockThreshold) || 5;
      if (remaining === 0) {
        lowStockCount++;
        activeAlerts.push({ id: `out_${p.id}`, type: 'stock', priority: 'high', title: 'Out of Stock', desc: `${p.name} is depleted`, action: 'Restock', link: `/inventory?restock=${p.id}` });
      } else if (remaining <= threshold) {
        lowStockCount++;
        activeAlerts.push({ id: `low_${p.id}`, type: 'stock', priority: 'medium', title: 'Low Stock', desc: `${p.name} is running low (${remaining} left)`, action: 'Restock', link: `/inventory?restock=${p.id}` });
      }
      
      // Expiry Warning (within 7 days)
      if (p.expiryDate) {
        const expMs = new Date(p.expiryDate).getTime();
        const todayMs = new Date(todayISO).getTime();
        const daysUntil = Math.round((expMs - todayMs) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 7) {
          activeAlerts.push({ id: `exp_${p.id}`, type: 'expiry', priority: daysUntil === 0 ? 'high' : 'medium', title: 'Expiring Soon', desc: `${p.name} expires in ${daysUntil} day(s)`, action: 'View', link: `/inventory?view=${p.id}` });
        }
      }
    });

    // Overdue Credits
    bills.forEach(b => {
      if (b.status === 'unpaid' && b.credit?.dueDate && b.credit.dueDate < todayISO) {
        const days = Math.round((new Date(todayISO) - new Date(b.credit.dueDate)) / 86400000);
        activeAlerts.push({ id: `credit_${b.id}`, type: 'credit', priority: 'high', title: 'Overdue Credit', desc: `${b.credit.customerName} is overdue by ${days} day(s)`, action: 'View', link: `/sales?bill=${b.id}` });
      }
    });

    // ── Weekly Chart Data (Mon-Sun) ──
    const d = new Date(todayISO);
    const day = d.getDay(); // 0 = Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    
    const weekDays = [];
    const weekCategories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    for (let i = 0; i < 7; i++) {
      const current = new Date(monday);
      current.setDate(monday.getDate() + i);
      weekDays.push(current.toISOString().split('T')[0]);
    }

    const weeklyRevenue = weekDays.map(dateStr => {
      return bills.filter(b => b.date === dateStr && b.status === 'paid').reduce((s, b) => s + (Number(b.netTotal) || 0), 0);
    });

    // Filter out dismissed alerts
    const dismissed = userProfile?.dismissedAlerts || [];
    const visibleAlerts = activeAlerts.filter(a => !dismissed.includes(a.id));

    return {
      billsToday, revenueToday, unpaidCredits, lowStockCount,
      visibleAlerts,
      chartSeries: [{ name: 'Revenue', data: weeklyRevenue }],
      chartCategories: weekCategories,
      weekDays
    };
  }, [bills, products, todayISO, userProfile?.dismissedAlerts]);

  // ── Handlers ──
  const dismissAlert = async (alertId) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        dismissedAlerts: arrayUnion(alertId)
      });
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  const getLogIcon = (action) => {
    const act = action.toLowerCase();
    if (act.includes('delete') || act.includes('remove')) return <TrashIcon />;
    if (act.includes('add') || act.includes('create')) return <PlusCircleIcon />;
    if (act.includes('update') || act.includes('edit') || act.includes('change')) return <EditIcon />;
    return <Clock size={16} />;
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return "Just now";
  };

  // ── Chart Config ──
  const chartOptions = {
    chart: { type: 'bar', toolbar: { show: false }, background: 'transparent' },
    colors: ['#c9a84c'],
    plotOptions: { bar: { borderRadius: 4, columnWidth: '50%' } },
    dataLabels: { enabled: false },
    xaxis: { 
      categories: computed.chartCategories, 
      labels: { style: { colors: '#9ca3af' } },
      axisBorder: { show: false }, axisTicks: { show: false } 
    },
    yaxis: { labels: { style: { colors: '#9ca3af' }, formatter: val => `$${val}` } },
    grid: { borderColor: '#ffffff10', strokeDashArray: 4 },
    theme: { mode: 'dark' },
    tooltip: { theme: 'dark', y: { formatter: val => `$${val}` } }
  };

  if (billsLoading || productsLoading) {
    return <div className="flex h-[80vh] items-center justify-center"><div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 glass p-6 shadow-xl">
        <div>
          <h1 className="text-3xl font-bold text-white font-heading">
            {greeting}, <span className="text-primary-400">{displayName}</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">{todayDisplay}</p>
        </div>
        {events.filter(e => e.date === todayISO).length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-purple-900/40 border border-purple-500/30 rounded-xl">
            <Calendar size={16} className="text-purple-400" />
            <span className="text-sm font-bold text-purple-200">
              {events.filter(e => e.date === todayISO).length} Event(s) Today
            </span>
          </div>
        )}
      </div>

      {/* ── ALERTS BANNER ── */}
      {computed.visibleAlerts.length > 0 && (
        <div className="space-y-2">
          {computed.visibleAlerts.map(alert => (
            <div key={alert.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border ${
              alert.priority === 'high' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className={alert.priority === 'high' ? 'text-red-400 mt-0.5' : 'text-orange-400 mt-0.5'} />
                <div>
                  <h4 className={`font-bold text-sm ${alert.priority === 'high' ? 'text-red-300' : 'text-orange-300'}`}>{alert.title}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">{alert.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <button onClick={() => navigate(alert.link)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  alert.priority === 'high' ? 'bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white' : 'bg-orange-500/20 hover:bg-orange-500 text-orange-300 hover:text-white'
                }`}>
                  {alert.action}
                </button>
                <button onClick={() => dismissAlert(alert.id)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Dismiss">
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SECTION 1: TODAY'S SNAPSHOT ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Bills Today" value={computed.billsToday} icon={Receipt} color="text-white" />
        <StatCard label="Revenue Today" value={`$${computed.revenueToday.toLocaleString(undefined, {minimumFractionDigits: 2})}`} icon={DollarSign} color="text-green-400" />
        <StatCard label="Unpaid Credits" value={computed.unpaidCredits} icon={CreditCard} color="text-amber-400" pulse={computed.unpaidCredits > 0} />
        <StatCard label="Low Stock Items" value={computed.lowStockCount} icon={Package} color="text-red-400" pulse={computed.lowStockCount > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ── LEFT COLUMN ── */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* ── SECTION 2: QUICK ACTIONS ── */}
          <div className="glass p-6 rounded-2xl">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <QuickAction icon={Plus} label="New Bill" onClick={() => navigate('/data-entry')} />
              <QuickAction icon={Package} label="Load Stock" onClick={() => navigate('/inventory?action=load')} />
              <QuickAction icon={TrendingUp} label="Analytics" onClick={() => navigate('/analytics')} />
              <QuickAction icon={Calendar} label="Calendar" onClick={() => navigate('/calendar')} />
            </div>
          </div>

          {/* ── SECTION 5: THIS WEEK AT A GLANCE ── */}
          <div className="glass p-6 rounded-2xl">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">This Week at a Glance</h2>
            <div className="h-[250px] w-full">
              <ReactApexChart options={chartOptions} series={computed.chartSeries} type="bar" height="100%" />
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN: SECTION 3: RECENT ACTIVITY ── */}
        <div className="glass p-6 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Recent Activity</h2>
            <button onClick={() => navigate('/settings?tab=audit')} className="text-xs font-bold text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors">
              View All <ArrowRight size={12} />
            </button>
          </div>
          
          <div className="flex-1 space-y-4">
            {recentLogs.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No recent activity found.</p>
            ) : (
              recentLogs.map(log => (
                <div key={log.id} className="flex gap-3 group">
                  <div className="mt-0.5 w-7 h-7 rounded-full bg-gray-800 border border-white/10 flex items-center justify-center shrink-0 text-gray-400 group-hover:text-primary-400 group-hover:border-primary-500/30 transition-colors">
                    {getLogIcon(log.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{log.action}</p>
                    <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{log.details}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 font-medium">
                      <span>{log.userName}</span>
                      <span>•</span>
                      <span>{timeAgo(log.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Subcomponents ──

function StatCard({ label, value, icon: Icon, color, pulse }) {
  return (
    <div className="glass p-5 flex flex-col justify-between hover:border-white/10 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
        <Icon size={16} className={`text-gray-600 ${pulse && value !== 0 && value !== '$0.00' ? 'animate-pulse text-red-500' : ''}`} />
      </div>
      <div className={`text-3xl font-bold font-heading ${color}`}>{value}</div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }) {
  return (
    <button onClick={onClick} className="glass !bg-gray-900/50 hover:!bg-primary-600/20 border border-white/5 hover:border-primary-500/30 p-4 rounded-xl flex flex-col items-center justify-center gap-3 transition-all group">
      <div className="w-10 h-10 rounded-full bg-gray-800 group-hover:bg-primary-500 flex items-center justify-center transition-colors">
        <Icon size={20} className="text-gray-400 group-hover:text-white transition-colors" />
      </div>
      <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors">{label}</span>
    </button>
  );
}

// Helper icons for logs
function TrashIcon() { return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>; }
function PlusCircleIcon() { return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>; }
function EditIcon() { return <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>; }
