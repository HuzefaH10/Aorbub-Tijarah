import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useProducts, useEntries, useStockLogs } from '../hooks/useFirestore';
import ReactApexChart from 'react-apexcharts';
import { 
  Package, AlertTriangle, XCircle, CheckCircle, Plus, Search, Filter, 
  Download, Edit2, Trash2, ShieldAlert
} from 'lucide-react';
import Toast, { useToast } from '../components/ui/Toast';

export default function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const { entries } = useEntries();
  const { stockLogs, addStockLog, deleteStockLog, updateStockLog } = useStockLogs();
  const { toast, showToast, hideToast } = useToast();

  const [activeTab, setActiveTab] = useState('overview');
  
  // Modal States
  const [loadStockModal, setLoadStockModal] = useState({ open: false, productId: null });
  const [productModal, setProductModal] = useState({ open: false, editId: null, data: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, type: null, id: null, name: '' });

  // Compute Current Stock Logic
  const computedData = useMemo(() => {
    let outCount = 0;
    let lowCount = 0;
    let okCount = 0;

    const data = products.map(p => {
      const opening = Number(p.openingStock) || 0;
      const loaded = stockLogs
        .filter(l => l.productId === p.id)
        .reduce((sum, l) => sum + Number(l.quantityLoaded || 0), 0);
      const sold = entries
        .filter(e => e.product === p.name)
        .reduce((sum, e) => sum + Number(e.quantitySold || 0), 0);
      
      const currentStock = Math.max(0, opening + loaded - sold);
      const threshold = Number(p.lowStockThreshold) || 5;
      
      let status = 'healthy';
      if (currentStock === 0) {
        status = 'out';
        outCount++;
      } else if (currentStock <= threshold) {
        status = 'low';
        lowCount++;
      } else {
        okCount++;
      }

      const lastLoadedLog = stockLogs.filter(l => l.productId === p.id).sort((a,b) => b.date.localeCompare(a.date))[0];

      return {
        ...p,
        currentStock,
        status,
        lastLoaded: lastLoadedLog ? lastLoadedLog.date : 'Never'
      };
    });

    // Sort: Out -> Low -> Healthy
    data.sort((a, b) => {
      const rank = { out: 1, low: 2, healthy: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return a.name.localeCompare(b.name);
    });

    return { data, outCount, lowCount, okCount };
  }, [products, stockLogs, entries]);

  // CSV Export
  const handleExport = () => {
    if (stockLogs.length === 0) return showToast('No stock history to export', 'error');
    
    const headers = ['Date', 'Product', 'Category', 'Qty Loaded', 'Previous Stock', 'New Stock', 'Supplier', 'Batch Cost', 'Note'];
    const rows = stockLogs.map(l => [
      l.date, `"${l.productName}"`, `"${l.category || ''}"`, l.quantityLoaded, l.previousStock, l.newStock, 
      `"${l.supplier || ''}"`, l.batchCost || 0, `"${l.note || ''}"`
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export downloaded successfully');
  };

  const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 pb-20 animate-fadeIn relative min-h-[calc(100vh-100px)]">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* SECTION 1: TOPBAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161616] p-5 rounded-2xl border border-white/5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 font-heading">Inventory Management</h1>
          <p className="text-sm text-gray-500">Last updated: {todayStr}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">
            <Download size={16} /> Export
          </button>
          <button onClick={() => setLoadStockModal({ open: true, productId: null })} className="flex items-center gap-2 px-5 py-2 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-primary-600/20 hover:bg-primary-700 hover:-translate-y-0.5 transition-all">
            <Plus size={16} /> Load Stock
          </button>
        </div>
      </div>

      {/* SECTION 2: STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Products" value={products.length} icon={Package} />
        <StatCard label="Out of Stock" value={computedData.outCount} color="text-red-500" icon={XCircle} />
        <StatCard label="Low Stock" value={computedData.lowCount} color="text-amber-500" icon={AlertTriangle} />
        <StatCard label="Healthy" value={computedData.okCount} color="text-green-500" icon={CheckCircle} />
      </div>

      {/* SECTION 3: TABS */}
      <div className="bg-[#161616] rounded-2xl border border-white/5 shadow-xl overflow-hidden flex flex-col">
        <div className="flex border-b border-white/5 overflow-x-auto custom-scrollbar">
          {['overview', 'history', 'analytics'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-4 text-sm font-bold whitespace-nowrap capitalize transition-colors border-b-2 ${activeTab === t ? 'text-primary-400 border-primary-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
              Stock {t === 'overview' ? 'Overview' : t === 'history' ? 'History' : 'Analytics'}
            </button>
          ))}
        </div>
        
        <div className="p-5">
          {activeTab === 'overview' && <TabOverview computedData={computedData.data} onEdit={(p) => setProductModal({ open: true, editId: p.id, data: p })} onDelete={(p) => setDeleteModal({ open: true, type: 'product', id: p.id, name: p.name })} onLoad={(id) => setLoadStockModal({ open: true, productId: id })} />}
          {activeTab === 'history' && <TabHistory logs={stockLogs} onDelete={(l) => setDeleteModal({ open: true, type: 'log', id: l.id, name: 'this log entry' })} />}
          {activeTab === 'analytics' && <TabAnalytics computedData={computedData.data} logs={stockLogs} />}
        </div>
      </div>

      {/* BOTTOM STRIP */}
      <div className="absolute bottom-4 left-0 w-full flex justify-center z-10">
        <div className="bg-[#161616] border border-primary-500/30 shadow-xl shadow-primary-500/10 rounded-full px-6 py-3 flex items-center gap-4 transition-all">
          <span className="text-sm text-gray-300 font-medium hidden md:inline">New item to your store? Register it once and it'll appear in your stock list.</span>
          <button onClick={() => setProductModal({ open: true, editId: null, data: null })} className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-primary-600/30 hover:bg-primary-700 hover:-translate-y-0.5 transition-all">
            <Plus size={16} /> Add New Product
          </button>
        </div>
      </div>

      {/* MODALS */}
      {loadStockModal.open && <LoadStockModal computedData={computedData.data} initialProductId={loadStockModal.productId} onClose={() => setLoadStockModal({ open: false, productId: null })} onSave={addStockLog} toast={showToast} />}
      {productModal.open && <ProductModal editId={productModal.editId} initialData={productModal.data} onClose={() => setProductModal({ open: false, editId: null, data: null })} onSave={productModal.editId ? updateProduct : addProduct} toast={showToast} />}
      {deleteModal.open && <DeleteModal target={deleteModal} onClose={() => setDeleteModal({ open: false, type: null, id: null, name: '' })} onConfirm={deleteModal.type === 'product' ? deleteProduct : deleteStockLog} toast={showToast} />}

    </div>
  );
}

// ---- Sub Components ----

function StatCard({ label, value, icon: Icon, color = "text-white" }) {
  return (
    <div className="bg-[#161616] border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-primary-500/30 transition-colors group">
      <div className="flex justify-between items-start mb-4">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
        <Icon size={18} className="text-gray-600 group-hover:text-primary-500 transition-colors" />
      </div>
      <div className={`text-3xl font-bold font-heading ${color}`}>{value}</div>
    </div>
  );
}

function TabOverview({ computedData, onEdit, onDelete, onLoad }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const categories = ['All', ...new Set(computedData.map(p => p.category).filter(Boolean))];

  const filtered = computedData.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.category?.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter !== 'All' && p.category !== catFilter) return false;
    if (statusFilter !== 'All') {
      if (statusFilter === 'Healthy' && p.status !== 'healthy') return false;
      if (statusFilter === 'Low Stock' && p.status !== 'low') return false;
      if (statusFilter === 'Out of Stock' && p.status !== 'out') return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="w-full bg-gray-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary-500">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary-500">
          {['All', 'Healthy', 'Low Stock', 'Out of Stock'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-500">No products found.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="py-3 font-medium">Product</th>
                <th className="py-3 font-medium">Category</th>
                <th className="py-3 font-medium text-right">Current Stock</th>
                <th className="py-3 font-medium text-right">Threshold</th>
                <th className="py-3 font-medium text-center">Status</th>
                <th className="py-3 font-medium text-right">Last Loaded</th>
                <th className="py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors" style={{ animation: `fadeIn 0.3s ease-out ${i * 0.04}s both` }}>
                  <td className="py-3 font-bold text-gray-200">{p.name}</td>
                  <td className="py-3 text-gray-500">{p.category}</td>
                  <td className={`py-3 text-right font-bold ${p.status === 'out' ? 'text-red-500' : p.status === 'low' ? 'text-amber-500' : 'text-gray-200'}`}>{p.currentStock} <span className="text-xs text-gray-600 font-normal">{p.unit}</span></td>
                  <td className="py-3 text-right text-gray-500">{p.lowStockThreshold}</td>
                  <td className="py-3 text-center">
                    {p.status === 'out' ? <span className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-1 rounded-full uppercase tracking-wider">Out of Stock</span> :
                     p.status === 'low' ? <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-full uppercase tracking-wider">Low Stock</span> :
                     <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full uppercase tracking-wider">Healthy</span>}
                  </td>
                  <td className="py-3 text-right text-gray-500 text-xs">{p.lastLoaded}</td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => onLoad(p.id)} className="px-2 py-1 bg-primary-600/20 text-primary-400 hover:bg-primary-600 hover:text-white rounded text-xs font-bold transition-colors">Load</button>
                      <button onClick={() => onEdit(p)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"><Edit2 size={14} /></button>
                      <button onClick={() => onDelete(p)} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TabHistory({ logs, onDelete }) {
  const [search, setSearch] = useState('');
  
  const filtered = logs.filter(l => l.productName?.toLowerCase().includes(search.toLowerCase()));

  const totalLoaded = new Date().getMonth() === new Date(logs[0]?.date || '').getMonth() 
    ? logs.filter(l => new Date(l.date).getMonth() === new Date().getMonth()).reduce((s, l) => s + Number(l.quantityLoaded), 0)
    : 0;
  
  const totalCost = new Date().getMonth() === new Date(logs[0]?.date || '').getMonth() 
    ? logs.filter(l => new Date(l.date).getMonth() === new Date().getMonth()).reduce((s, l) => s + Number(l.batchCost || 0), 0)
    : 0;

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="flex gap-4 p-4 bg-gray-900 border border-white/5 rounded-xl mb-4">
        <div className="flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">This Month Loaded</p>
          <p className="text-lg font-bold text-white">{totalLoaded} units</p>
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">This Month Spend</p>
          <p className="text-lg font-bold text-primary-400">${totalCost.toLocaleString()}</p>
        </div>
      </div>

      <div className="relative w-full md:w-64">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter by product..." className="w-full bg-gray-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors" />
      </div>

      <div className="overflow-x-auto -mx-5 px-5">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-500">No history found.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="py-3 font-medium">Date</th>
                <th className="py-3 font-medium">Product</th>
                <th className="py-3 font-medium text-right">Qty Loaded</th>
                <th className="py-3 font-medium text-right text-gray-600">Prev → New</th>
                <th className="py-3 font-medium">Supplier</th>
                <th className="py-3 font-medium text-right">Batch Cost</th>
                <th className="py-3 font-medium">Note</th>
                <th className="py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l, i) => (
                <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors" style={{ animation: `fadeIn 0.3s ease-out ${i * 0.04}s both` }}>
                  <td className="py-3 text-gray-400">{l.date}</td>
                  <td className="py-3 font-bold text-gray-200">{l.productName}</td>
                  <td className="py-3 text-right font-bold text-green-400">+{l.quantityLoaded}</td>
                  <td className="py-3 text-right text-gray-500 text-xs">{l.previousStock} → <span className="text-gray-300 font-bold">{l.newStock}</span></td>
                  <td className="py-3 text-gray-400">{l.supplier || '—'}</td>
                  <td className="py-3 text-right text-gray-300">{l.batchCost ? `$${l.batchCost.toLocaleString()}` : '—'}</td>
                  <td className="py-3 text-gray-500 text-xs italic max-w-[150px] truncate">{l.note || '—'}</td>
                  <td className="py-3 text-right">
                    <button onClick={() => onDelete(l)} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TabAnalytics({ computedData, logs }) {
  const barOpts = {
    chart: { type: 'bar', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, easing: 'easeinout', speed: 800 } },
    plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
    dataLabels: { enabled: false },
    xaxis: { categories: computedData.map(p => p.name), labels: { style: { colors: '#9a9080' } } },
    yaxis: { labels: { style: { colors: '#9a9080' } } },
    colors: [({ value, dataPointIndex }) => {
      const p = computedData[dataPointIndex];
      return p.status === 'out' ? '#ef4444' : p.status === 'low' ? '#f59e0b' : '#22c55e';
    }],
    tooltip: { theme: 'dark' }
  };

  const donutOpts = {
    chart: { type: 'donut', background: 'transparent' },
    labels: [...new Set(computedData.map(p => p.category).filter(Boolean))],
    colors: ['#c9a84c', '#5b8dee', '#4caf7d', '#e05c5c', '#a78bfa'],
    stroke: { show: false },
    legend: { position: 'bottom', labels: { colors: '#9a9080' } }
  };
  const catData = donutOpts.labels.map(c => computedData.filter(p => p.category === c).length);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fadeIn">
      <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 h-[350px]">
        <h3 className="text-sm font-bold text-white font-heading mb-4">Stock Levels</h3>
        <div className="h-[280px]">
          <ReactApexChart options={barOpts} series={[{ name: 'Stock', data: computedData.map(p => p.currentStock) }]} type="bar" height="100%" />
        </div>
      </div>
      <div className="bg-gray-900 border border-white/5 rounded-2xl p-5 h-[350px]">
        <h3 className="text-sm font-bold text-white font-heading mb-4">Category Distribution</h3>
        <div className="h-[280px] flex items-center justify-center">
          <ReactApexChart options={donutOpts} series={catData} type="donut" height="100%" />
        </div>
      </div>
    </div>
  );
}

// ---- Modals ----

function LoadStockModal({ computedData, initialProductId, onClose, onSave, toast }) {
  const [step, setStep] = useState(initialProductId ? 2 : 1);
  const [search, setSearch] = useState('');
  const [pid, setPid] = useState(initialProductId);
  
  const [f, setF] = useState({ qty: '', date: new Date().toISOString().split('T')[0], supplier: '', cost: '', note: '' });

  const product = computedData.find(p => p.id === pid);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!product || !f.qty) return toast('Quantity is required', 'error');
    
    const qty = Number(f.qty);
    if (qty <= 0) return toast('Quantity must be greater than 0', 'error');

    try {
      await onSave({
        productId: product.id,
        productName: product.name,
        category: product.category,
        date: f.date,
        quantityLoaded: qty,
        previousStock: product.currentStock,
        newStock: product.currentStock + qty,
        supplier: f.supplier,
        batchCost: Number(f.cost) || 0,
        note: f.note
      });
      toast('Stock loaded successfully');
      onClose();
    } catch {
      toast('Failed to load stock', 'error');
    }
  };

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden scale-95 animate-[scaleIn_0.2s_ease-out_forwards]">
        
        {step === 1 && (
          <div className="p-6 flex flex-col h-[500px]">
            <h2 className="text-xl font-bold text-white font-heading mb-4">Select Product to Load</h2>
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className={inputCls + " pl-9"} />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {computedData.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
                <div key={p.id} onClick={() => { setPid(p.id); setStep(2); }} className="p-3 bg-gray-900 border border-white/5 rounded-xl cursor-pointer hover:border-primary-500/50 transition-colors flex justify-between items-center group">
                  <div>
                    <p className="font-bold text-gray-200 group-hover:text-primary-400 transition-colors">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">{p.currentStock} {p.unit}</p>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider">{p.status}</p>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="mt-4 w-full py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">Cancel</button>
          </div>
        )}

        {step === 2 && product && (
          <div className="p-6">
            <h2 className="text-xl font-bold text-white font-heading mb-1">Load Stock: {product.name}</h2>
            <div className="flex items-center gap-2 mb-6">
              <span className="text-xs font-bold text-gray-400 bg-gray-900 px-2 py-1 rounded">Current: {product.currentStock} {product.unit}</span>
              <span className="text-xs font-bold text-gray-500 bg-gray-900 px-2 py-1 rounded">Threshold: {product.lowStockThreshold} {product.unit}</span>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Quantity Received</label><input type="number" min="1" required autoFocus value={f.qty} onChange={e => setF({...f, qty: e.target.value})} className={inputCls} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Date</label><input type="date" required value={f.date} onChange={e => setF({...f, date: e.target.value})} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Supplier (Optional)</label><input type="text" value={f.supplier} onChange={e => setF({...f, supplier: e.target.value})} className={inputCls} /></div>
                <div><label className="block text-xs font-bold text-gray-500 mb-1">Total Cost $ (Optional)</label><input type="number" min="0" value={f.cost} onChange={e => setF({...f, cost: e.target.value})} className={inputCls} /></div>
              </div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Note (Optional)</label><input type="text" value={f.note} onChange={e => setF({...f, note: e.target.value})} className={inputCls} /></div>
              
              <div className="p-3 bg-primary-600/10 border border-primary-500/20 rounded-xl flex items-center justify-between">
                <span className="text-xs font-bold text-primary-500/70 uppercase tracking-wider">New Stock Projection</span>
                <span className="text-lg font-bold text-primary-400">{product.currentStock + (Number(f.qty) || 0)} <span className="text-xs">{product.unit}</span></span>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => initialProductId ? onClose() : setStep(1)} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">{initialProductId ? 'Cancel' : 'Back'}</button>
                <button type="submit" className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">Confirm Load</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductModal({ editId, initialData, onClose, onSave, toast }) {
  const [f, setF] = useState(initialData || { name: '', category: '', unit: 'pcs', lowStockThreshold: 5, openingStock: 0, note: '' });
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.name || !f.category) return toast('Name and Category are required', 'error');
    try {
      await onSave(editId, {
        name: f.name, category: f.category, unit: f.unit, 
        lowStockThreshold: Number(f.lowStockThreshold), 
        openingStock: editId ? initialData.openingStock : Number(f.openingStock), // immutable after creation
        note: f.note
      });
      toast(editId ? 'Product updated' : 'Product added');
      onClose();
    } catch {
      toast('Error saving product', 'error');
    }
  };

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-[#161616] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6 scale-95 animate-[scaleIn_0.2s_ease-out_forwards]">
        <h2 className="text-xl font-bold text-white font-heading mb-6">{editId ? 'Edit Product' : 'Add New Product'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-bold text-gray-500 mb-1">Product Name</label><input required autoFocus value={f.name} onChange={e => setF({...f, name: e.target.value})} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Category</label><input required value={f.category} onChange={e => setF({...f, category: e.target.value})} className={inputCls} /></div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Unit</label>
              <select value={f.unit} onChange={e => setF({...f, unit: e.target.value})} className={inputCls}>
                <option value="pcs">Pieces (pcs)</option><option value="kg">Kilograms (kg)</option><option value="liters">Liters</option><option value="boxes">Boxes</option><option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Low Stock Threshold</label><input type="number" min="0" required value={f.lowStockThreshold} onChange={e => setF({...f, lowStockThreshold: e.target.value})} className={inputCls} /></div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1 group relative">Opening Stock <span className="text-primary-500 cursor-help">ℹ️</span>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-800 text-[10px] text-white p-2 rounded hidden group-hover:block z-10 text-center leading-tight shadow-xl">Opening stock is set once during creation. Use 'Load Stock' to add more later.</span>
              </label>
              <input type="number" min="0" disabled={!!editId} value={f.openingStock} onChange={e => setF({...f, openingStock: e.target.value})} className={`${inputCls} ${editId ? 'opacity-50 cursor-not-allowed bg-gray-900' : ''}`} />
            </div>
          </div>
          <div><label className="block text-xs font-bold text-gray-500 mb-1">Internal Note (Optional)</label><input type="text" value={f.note} onChange={e => setF({...f, note: e.target.value})} className={inputCls} /></div>
          
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">{editId ? 'Save Changes' : 'Add Product'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({ target, onClose, onConfirm, toast }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');

  const handleDelete = async (e) => {
    e.preventDefault();
    if (pwd !== 'admin123') return setErr('Incorrect password');
    try {
      await onConfirm(target.id);
      toast('Deleted successfully');
      onClose();
    } catch {
      toast('Failed to delete', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-[#161616] border border-red-500/30 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center scale-95 animate-[scaleIn_0.2s_ease-out_forwards]">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
          <ShieldAlert size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white font-heading mb-2">Are you sure?</h2>
        <p className="text-sm text-gray-400 mb-6">This will permanently delete <span className="font-bold text-white">{target.name}</span>. This action cannot be undone.</p>
        
        <form onSubmit={handleDelete} className="space-y-4">
          <div>
            <input type="password" required autoFocus placeholder="Enter password to confirm" value={pwd} onChange={e => {setPwd(e.target.value); setErr('');}} className={`w-full bg-gray-950 border ${err ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-red-500'} rounded-xl px-4 py-3 text-sm text-white outline-none transition-colors text-center tracking-widest`} />
            {err && <p className="text-xs text-red-500 mt-2 font-bold">{err}</p>}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">Cancel</button>
            <button type="submit" className="flex-1 py-3 bg-red-500 rounded-xl text-sm font-bold text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">Delete</button>
          </div>
        </form>
      </div>
    </div>
  );
}
