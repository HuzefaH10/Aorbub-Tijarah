import React, { useState, useEffect, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import { useEntries, useProducts } from '../hooks/useFirestore';
import { Calendar, Settings2, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import ChartWidget from '../components/dashboard/ChartWidget';
import TableWidget from '../components/dashboard/TableWidget';
import WidgetPanel from '../components/dashboard/WidgetPanel';
import Pickers from '../components/dashboard/Pickers';

const ResponsiveGridLayout = WidthProvider(Responsive);

const defaultWidgets = [
  { id: 'w_rev_time', type: 'area', name: 'Revenue Over Time', dataset: 'revenueByDate', isChart: true, enabled: true, w: 12, h: 4 },
  { id: 'w_sales_prod', type: 'bar-h', name: 'Sales by Product', dataset: 'salesByProduct', isChart: true, enabled: true, w: 6, h: 4 },
  { id: 'w_cat_split', type: 'donut', name: 'Category Split', dataset: 'categorySplit', isChart: true, enabled: true, w: 4, h: 4 },
  { id: 'w_top_table', type: 'top-products', name: 'Top Products Table', dataset: 'topProductsTable', isChart: false, enabled: true, w: 12, h: 3 }
];

const defaultLayout = [
  { i: 'w_rev_time', x: 0, y: 0, w: 12, h: 4 },
  { i: 'w_sales_prod', x: 0, y: 4, w: 6, h: 4 },
  { i: 'w_cat_split', x: 6, y: 4, w: 4, h: 4 },
  { i: 'w_top_table', x: 0, y: 8, w: 12, h: 3 }
];

export default function SalesAnalytics() {
  const { entries, loading } = useEntries();
  const navigate = useNavigate();
  
  // State
  const [isEditMode, setIsEditMode] = useState(false);
  const [pickerType, setPickerType] = useState(null); // 'chart' or 'table'
  
  const [widgets, setWidgets] = useState(() => {
    const saved = localStorage.getItem('bizDashboardWidgets');
    return saved ? JSON.parse(saved) : defaultWidgets;
  });
  
  const [layouts, setLayouts] = useState(() => {
    const saved = localStorage.getItem('bizDashboardLayout');
    return saved ? JSON.parse(saved) : { lg: defaultLayout };
  });

  const [dateFilter, setDateFilter] = useState({ from: '', to: '' });

  // Persistence
  useEffect(() => {
    localStorage.setItem('bizDashboardWidgets', JSON.stringify(widgets));
  }, [widgets]);

  const onLayoutChange = (layout, allLayouts) => {
    setLayouts(allLayouts);
    localStorage.setItem('bizDashboardLayout', JSON.stringify(allLayouts));
  };

  // Data Computations
  const computedData = useMemo(() => {
    const filtered = entries.filter(e => {
      if (dateFilter.from && e.date < dateFilter.from) return false;
      if (dateFilter.to && e.date > dateFilter.to) return false;
      return true;
    });

    // 1. Revenue By Date
    const rbdMap = {};
    filtered.forEach(e => { rbdMap[e.date] = (rbdMap[e.date] || 0) + e.revenue; });
    const rbdSorted = Object.entries(rbdMap).sort((a, b) => a[0].localeCompare(b[0]));
    
    // 2. Revenue By Product
    const rbpMap = {};
    filtered.forEach(e => { rbpMap[e.product] = (rbpMap[e.product] || 0) + e.revenue; });
    const rbpSorted = Object.entries(rbpMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // 3. Category Split
    const catMap = {};
    filtered.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.revenue; });
    const catSorted = Object.entries(catMap);

    // 4. Daily Order Volume
    const ordersMap = {};
    filtered.forEach(e => { ordersMap[e.date] = (ordersMap[e.date] || 0) + 1; });
    const ordersSorted = Object.entries(ordersMap).sort((a, b) => a[0].localeCompare(b[0]));

    // 5. Profit By Product
    const pbpMap = {};
    filtered.forEach(e => {
      if (!pbpMap[e.product]) pbpMap[e.product] = { r: 0, c: 0, p: 0 };
      pbpMap[e.product].r += e.revenue;
      pbpMap[e.product].c += e.cost;
      pbpMap[e.product].p += (e.revenue - e.cost);
    });
    const pbpSorted = Object.entries(pbpMap).sort((a, b) => b[1].p - a[1].p).slice(0, 10);

    // 6. Velocity
    const prodQtyMap = {};
    const prodDates = {};
    filtered.forEach(e => {
      prodQtyMap[e.product] = (prodQtyMap[e.product] || 0) + e.quantitySold;
      if (!prodDates[e.product]) prodDates[e.product] = new Set();
      prodDates[e.product].add(e.date);
    });
    const velocityList = Object.entries(prodQtyMap).map(([p, q]) => ({
      product: p, avg: (q / (prodDates[p]?.size || 1)).toFixed(1)
    })).sort((a, b) => b.avg - a.avg);

    // 7. Weekly Heatmap (Simplified for ApexCharts format)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const heatmapMap = {};
    filtered.forEach(e => {
      const d = new Date(e.date);
      const w = `Week ${Math.ceil(d.getDate() / 7)}`;
      const dayName = days[d.getDay() === 0 ? 6 : d.getDay() - 1]; // Make Monday 0
      if (!heatmapMap[w]) heatmapMap[w] = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 };
      heatmapMap[w][dayName] += e.revenue;
    });
    const heatmapSeries = Object.entries(heatmapMap).map(([w, dMap]) => ({
      name: w, data: days.map(d => ({ x: d, y: dMap[d] }))
    }));

    // 8. Profit Trend (Scatter/Dual Axis)
    const profitTrend = { labels: rbdSorted.map(x => x[0]), profit: [], margin: [] };
    rbdSorted.forEach(([date, rev]) => {
      const dayEntries = filtered.filter(e => e.date === date);
      const dayCost = dayEntries.reduce((s, e) => s + e.cost, 0);
      const dayProfit = rev - dayCost;
      profitTrend.profit.push(dayProfit);
      profitTrend.margin.push(rev > 0 ? ((dayProfit / rev) * 100).toFixed(1) : 0);
    });

    // 9. Scatter
    const scatterSeries = [{
      name: 'Sales',
      data: filtered.map(e => [e.quantitySold, e.revenue])
    }];

    // Insights Generation
    const insights = [];
    if (rbpSorted.length > 0) insights.push(`🏆 ${rbpSorted[0][0]} is your top earner at $${rbpSorted[0][1].toLocaleString()}`);
    const negativeProfit = pbpSorted.find(x => x[1].p < 0);
    if (negativeProfit) insights.push(`⚠️ ${negativeProfit[0]} has negative profit — review pricing`);
    if (velocityList.length > 0) insights.push(`🔁 ${velocityList[0].product} sells rapidly at ${velocityList[0].avg} units/day`);

    // Top Products Table
    const topProductsList = rbpSorted.map(x => ({ product: x[0], revenue: x[1], qty: prodQtyMap[x[0]] }));

    // Period Comparison
    const ws = d => { const dd = new Date(d); dd.setDate(dd.getDate() - dd.getDay()); return dd.toISOString().split('T')[0]; };
    const today = new Date();
    const twStart = ws(today), lwStart = ws(new Date(today.getTime() - 7 * 86400000));
    const twEntries = entries.filter(e => e.date >= twStart);
    const lwEntries = entries.filter(e => e.date >= lwStart && e.date < twStart);
    const periodComparison = {
      twRev: twEntries.reduce((s, e) => s + e.revenue, 0),
      lwRev: lwEntries.reduce((s, e) => s + e.revenue, 0),
      twProfit: twEntries.reduce((s, e) => s + (e.revenue - e.cost), 0),
      lwProfit: lwEntries.reduce((s, e) => s + (e.revenue - e.cost), 0)
    };

    return {
      revenueByDate: { labels: rbdSorted.map(x => x[0]), values: rbdSorted.map(x => x[1]) },
      revenueByProduct: { labels: rbpSorted.map(x => x[0]), values: rbpSorted.map(x => x[1]) },
      categorySplit: { labels: catSorted.map(x => x[0]), values: catSorted.map(x => x[1]) },
      ordersByDate: { labels: ordersSorted.map(x => x[0]), values: ordersSorted.map(x => x[1]) },
      profitByProduct: { 
        labels: pbpSorted.map(x => x[0]), 
        revenue: pbpSorted.map(x => x[1].r), 
        cost: pbpSorted.map(x => x[1].c), 
        profit: pbpSorted.map(x => x[1].p) 
      },
      topProducts: {
        labels: rbpSorted.map(x => x[0]),
        percentages: rbpSorted.map(x => Math.round((x[1] / (rbpSorted[0]?.[1] || 1)) * 100))
      },
      scatterPlot: { series: scatterSeries },
      weeklyHeatmap: { series: heatmapSeries },
      profitTrend,
      topProductsList,
      salesVelocity: velocityList,
      insights,
      periodComparison
    };
  }, [entries, dateFilter]);

  // Handlers
  const handleToggleWidget = (id) => {
    setWidgets(ws => ws.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  };

  const handleRenameWidget = (id, newName) => {
    setWidgets(ws => ws.map(w => w.id === id ? { ...w, name: newName } : w));
  };

  const handleRemoveWidget = (id) => {
    setWidgets(ws => ws.filter(w => w.id !== id));
  };

  const handleAddWidget = (widgetConfig) => {
    setWidgets([...widgets, widgetConfig]);
    const lg = layouts.lg || [];
    // Place at bottom
    let maxY = 0;
    lg.forEach(l => { if (l.y + l.h > maxY) maxY = l.y + l.h; });
    setLayouts({
      ...layouts,
      lg: [...lg, { i: widgetConfig.id, x: 0, y: maxY, w: widgetConfig.w, h: widgetConfig.h }]
    });
  };

  const activeWidgets = widgets.filter(w => w.enabled);

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      
      {/* Date Filter Bar */}
      <div className="glass !rounded-none !border-t-0 !border-x-0 px-6 py-3 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Calendar size={18} className="text-primary-500" />
          <div className="flex items-center gap-2">
            <input type="date" value={dateFilter.from} onChange={e => setDateFilter({...dateFilter, from: e.target.value})} className="glass text-gray-800 dark:text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary-500" />
            <span className="text-gray-400">to</span>
            <input type="date" value={dateFilter.to} onChange={e => setDateFilter({...dateFilter, to: e.target.value})} className="glass text-gray-800 dark:text-white rounded-lg px-3 py-1.5 text-xs outline-none focus:border-primary-500" />
          </div>
          {(dateFilter.from || dateFilter.to) && (
            <button onClick={() => setDateFilter({from:'', to:''})} className="text-xs text-primary-500 hover:underline font-medium">Clear Filter</button>
          )}
        </div>
        
        <button 
          onClick={() => setIsEditMode(!isEditMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isEditMode ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'glass hover:bg-white/5'}`}
        >
          <Settings2 size={16} />
          {isEditMode ? 'Done Editing' : 'Edit Layout'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Grid Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={60}
            onLayoutChange={onLayoutChange}
            isDraggable={isEditMode}
            isResizable={isEditMode}
            margin={[16, 16]}
            draggableHandle=".widget-drag-handle"
          >
            {activeWidgets.map(w => (
              <div key={w.id} className="glass overflow-hidden flex flex-col group">
                <div className={`px-4 py-2.5 border-b border-white/5 flex items-center justify-between bg-black/10 ${isEditMode ? 'widget-drag-handle cursor-move' : ''}`}>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-white font-heading">{w.name}</h3>
                  {isEditMode && <div className="text-xs text-gray-400 font-medium">Drag</div>}
                </div>
                <div className="flex-1 overflow-hidden relative">
                  {w.isChart ? (
                    <ChartWidget widget={w} data={computedData} />
                  ) : (
                    <TableWidget widget={w} data={computedData} />
                  )}
                  {isEditMode && (
                    <div className="absolute bottom-0 right-0 w-4 h-4 bg-primary-500/20 cursor-se-resize rounded-tl-full" />
                  )}
                </div>
              </div>
            ))}
          </ResponsiveGridLayout>
          
          {activeWidgets.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p>No active widgets. Enable some from the right panel.</p>
            </div>
          )}
        </div>

        {/* Right Sidebar Panel */}
        <div className="w-[320px] shrink-0 glass !border-y-0 !border-r-0 !rounded-none z-20">
          <WidgetPanel 
            widgets={widgets}
            onToggle={handleToggleWidget}
            onRename={handleRenameWidget}
            onRemove={handleRemoveWidget}
            onOpenPicker={setPickerType}
          />
        </div>
      </div>

      {pickerType && (
        <Pickers 
          type={pickerType}
          onClose={() => setPickerType(null)}
          onAdd={handleAddWidget}
        />
      )}
    </div>
  );
}
