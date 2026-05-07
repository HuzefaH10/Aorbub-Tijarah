import React, { useState, useEffect, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useBills, useProducts } from '../hooks/useFirestore';
import { Calendar, Settings2, Download, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import ChartWidget from '../components/dashboard/ChartWidget';
import TableWidget from '../components/dashboard/TableWidget';
import WidgetPanel from '../components/dashboard/WidgetPanel';
import Pickers from '../components/dashboard/Pickers';
import CsvUploader from '../components/dashboard/CsvUploader';
import ExportModal from '../components/dashboard/ExportModal';
import Toast, { useToast } from '../components/ui/Toast';

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

// Valid datasets for the current data model
const VALID_DATASETS = new Set([
  'revenueByDate', 'salesByProduct', 'categorySplit', 'topProductsTable'
]);
const SCHEMA_VERSION = 'v2';

const getPresetDates = (preset) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const d = new Date(); // fresh date for manipulations
  
  switch (preset) {
    case 'Today':
      return { from: today, to: today };
    case 'This Week': {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return { from: monday.toISOString().split('T')[0], to: today };
    }
    case 'This Month': {
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
      return { from: firstDay.toISOString().split('T')[0], to: today };
    }
    case 'This Year': {
      const firstDay = new Date(d.getFullYear(), 0, 1);
      return { from: firstDay.toISOString().split('T')[0], to: today };
    }
    default:
      return { from: '', to: '' };
  }
};

// Derive the comparison period from the primary preset
const getComparePreset = (primaryPreset, primaryFilter) => {
  const d = new Date();
  switch (primaryPreset) {
    case 'Today': {
      const yest = new Date(d); yest.setDate(d.getDate() - 1);
      const s = yest.toISOString().split('T')[0];
      return { label: 'Yesterday', filter: { from: s, to: s } };
    }
    case 'This Week': {
      const day = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
      const prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7);
      const prevSun = new Date(prevMon); prevSun.setDate(prevMon.getDate() + 6);
      return { label: 'Last Week', filter: { from: prevMon.toISOString().split('T')[0], to: prevSun.toISOString().split('T')[0] } };
    }
    case 'This Month': {
      const firstOfLast = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const lastOfLast  = new Date(d.getFullYear(), d.getMonth(), 0);
      return { label: 'Last Month', filter: { from: firstOfLast.toISOString().split('T')[0], to: lastOfLast.toISOString().split('T')[0] } };
    }
    case 'This Year': {
      const firstOfLastYear = new Date(d.getFullYear() - 1, 0, 1);
      const lastOfLastYear  = new Date(d.getFullYear() - 1, 11, 31);
      return { label: `${d.getFullYear() - 1}`, filter: { from: firstOfLastYear.toISOString().split('T')[0], to: lastOfLastYear.toISOString().split('T')[0] } };
    }
    default: {
      // For custom, shift by same # of days
      if (primaryFilter.from && primaryFilter.to) {
        const fromMs = new Date(primaryFilter.from).getTime();
        const toMs   = new Date(primaryFilter.to).getTime();
        const span   = toMs - fromMs;
        const cTo    = new Date(fromMs - 86400000);
        const cFrom  = new Date(cTo.getTime() - span);
        return { label: 'Previous Period', filter: { from: cFrom.toISOString().split('T')[0], to: cTo.toISOString().split('T')[0] } };
      }
      return { label: 'Compare', filter: { from: '', to: '' } };
    }
  }
};

const fmt = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const rangeLabel = (filter) => {
  if (!filter.from && !filter.to) return 'All time';
  if (filter.from === filter.to) return fmt(filter.from);
  return `${fmt(filter.from)} – ${fmt(filter.to)}`;
};

export default function SalesAnalytics() {
  const { bills, loading } = useBills();
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();
  
  // State
  const [isEditMode, setIsEditMode] = useState(false);
  const [pickerType, setPickerType] = useState(null); // 'chart' or 'table'
  const [showCsvUploader, setShowCsvUploader] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const [widgets, setWidgets] = useState(() => {
    try {
      const storedVersion = localStorage.getItem('bizDashboardVersion');
      if (storedVersion !== SCHEMA_VERSION) {
        localStorage.removeItem('bizDashboardWidgets');
        localStorage.removeItem('bizDashboardLayout');
        localStorage.setItem('bizDashboardVersion', SCHEMA_VERSION);
        return defaultWidgets;
      }
      const saved = localStorage.getItem('bizDashboardWidgets');
      if (!saved) return defaultWidgets;
      const parsed = JSON.parse(saved);
      // Filter out non-CSV widgets referencing removed datasets
      return parsed.filter(w => w.isCSV || VALID_DATASETS.has(w.dataset));
    } catch {
      return defaultWidgets;
    }
  });
  
  const [layouts, setLayouts] = useState(() => {
    const saved = localStorage.getItem('bizDashboardLayout');
    return saved ? JSON.parse(saved) : { lg: defaultLayout };
  });

  const [activePreset, setActivePreset] = useState('This Month');
  const [dateFilter, setDateFilter] = useState(() => getPresetDates('This Month'));

  // Compare state
  const [compareActive, setCompareActive] = useState(false);
  const [compareFilter, setCompareFilter] = useState({ from: '', to: '' });
  const [comparePreset, setComparePreset] = useState('Custom');

  const handlePresetClick = (preset) => {
    setActivePreset(preset);
    if (preset === 'Custom') return;
    setDateFilter(getPresetDates(preset));
  };

  const activateCompare = () => {
    const { filter } = getComparePreset(activePreset, dateFilter);
    setCompareFilter(filter);
    setComparePreset(activePreset === 'Custom' ? 'Custom' : 'Previous');
    setCompareActive(true);
  };

  const handleComparePresetClick = (p) => {
    setComparePreset(p);
    if (p === 'Custom') return;
    setCompareFilter(getPresetDates(p));
  };

  // Persistence
  useEffect(() => {
    localStorage.setItem('bizDashboardWidgets', JSON.stringify(widgets));
  }, [widgets]);

  const onLayoutChange = (layout, allLayouts) => {
    // Merge: keep layout positions for disabled widgets intact,
    // only update entries for currently-active widgets
    const currentActiveIds = new Set(widgets.filter(w => w.enabled).map(w => w.id));
    const merged = {};
    const allBreakpoints = new Set([...Object.keys(layouts), ...Object.keys(allLayouts)]);
    for (const bp of allBreakpoints) {
      const incoming = allLayouts[bp] || [];
      const existing = layouts[bp] || [];
      const incomingIds = new Set(incoming.map(l => l.i));
      // Keep disabled widget positions from existing, add/update active from incoming
      const disabled = existing.filter(l => !currentActiveIds.has(l.i) && !incomingIds.has(l.i));
      merged[bp] = [...incoming, ...disabled];
    }
    setLayouts(merged);
    localStorage.setItem('bizDashboardLayout', JSON.stringify(merged));
  };

  // Data Computations
  const computedData = useMemo(() => {
    const filtered = bills.filter(b => {
      // Use bill date or default to empty string for safety
      const d = b.date || '';
      if (dateFilter.from && d < dateFilter.from) return false;
      if (dateFilter.to && d > dateFilter.to) return false;
      return b.status !== 'cancelled';
    });

    // 1. Revenue By Date
    const rbdMap = {};
    filtered.forEach(b => { 
      if (b.date) {
        rbdMap[b.date] = (rbdMap[b.date] || 0) + Number(b.netTotal || 0);
      }
    });
    const rbdSorted = Object.entries(rbdMap).sort((a, b) => a[0].localeCompare(b[0]));
    
    // Process items for Product & Category metrics
    const prodQtyMap = {};
    const prodRevMap = {};
    const catMap = {};
    const prodCatMap = {};
    const prodLastSold = {};

    filtered.forEach(b => {
      const bDate = b.date || '';
      if (Array.isArray(b.items)) {
        b.items.forEach(item => {
          const pName = item.productName || 'Unknown';
          const pCat = item.category || 'Uncategorized';
          const qty = Number(item.quantity) || 0;
          const rev = Number(item.total) || 0;

          prodQtyMap[pName] = (prodQtyMap[pName] || 0) + qty;
          prodRevMap[pName] = (prodRevMap[pName] || 0) + rev;
          prodCatMap[pName] = pCat;
          catMap[pCat] = (catMap[pCat] || 0) + rev;

          if (!prodLastSold[pName] || prodLastSold[pName] < bDate) {
            prodLastSold[pName] = bDate;
          }
        });
      }
    });

    // 2. Sales By Product (Quantity based, as per prompt: "Y-axis = total quantity sold")
    const rbpSorted = Object.entries(prodQtyMap).sort((a, b) => b[1] - a[1]).slice(0, 15);

    // 3. Category Split
    const catSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

    // Top Products Table (Product | Category | Units Sold | Revenue | Last Sold)
    const topProductsList = Object.keys(prodQtyMap)
      .map(p => ({
        product: p,
        category: prodCatMap[p],
        qty: prodQtyMap[p],
        revenue: prodRevMap[p],
        lastSold: prodLastSold[p]
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 50);

    return {
      revenueByDate: { labels: rbdSorted.map(x => x[0]), values: rbdSorted.map(x => x[1]) },
      revenueByProduct: { labels: rbpSorted.map(x => x[0]), values: rbpSorted.map(x => x[1]) },
      categorySplit: { labels: catSorted.map(x => x[0]), values: catSorted.map(x => x[1]) },
      topProductsList
    };
  }, [bills, dateFilter]);

  // ── Comparison data (same computation but against compareFilter) ─────────
  const computeBillsData = (filter, allBills) => {
    const filtered = allBills.filter(b => {
      const d = b.date || '';
      if (filter.from && d < filter.from) return false;
      if (filter.to   && d > filter.to)   return false;
      return b.status !== 'cancelled';
    });
    const rbdMap = {};
    const prodQtyMap = {}, prodRevMap = {}, catMap = {}, prodCatMap = {}, prodLastSold = {};
    filtered.forEach(b => {
      const bDate = b.date || '';
      if (b.date) rbdMap[b.date] = (rbdMap[b.date] || 0) + Number(b.netTotal || 0);
      if (Array.isArray(b.items)) {
        b.items.forEach(item => {
          const pName = item.productName || 'Unknown';
          const pCat  = item.category    || 'Uncategorized';
          const qty   = Number(item.quantity) || 0;
          const rev   = Number(item.total)    || 0;
          prodQtyMap[pName] = (prodQtyMap[pName] || 0) + qty;
          prodRevMap[pName] = (prodRevMap[pName] || 0) + rev;
          prodCatMap[pName] = pCat;
          catMap[pCat]      = (catMap[pCat]      || 0) + rev;
          if (!prodLastSold[pName] || prodLastSold[pName] < bDate) prodLastSold[pName] = bDate;
        });
      }
    });
    const rbdSorted = Object.entries(rbdMap).sort((a, b) => a[0].localeCompare(b[0]));
    const rbpSorted = Object.entries(prodQtyMap).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const catSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const topProductsList = Object.keys(prodQtyMap)
      .map(p => ({ product: p, category: prodCatMap[p], qty: prodQtyMap[p], revenue: prodRevMap[p], lastSold: prodLastSold[p] }))
      .sort((a, b) => b.qty - a.qty).slice(0, 50);
    return {
      revenueByDate:   { labels: rbdSorted.map(x => x[0]), values: rbdSorted.map(x => x[1]) },
      revenueByProduct:{ labels: rbpSorted.map(x => x[0]), values: rbpSorted.map(x => x[1]) },
      categorySplit:   { labels: catSorted.map(x => x[0]), values: catSorted.map(x => x[1]) },
      topProductsList
    };
  };

  const compareData = useMemo(() => {
    if (!compareActive) return null;
    return computeBillsData(compareFilter, bills);
  }, [bills, compareFilter, compareActive]);

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

  const handleReorderWidgets = (reordered) => {
    setWidgets(reordered);
  };

  const activeWidgets = widgets.filter(w => w.enabled);
  const activeIds = new Set(activeWidgets.map(w => w.id));

  // Filter layouts to ONLY include active widget entries — prevents ghost cards
  const filteredLayouts = useMemo(() => {
    const ids = new Set(widgets.filter(w => w.enabled).map(w => w.id));
    const result = {};
    for (const [bp, items] of Object.entries(layouts)) {
      result[bp] = (items || []).filter(item => ids.has(item.i));
    }
    return result;
  }, [layouts, widgets]);

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden relative">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      {/* Date Filter Bar */}
      <div className="glass !rounded-none !border-t-0 !border-x-0 px-6 py-2.5 flex items-center justify-between shrink-0 z-10">
        <div className="flex flex-col gap-2">

          {/* Primary row */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              {['Today', 'This Week', 'This Month', 'This Year', 'Custom'].map(p => (
                <button
                  key={p}
                  onClick={() => handlePresetClick(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activePreset === p ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'glass text-gray-500 hover:bg-white/5'}`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-white/10" />

            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-gray-500" />
              <input type="date" value={dateFilter.from} onChange={e => { setDateFilter({...dateFilter, from: e.target.value}); setActivePreset('Custom'); }}
                className="glass text-white rounded-lg px-2.5 py-1 text-xs outline-none focus:border-primary-500" />
              <span className="text-gray-500 text-xs">to</span>
              <input type="date" value={dateFilter.to} onChange={e => { setDateFilter({...dateFilter, to: e.target.value}); setActivePreset('Custom'); }}
                className="glass text-white rounded-lg px-2.5 py-1 text-xs outline-none focus:border-primary-500" />
            </div>

            {!compareActive && (
              <button onClick={activateCompare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 border border-dashed border-white/20 hover:border-primary-500/50 hover:text-primary-400 transition-all">
                + Compare
              </button>
            )}
          </div>

          {/* Compare row */}
          {compareActive && (
            <div className="flex items-center gap-4 pl-1">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider shrink-0">Compare to</span>

              <div className="flex items-center gap-1.5">
                {['Today', 'This Week', 'This Month', 'This Year', 'Custom'].map(p => (
                  <button key={p} onClick={() => handleComparePresetClick(p)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${comparePreset === p ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-gray-600 hover:text-gray-400 hover:bg-white/5'}`}>
                    {p}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input type="date" value={compareFilter.from} onChange={e => { setCompareFilter({...compareFilter, from: e.target.value}); setComparePreset('Custom'); }}
                  className="bg-amber-500/5 border border-amber-500/20 text-amber-300 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-amber-500/60" />
                <span className="text-gray-600 text-xs">to</span>
                <input type="date" value={compareFilter.to} onChange={e => { setCompareFilter({...compareFilter, to: e.target.value}); setComparePreset('Custom'); }}
                  className="bg-amber-500/5 border border-amber-500/20 text-amber-300 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-amber-500/60" />
              </div>

              <button onClick={() => { setCompareActive(false); setCompareFilter({ from: '', to: '' }); }}
                className="p-1 text-gray-600 hover:text-red-400 transition-colors"><X size={14} /></button>
            </div>
          )}

        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold glass hover:bg-white/5 transition-all text-white"
          >
            <Download size={16} />
            Export
          </button>
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isEditMode ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'glass hover:bg-white/5'}`}
          >
            <Settings2 size={16} />
            {isEditMode ? 'Done Editing' : 'Edit Layout'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Grid Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <ResponsiveGridLayout
            className="layout"
            layouts={filteredLayouts}
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white font-heading">{w.name}</h3>
                    {w.isCSV && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">CSV</span>}
                    {compareActive && !w.isCSV && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-primary-500/10 text-primary-400 rounded border border-primary-500/20">
                        Comparing
                      </span>
                    )}
                  </div>
                  {isEditMode && <div className="text-xs text-gray-400 font-medium">Drag</div>}
                </div>
                <div className="flex-1 overflow-hidden relative">
                  {w.isChart ? (
                    <ChartWidget widget={w} data={computedData} compareData={compareActive ? compareData : null} primaryLabel={rangeLabel(dateFilter)} compareLabel={rangeLabel(compareFilter)} />
                  ) : (
                    <TableWidget widget={w} data={computedData} compareData={compareActive ? compareData : null} primaryLabel={rangeLabel(dateFilter)} compareLabel={rangeLabel(compareFilter)} />
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
            onReorder={handleReorderWidgets}
            onOpenCsvUploader={() => setShowCsvUploader(true)}
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

      {showCsvUploader && (
        <CsvUploader
          onClose={() => setShowCsvUploader(false)}
          onAdd={handleAddWidget}
        />
      )}

      {showExportModal && (
        <ExportModal 
          widgets={widgets} 
          computedData={computedData} 
          dateFilter={dateFilter} 
          onClose={() => setShowExportModal(false)}
          toast={showToast}
        />
      )}
    </div>
  );
}
