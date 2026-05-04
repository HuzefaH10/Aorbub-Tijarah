import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEntries, useProducts, useEvents, useSettings } from '../hooks/useFirestore';
import ReactApexChart from 'react-apexcharts';
import { 
  TrendingUp, Package, Calendar, CircleDollarSign, 
  PlusCircle, CalendarPlus, BarChart2,
  AlertCircle, Info, ChevronRight, XCircle
} from 'lucide-react';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { entries, loading: entriesLoading } = useEntries();
  const { products, loading: productsLoading } = useProducts();
  const { events, loading: eventsLoading } = useEvents();
  const { settings } = useSettings();
  const businessName = settings?.businessName || 'Supreme Sanitory';

  const loading = entriesLoading || productsLoading || eventsLoading;

  // -- Computed Data --
  const computed = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1)); // Monday
    const thisWeekStart = d.toISOString().split('T')[0];

    const todayEntries = entries.filter(e => e.date === todayStr);
    const weekEntries = entries.filter(e => e.date >= thisWeekStart);

    // 1. KPIs
    const todaysRevenue = todayEntries.reduce((sum, e) => sum + e.revenue, 0);
    const thisWeekProfit = weekEntries.reduce((sum, e) => sum + (e.revenue - e.cost), 0);
    
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockAlerts = [];
    const outOfStockAlerts = [];
    
    products.forEach(p => {
      const remaining = Number(p.stockRemaining) || 0;
      const threshold = Number(p.lowStockThreshold) || 5;
      if (remaining === 0) {
        outOfStockCount++;
        outOfStockAlerts.push(`🔴 Out of Stock: ${p.name} is out of stock`);
      } else if (remaining <= threshold) {
        lowStockCount++;
        lowStockAlerts.push(`🟡 Low Stock: ${p.name} is running low (${remaining} units remaining)`);
      }
    });

    const upcomingEvents = events.filter(e => {
      const eDate = new Date(e.date);
      const today = new Date(todayStr);
      const diffTime = eDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    });

    // Alerts logic
    const alerts = [];
    alerts.push(...outOfStockAlerts);
    alerts.push(...lowStockAlerts);
    
    // Loss alert
    const productProfitMap = {};
    entries.forEach(e => {
      if ((e.revenue - e.cost) < 0) {
        productProfitMap[e.product] = (productProfitMap[e.product] || 0) + 1;
      }
    });
    Object.entries(productProfitMap).forEach(([pName, count]) => {
      if (count >= 3) alerts.push(`📉 Loss Alert: ${pName} has been recorded at a loss ${count} times — review pricing`);
    });

    upcomingEvents.forEach(e => {
      alerts.push(`📅 Upcoming Event: ${e.title} is scheduled for ${e.date}`);
    });

    if (todayEntries.length === 0) {
      alerts.push(`📊 No Sales Today: No sales logged today yet`);
    }

    // Mini Charts Data
    // A. 7-Day Revenue
    const last7Days = [...Array(7)].map((_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      return dt.toISOString().split('T')[0];
    }).reverse();
    
    let total7DayRev = 0;
    const rev7Data = last7Days.map(date => {
      const dayRev = entries.filter(e => e.date === date).reduce((s, e) => s + e.revenue, 0);
      total7DayRev += dayRev;
      return { x: date, y: dayRev };
    });

    // B. Category Donut
    const catMap = {};
    entries.forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + e.revenue;
    });
    const catData = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    // Recent Activity (combine and sort)
    const activities = [
      ...entries.map(e => ({ type: 'sale', date: e.createdAt?.toDate?.() || new Date(e.date), text: `Logged sale: ${e.product} — ${e.quantitySold} units — $${e.revenue.toLocaleString()}` })),
      ...entries.filter(e => e.stockAdded > 0).map(e => ({ type: 'restock', date: e.createdAt?.toDate?.() || new Date(e.date), text: `Restocked: ${e.product} — ${e.stockAdded} units added` })),
      ...events.map(e => ({ type: 'event', date: e.createdAt?.toDate?.() || new Date(), text: `Event added: ${e.title} on ${e.date}` }))
    ].sort((a, b) => b.date - a.date).slice(0, 5);

    return {
      todaysRevenue,
      thisWeekProfit,
      lowStockCount: lowStockCount + outOfStockCount,
      upcomingEventsCount: upcomingEvents.length,
      alerts,
      rev7Data,
      total7DayRev,
      catData,
      activities,
      isEmpty: entries.length === 0 && products.length === 0 && events.length === 0
    };
  }, [entries, products, events]);

  // -- Presentation Logic --
  const hour = new Date().getHours();
  let greeting = "Good evening";
  if (hour >= 5 && hour < 12) greeting = "Good morning";
  else if (hour >= 12 && hour < 17) greeting = "Good afternoon";
  else if (hour >= 21 || hour < 5) greeting = "Good night";

  const firstName = user?.displayName?.split(' ')[0] || "Huzefa";
  const dateOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const todayDisplay = new Date().toLocaleDateString('en-GB', dateOptions);

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (computed.isEmpty) {
    return (
      <div className="flex flex-col h-[calc(100vh-100px)] items-center justify-center animate-fadeIn p-6">
        <div className="glass rounded-3xl p-10 max-w-2xl w-full text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-primary-400 font-heading mb-4">Welcome to {businessName}</h1>
          <p className="text-gray-400 text-lg mb-12">Your business command center is ready. Start by setting up your workflow.</p>
          
          <div className="space-y-4 max-w-md mx-auto relative before:absolute before:inset-0 before:ml-[28px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/10 before:to-transparent">
            
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group cursor-pointer" onClick={() => navigate('/inventory')}>
              <div className="flex items-center justify-center w-14 h-14 rounded-full border-4 border-transparent glass !bg-primary-900/50 text-primary-400 font-bold text-xl z-10 shadow-xl group-hover:scale-110 transition-transform">1</div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] glass p-4 rounded-2xl group-hover:border-primary-500/50 transition-colors">
                <h3 className="font-bold text-white text-left">Add your products</h3>
                <p className="text-sm text-gray-500 text-left">Set up your inventory</p>
              </div>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal group cursor-pointer" onClick={() => navigate('/data-entry')}>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] glass p-4 rounded-2xl group-hover:border-primary-500/50 transition-colors">
                <h3 className="font-bold text-white text-left md:text-right">Log your first sale</h3>
                <p className="text-sm text-gray-500 text-left md:text-right">Record revenue & costs</p>
              </div>
              <div className="flex items-center justify-center w-14 h-14 rounded-full border-4 border-transparent glass text-gray-500 font-bold text-xl z-10 shadow-xl group-hover:scale-110 transition-transform">2</div>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group cursor-pointer" onClick={() => navigate('/calendar')}>
              <div className="flex items-center justify-center w-14 h-14 rounded-full border-4 border-transparent glass text-gray-500 font-bold text-xl z-10 shadow-xl group-hover:scale-110 transition-transform">3</div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] glass p-4 rounded-2xl group-hover:border-primary-500/50 transition-colors">
                <h3 className="font-bold text-white text-left">Schedule an event</h3>
                <p className="text-sm text-gray-500 text-left">Plan restocks & meetings</p>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // --- Chart Configs ---
  const sparklineOptions = {
    chart: { type: 'area', sparkline: { enabled: true }, animations: { enabled: true, easing: 'easeinout', speed: 800 } },
    stroke: { curve: 'smooth', width: 2, colors: ['#c9a84c'] },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0, stops: [0, 100] }, colors: ['#c9a84c'] },
    tooltip: { theme: 'dark', fixed: { enabled: false }, x: { show: true }, y: { title: { formatter: () => '$' } }, marker: { show: false } }
  };

  const donutOptions = {
    chart: { type: 'donut', background: 'transparent', animations: { enabled: true, easing: 'easeinout', speed: 800 } },
    labels: computed.catData.map(x => x[0]),
    colors: ['#c9a84c', '#4ade80', '#60a5fa', '#f87171', '#a78bfa'],
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { position: 'bottom', labels: { colors: '#9a9080' }, itemMargin: { horizontal: 5, vertical: 5 } },
    plotOptions: { pie: { donut: { size: '75%', labels: { show: true, name: { color: '#9a9080' }, value: { color: '#fff', fontSize: '24px', fontWeight: 700, formatter: (val) => `$${Number(val).toLocaleString()}` }, total: { show: true, label: 'Total', color: '#9a9080', formatter: (w) => `$${w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString()}` } } } } },
    tooltip: { theme: 'dark', y: { formatter: (val) => `$${val.toLocaleString()}` } }
  };

  return (
    <div className="space-y-8 pb-10 animate-fadeIn">
      
      {/* SECTION 1: Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-primary-400 font-heading mb-1">{greeting}, {firstName}</h1>
          <p className="text-gray-400 font-medium">{todayDisplay}</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${computed.thisWeekProfit > 0 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : computed.thisWeekProfit < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
          {computed.thisWeekProfit > 0 ? 'Business is profitable this week ✅' : computed.thisWeekProfit < 0 ? 'Loss recorded this week ⚠️' : 'No activity logged this week'}
        </div>
      </div>

      {/* SECTION 2: KPI Snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard 
          title="Today's Revenue" 
          value={computed.todaysRevenue > 0 ? `$${computed.todaysRevenue.toLocaleString()}` : '—'} 
          icon={CircleDollarSign} 
          onClick={() => navigate('/profit')} 
        />
        <KPICard 
          title="This Week's Profit" 
          value={computed.thisWeekProfit === 0 ? '—' : `${computed.thisWeekProfit < 0 ? '-' : ''}$${Math.abs(computed.thisWeekProfit).toLocaleString()}`} 
          valueColor={computed.thisWeekProfit > 0 ? 'text-green-400' : computed.thisWeekProfit < 0 ? 'text-red-400' : 'text-white'}
          icon={TrendingUp} 
          onClick={() => navigate('/profit')} 
        />
        <KPICard 
          title="Low Stock Items" 
          value={computed.lowStockCount > 0 ? computed.lowStockCount : 'All Good'} 
          valueColor={computed.lowStockCount > 0 ? 'text-red-400' : 'text-green-400'}
          icon={Package} 
          onClick={() => navigate('/inventory')} 
        />
        <KPICard 
          title="Events This Week" 
          value={computed.upcomingEventsCount > 0 ? computed.upcomingEventsCount : 'None Scheduled'} 
          icon={Calendar} 
          onClick={() => navigate('/calendar')} 
        />
      </div>

      {/* SECTION 3: Quick Actions */}
      <div>
        <h2 className="text-[11px] font-bold text-primary-500/70 uppercase tracking-[0.2em] mb-4 flex items-center after:content-[''] after:h-px after:bg-primary-500/20 after:flex-1 after:ml-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ActionButton icon={PlusCircle} title="Log a Sale" desc="Record today's revenue & costs" onClick={() => navigate('/data-entry')} />
          <ActionButton icon={Package} title="Update Inventory" desc="Restock or adjust levels" onClick={() => navigate('/inventory')} />
          <ActionButton icon={CalendarPlus} title="Schedule Event" desc="Add a restock or meeting" onClick={() => navigate('/calendar')} />
          <ActionButton icon={BarChart2} title="Profit Optimization" desc="Analyze & optimize margins" onClick={() => navigate('/profit')} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* SECTION 4: Alerts */}
        <div className="glass rounded-2xl p-5 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-lg font-heading">Alerts</h3>
            {computed.alerts.length > 0 && <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">{computed.alerts.length}</span>}
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
            {computed.alerts.length === 0 ? (
              <div className="bg-green-500/10 border-l-4 border-green-500 p-3 rounded-r-lg flex gap-3 h-full items-center justify-center text-green-400 font-medium">
                ✅ All clear — no alerts today
              </div>
            ) : (
              computed.alerts.slice(0, 6).map((alert, i) => {
                const isRed = alert.includes('🔴') || alert.includes('📉');
                const isYellow = alert.includes('🟡');
                const isBlue = alert.includes('📅');
                return (
                  <div key={i} className={`glass border-l-4 p-3 rounded-r-lg flex gap-3 text-sm text-gray-300 ${isRed ? 'border-red-500' : isYellow ? 'border-yellow-500' : isBlue ? 'border-blue-500' : 'border-primary-500'}`}>
                    {alert}
                  </div>
                );
              })
            )}
            {computed.alerts.length > 6 && <div className="text-xs text-center text-gray-500 pt-2">+ {computed.alerts.length - 6} more alerts</div>}
          </div>
        </div>

        {/* SECTION 5: Mini Charts */}
        <div className="glass rounded-2xl p-5 flex flex-col justify-between h-[400px]">
          <h3 className="font-bold text-white text-lg font-heading mb-2">7-Day Revenue</h3>
          <div className="text-3xl font-bold text-white mb-2">${computed.total7DayRev.toLocaleString()}</div>
          <div className="flex-1 -mx-2 -mb-2">
            {computed.total7DayRev > 0 ? (
              <ReactApexChart options={sparklineOptions} series={[{ name: 'Revenue', data: computed.rev7Data }]} type="area" height="100%" />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600 font-medium">No data</div>
            )}
          </div>
        </div>

        <div className="glass rounded-2xl p-5 flex flex-col h-[400px]">
          <h3 className="font-bold text-white text-lg font-heading mb-4">Sales by Category</h3>
          <div className="flex-1 flex items-center justify-center">
            {computed.catData.length > 0 ? (
              <ReactApexChart options={donutOptions} series={computed.catData.map(x => x[1])} type="donut" height="100%" />
            ) : (
              <div className="text-gray-600 font-medium">No entries yet</div>
            )}
          </div>
        </div>

      </div>

      {/* SECTION 6: Recent Activity */}
      <div className="glass rounded-2xl p-5">
        <h3 className="font-bold text-white text-lg font-heading mb-4">Recent Activity</h3>
        {computed.activities.length === 0 ? (
          <p className="text-gray-500 italic py-4">No activity yet — start by logging your first sale.</p>
        ) : (
          <div className="space-y-4">
            {computed.activities.map((act, i) => {
              const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
              const diffDays = Math.round((act.date - new Date()) / (1000 * 60 * 60 * 24));
              const timeStr = diffDays === 0 ? 'Today' : rtf.format(diffDays, 'day');
              
              return (
                <div key={i} className="flex items-center gap-4 group">
                  <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${act.type === 'sale' ? 'bg-primary-500 shadow-primary-500/50' : act.type === 'restock' ? 'bg-blue-500 shadow-blue-500/50' : 'bg-green-500 shadow-green-500/50'}`} />
                  <p className="flex-1 text-sm text-gray-300 group-hover:text-white transition-colors">{act.text}</p>
                  <span className="text-xs text-gray-500 font-medium">{timeStr}</span>
                </div>
              );
            })}
          </div>
        )}
        {computed.activities.length > 0 && (
          <button onClick={() => navigate('/profit')} className="mt-6 w-full py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-gray-300 transition-colors">
            View All in Profit Optimization
          </button>
        )}
      </div>

    </div>
  );
}

function KPICard({ title, value, icon: Icon, valueColor = "text-white", onClick }) {
  return (
    <div 
      onClick={onClick}
      className="glass rounded-2xl p-5 cursor-pointer hover:-translate-y-1 hover:border-primary-500/50 hover:shadow-xl hover:shadow-primary-500/10 transition-all duration-300 group flex flex-col"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-semibold text-gray-500">{title}</h3>
        <Icon size={18} className="text-primary-500/70 group-hover:text-primary-400 transition-colors" />
      </div>
      <div className={`text-3xl font-bold font-heading mt-auto ${valueColor}`}>{value}</div>
    </div>
  );
}

function ActionButton({ icon: Icon, title, desc, onClick }) {
  return (
    <div 
      onClick={onClick}
      className="glass rounded-2xl p-5 cursor-pointer hover:-translate-y-1 hover:border-primary-500/50 transition-all duration-300 group flex items-start gap-4"
    >
      <div className="w-12 h-12 rounded-xl glass flex items-center justify-center shrink-0 group-hover:bg-primary-900/30 group-hover:border-primary-500/30 transition-colors">
        <Icon size={24} className="text-gray-400 group-hover:text-primary-400 transition-colors" />
      </div>
      <div>
        <h3 className="font-bold text-white mb-0.5 group-hover:text-primary-400 transition-colors">{title}</h3>
        <p className="text-xs text-gray-500 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
