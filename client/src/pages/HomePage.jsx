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
  Clock, CheckCircle, AlertTriangle, XCircle, ArrowRight, X, ShieldAlert,
  BarChart2, FileText
} from 'lucide-react';
import { generateRecurringEvents } from '../services/recurringEvents';
import { useExpenses } from '../hooks/useExpenses';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBusinessId, displayName, timezone, userProfile } = useBusiness();
  const { bills, loading: billsLoading } = useBills();
  const { products, loading: productsLoading } = useProducts();
  const { events, loading: eventsLoading } = useEvents();
  const { expenses } = useExpenses();

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

  // ── Recurring Events Auto-generation on App Open ──
  useEffect(() => {
    if (activeBusinessId) {
      generateRecurringEvents(activeBusinessId);
    }
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

  // ── Summary Logic (Daily & Weekly) ──
  const { dailySummary, weeklySummary, showDaily, showWeekly } = useMemo(() => {
    if (!bills || !expenses || !products || !userProfile) return { showDaily: false, showWeekly: false };

    const todayDate = new Date();
    
    // Visibility Flags
    const showDaily = userProfile.lastSummaryShown !== todayISO;
    const isMonday = todayDate.getDay() === 1;

    // Week number for tracking
    const getWeekNum = (d) => {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay()||7));
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
      return date.getUTCFullYear() + "-W" + Math.ceil((((date - yearStart) / 86400000) + 1)/7);
    };
    const currentWeekNum = getWeekNum(todayDate);
    const showWeekly = isMonday && userProfile.lastWeeklySummaryShown !== currentWeekNum;

    if (!showDaily && !showWeekly) return { showDaily: false, showWeekly: false };

    // Yesterday string
    const yesterdayDate = new Date(todayDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayISO = yesterdayDate.toISOString().split('T')[0];
    const yesterdayDisplay = yesterdayDate.toLocaleDateString('en-GB', { weekday: 'long', month: 'short', day: 'numeric' });

    // Last Week string
    const currentDay = todayDate.getDay();
    const diffToLastMonday = todayDate.getDate() - currentDay + (currentDay === 0 ? -6 : 1) - 7;
    const lastMondayDate = new Date(todayDate);
    lastMondayDate.setDate(diffToLastMonday);
    const lastSundayDate = new Date(lastMondayDate);
    lastSundayDate.setDate(lastMondayDate.getDate() + 6);
    
    const lastWeekISOArray = [];
    for(let i=0; i<7; i++) {
      const d = new Date(lastMondayDate);
      d.setDate(lastMondayDate.getDate() + i);
      lastWeekISOArray.push(d.toISOString().split('T')[0]);
    }
    const lastWeekDisplay = `${lastMondayDate.toLocaleDateString('en-GB', {month:'short', day:'numeric'})} – ${lastSundayDate.toLocaleDateString('en-GB', {month:'short', day:'numeric'})}`;

    let dailyStats = null;
    if (showDaily) {
      const yBills = bills.filter(b => b.date === yesterdayISO);
      const totalBills = yBills.length;
      const revCash = yBills.filter(b => b.status === 'paid' && b.paymentMethod === 'cash').reduce((s,b)=>s+(Number(b.netTotal)||0),0);
      const revCredit = yBills.filter(b => b.status === 'paid' && b.paymentMethod === 'credit').reduce((s,b)=>s+(Number(b.netTotal)||0),0);
      const itemsSold = yBills.reduce((s,b) => s + (b.items?.reduce((is, item) => is + Number(item.qty), 0) || 0), 0);
      const newCreditBills = yBills.filter(b => b.paymentMethod === 'credit').length;
      
      const yExpenses = expenses.filter(e => {
        if (!e.date) return false;
        const eDateStr = (e.date.toDate ? e.date.toDate() : new Date(e.date)).toISOString().split('T')[0];
        return eDateStr === yesterdayISO;
      });
      const expensesRecorded = yExpenses.reduce((s,e) => s + (Number(e.amount)||0), 0);

      const lowStockCount = products.filter(p => {
        const remaining = Number(p.stockRemaining) || 0;
        const threshold = Number(p.lowStockThreshold) || 5;
        return remaining <= threshold;
      }).length;

      dailyStats = {
        title: `Yesterday's Summary — ${yesterdayDisplay}`,
        totalBills,
        revenue: revCash + revCredit,
        revCash,
        revCredit,
        itemsSold,
        newCreditBills,
        expensesRecorded,
        lowStockCount,
        date: todayISO
      };
    }

    let weeklyStats = null;
    if (showWeekly) {
      const wBills = bills.filter(b => lastWeekISOArray.includes(b.date));
      const totalBills = wBills.length;
      const wRevenue = wBills.filter(b => b.status === 'paid').reduce((s,b)=>s+(Number(b.netTotal)||0),0);
      const newCreditCustomers = wBills.filter(b => b.paymentMethod === 'credit').length;
      
      const wExpensesArr = expenses.filter(e => {
        if (!e.date) return false;
        const eDateStr = (e.date.toDate ? e.date.toDate() : new Date(e.date)).toISOString().split('T')[0];
        return lastWeekISOArray.includes(eDateStr);
      });
      const wExpenses = wExpensesArr.reduce((s,e) => s + (Number(e.amount)||0), 0);
      const netProfit = wRevenue - wExpenses;

      const dayTotals = {};
      wBills.filter(b=>b.status==='paid').forEach(b => {
        dayTotals[b.date] = (dayTotals[b.date] || 0) + (Number(b.netTotal) || 0);
      });
      let bestDay = null;
      let bestDayRev = 0;
      for (const [date, rev] of Object.entries(dayTotals)) {
        if (rev > bestDayRev) { bestDayRev = rev; bestDay = date; }
      }
      const bestDayStr = bestDay ? new Date(bestDay).toLocaleDateString('en-GB', {weekday:'long'}) : 'N/A';

      const prodTotals = {};
      wBills.forEach(b => {
        b.items?.forEach(item => {
          if (!prodTotals[item.productId]) prodTotals[item.productId] = { name: item.name, qty: 0 };
          prodTotals[item.productId].qty += Number(item.qty);
        });
      });
      let bestProd = null;
      for (const [id, data] of Object.entries(prodTotals)) {
        if (!bestProd || data.qty > bestProd.qty) bestProd = data;
      }

      weeklyStats = {
        title: `Last Week at a Glance — ${lastWeekDisplay}`,
        wRevenue,
        wExpenses,
        netProfit,
        bestDayStr,
        bestDayRev,
        bestProdName: bestProd ? bestProd.name : 'N/A',
        bestProdQty: bestProd ? bestProd.qty : 0,
        totalBills,
        newCreditCustomers,
        weekNum: currentWeekNum
      };
    }

    return { dailySummary: dailyStats, weeklySummary: weeklyStats, showDaily, showWeekly };
  }, [bills, expenses, products, userProfile, todayISO]);

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

  const dismissDaily = async () => {
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid), { lastSummaryShown: dailySummary.date }); } 
    catch (err) { console.error(err); }
  };

  const dismissWeekly = async () => {
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid), { lastWeeklySummaryShown: weeklySummary.weekNum }); } 
    catch (err) { console.error(err); }
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

      {/* ── DAILY & WEEKLY SUMMARIES ── */}
      {showDaily && dailySummary && (
        <div className="bg-primary-900/40 border border-primary-500/30 rounded-2xl p-6 relative shadow-lg">
          <button onClick={dismissDaily} className="absolute top-4 right-4 text-primary-300 hover:text-white hover:bg-primary-500/20 p-1.5 rounded-full transition-colors">
            <X size={18} />
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary-500/20 text-primary-400 rounded-xl"><FileText size={20} /></div>
            <h2 className="text-lg font-bold text-white font-heading">{dailySummary.title}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4 text-sm">
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Total Bills</p>
              <p className="font-bold text-white text-lg">{dailySummary.totalBills}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Revenue</p>
              <p className="font-bold text-green-400 text-lg">${dailySummary.revenue.toLocaleString(undefined, {minimumFractionDigits:2})}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Cash: ${dailySummary.revCash} | Credit: ${dailySummary.revCredit}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Items Sold</p>
              <p className="font-bold text-white text-lg">{dailySummary.itemsSold}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">New Credit Bills</p>
              <p className="font-bold text-white text-lg">{dailySummary.newCreditBills}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Expenses</p>
              <p className="font-bold text-red-400 text-lg">${dailySummary.expensesRecorded.toLocaleString(undefined, {minimumFractionDigits:2})}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Low Stock Alerts</p>
              <p className="font-bold text-amber-400 text-lg">{dailySummary.lowStockCount}</p>
            </div>
          </div>
          <button onClick={() => navigate('/analytics?tab=bills')} className="text-xs font-bold text-primary-400 hover:text-primary-300 flex items-center gap-1 transition-colors">
            View full report <ArrowRight size={14} />
          </button>
        </div>
      )}

      {showWeekly && weeklySummary && (
        <div className="bg-purple-900/30 border border-purple-500/30 rounded-2xl p-6 relative shadow-lg">
          <button onClick={dismissWeekly} className="absolute top-4 right-4 text-purple-300 hover:text-white hover:bg-purple-500/20 p-1.5 rounded-full transition-colors">
            <X size={18} />
          </button>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl"><BarChart2 size={20} /></div>
            <h2 className="text-lg font-bold text-white font-heading">{weeklySummary.title}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Net Profit</p>
              <p className={`font-bold text-lg ${weeklySummary.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${weeklySummary.netProfit.toLocaleString(undefined, {minimumFractionDigits:2})}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">Rev: ${weeklySummary.wRevenue} | Exp: ${weeklySummary.wExpenses}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Best Selling Day</p>
              <p className="font-bold text-white">{weeklySummary.bestDayStr}</p>
              <p className="text-[10px] text-primary-400 mt-0.5">${weeklySummary.bestDayRev.toLocaleString(undefined, {minimumFractionDigits:2})}</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Best Selling Product</p>
              <p className="font-bold text-white truncate">{weeklySummary.bestProdName}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{weeklySummary.bestProdQty} units sold</p>
            </div>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-gray-400 text-xs mb-1">Volume</p>
              <p className="font-bold text-white text-lg">{weeklySummary.totalBills} Bills</p>
              <p className="text-[10px] text-amber-400 mt-0.5">{weeklySummary.newCreditCustomers} New Credit</p>
            </div>
          </div>
          <button onClick={() => navigate('/analytics')} className="text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors">
            View Analytics <ArrowRight size={14} />
          </button>
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
