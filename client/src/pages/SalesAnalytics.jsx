import React, { useState, useEffect, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useBills, useProducts } from '../hooks/useFirestore';
import { Calendar, Settings2, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import ChartWidget from '../components/dashboard/ChartWidget';
import TableWidget from '../components/dashboard/TableWidget';
import WidgetPanel from '../components/dashboard/WidgetPanel';
import Pickers from '../components/dashboard/Pickers';
import CsvUploader from '../components/dashboard/CsvUploader';

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

export default function SalesAnalytics() {
  const { bills, loading } = useBills();
  const navigate = useNavigate();
  
  // State
  const [isEditMode, setIsEditMode] = useState(false);
  const [pickerType, setPickerType] = useState(null); // 'chart' or 'table'
  const [showCsvUploader, setShowCsvUploader] = useState(false);
  
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
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white font-heading">{w.name}</h3>
                    {w.isCSV && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">CSV</span>}
                  </div>
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
    </div>
  );
}
