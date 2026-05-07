import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useProducts, useEntries, useStockLogs, useCategories, useEvents, useAddStockHistory } from '../hooks/useFirestore';
import { useSearchParams } from 'react-router-dom';
import ReactApexChart from 'react-apexcharts';
import { 
  Package, AlertTriangle, XCircle, CheckCircle, Plus, Search, Filter,
  Download, Edit2, Trash2, ShieldAlert, ChevronDown, ChevronUp, X, Layers, ClipboardList
} from 'lucide-react';
import Toast, { useToast } from '../components/ui/Toast';
import ExportModal from '../components/inventory/ExportModal';
import ProductHistoryDrawer from '../components/inventory/ProductHistoryDrawer';

export default function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const { entries } = useEntries();
  const { stockLogs, addStockLog, deleteStockLog, updateStockLog } = useStockLogs();
  const { categories: firestoreCategories, addCategory } = useCategories();
  const { events, addEvent, updateEvent } = useEvents();
  const { toast, showToast, hideToast } = useToast();
  const addStockHistory = useAddStockHistory();

  const [activeTab, setActiveTab] = useState('overview');
  
  // Auto-create expiry_warning events for products expiring within 7 days
  useEffect(() => {
    if (!products.length || !addEvent) return;
    const todayMs = Date.now();
    products.forEach(p => {
      if (!p.expiryDate) return;
      const expMs = new Date(p.expiryDate).getTime();
      const daysUntil = Math.round((expMs - todayMs) / 86400000);
      if (daysUntil < 0 || daysUntil > 7) return;
      // Only create if no existing expiry_warning event for this product
      const alreadyExists = events.some(e => e.type === 'expiry_warning' && e.linkedProductId === p.id && e.status !== 'completed');
      if (!alreadyExists) {
        addEvent(null, {
          title: `Expiry Warning — ${p.name}`,
          type: 'expiry_warning',
          date: p.expiryDate,
          status: 'pending',
          recurring: { enabled: false, frequency: null },
          linkedProductId: p.id,
          linkedBillId: null,
          note: `${p.name} expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}.`,
        }).catch(() => {});
      }
    });
  }, [products]); // runs when product list changes

  // Modal States
  const [loadStockModal, setLoadStockModal] = useState({ open: false, productId: null });
  const [quickLoadModal, setQuickLoadModal] = useState({ open: false, product: null });
  const [productModal, setProductModal] = useState({ open: false, editId: null, data: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, type: null, id: null, name: '' });
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [historyDrawer, setHistoryDrawer] = useState({ open: false, product: null });


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

  // Auto-open QuickLoad from bell notification deep-link (?restock=productId)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const restockId = searchParams.get('restock');
    if (!restockId || !computedData.data.length) return;
    const product = computedData.data.find(p => p.id === restockId);
    if (product) {
      setQuickLoadModal({ open: true, product });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, computedData.data]);

  // (Export logic moved to ExportModal)

  const todayStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 pb-20 animate-fadeIn relative min-h-[calc(100vh-100px)]">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* SECTION 1: TOPBAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 font-heading">Inventory Management</h1>
          <p className="text-sm text-gray-500">Last updated: {todayStr}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setExportModalOpen(true)} className="flex items-center gap-2 px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">
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
      <div className="glass shadow-xl overflow-hidden flex flex-col">
        <div className="flex border-b border-white/5 overflow-x-auto custom-scrollbar">
          {['overview', 'history', 'analytics'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-4 text-sm font-bold whitespace-nowrap capitalize transition-colors border-b-2 ${activeTab === t ? 'text-primary-400 border-primary-500' : 'text-gray-500 border-transparent hover:text-gray-300'}`}>
              Stock {t === 'overview' ? 'Overview' : t === 'history' ? 'History' : 'Analytics'}
            </button>
          ))}
        </div>
        
        <div className="p-5">
          {activeTab === 'overview' && <TabOverview computedData={computedData.data} onEdit={(p) => setProductModal({ open: true, editId: p.id, data: p })} onDelete={(p) => setDeleteModal({ open: true, type: 'product', id: p.id, name: p.name })} onLoad={(p) => setQuickLoadModal({ open: true, product: p })} onHistory={(p) => setHistoryDrawer({ open: true, product: p })} onBulkDelete={deleteProduct} onBulkUpdate={updateProduct} firestoreCategories={firestoreCategories} toast={showToast} />}
          {activeTab === 'history' && <TabHistory logs={stockLogs} onDelete={(l) => setDeleteModal({ open: true, type: 'log', id: l.id, name: 'this log entry' })} />}
          {activeTab === 'analytics' && <TabAnalytics computedData={computedData.data} logs={stockLogs} />}
        </div>
      </div>

      {/* BOTTOM STRIP */}
      <div className="absolute bottom-4 left-0 w-full flex justify-center z-10">
        <div className="glass !rounded-full px-6 py-3 flex items-center gap-4 transition-all">
          <span className="text-sm text-gray-300 font-medium hidden md:inline">New item to your store? Register it once and it'll appear in your stock list.</span>
          <button onClick={() => setProductModal({ open: true, editId: null, data: null })} className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-primary-600/30 hover:bg-primary-700 hover:-translate-y-0.5 transition-all">
            <Plus size={16} /> Add New Product
          </button>
        </div>
      </div>

      {/* MODALS */}
      {loadStockModal.open && <LoadStockModal computedData={computedData.data} initialProductId={loadStockModal.productId} onClose={() => setLoadStockModal({ open: false, productId: null })} onSave={addStockLog} onAddHistory={addStockHistory} onUpdateProduct={updateProduct} events={events} onUpdateEvent={updateEvent} onAddEvent={addEvent} toast={showToast} />}
      {quickLoadModal.open && <QuickLoadModal product={quickLoadModal.product} onClose={() => setQuickLoadModal({ open: false, product: null })} onSave={addStockLog} onUpdateProduct={updateProduct} events={events} onUpdateEvent={updateEvent} onAddEvent={addEvent} toast={showToast} />}
      {productModal.open && <ProductModal editId={productModal.editId} initialData={productModal.data} onClose={() => setProductModal({ open: false, editId: null, data: null })} onSave={productModal.editId ? updateProduct : addProduct} firestoreCategories={firestoreCategories} addCategory={addCategory} toast={showToast} />}
      {deleteModal.open && <DeleteModal target={deleteModal} onClose={() => setDeleteModal({ open: false, type: null, id: null, name: '' })} onConfirm={deleteModal.type === 'product' ? deleteProduct : deleteStockLog} toast={showToast} />}
      {exportModalOpen && <ExportModal onClose={() => setExportModalOpen(false)} computedData={computedData.data} stockLogs={stockLogs} toast={showToast} />}
      {historyDrawer.open && historyDrawer.product && <ProductHistoryDrawer product={historyDrawer.product} onClose={() => setHistoryDrawer({ open: false, product: null })} />}

    </div>
  );
}

// ---- Sub Components ----

function StatCard({ label, value, icon: Icon, color = "text-white" }) {
  return (
    <div className="glass p-5 flex flex-col justify-between hover:border-primary-500/30 transition-colors group">
      <div className="flex justify-between items-start mb-4">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
        <Icon size={18} className="text-gray-600 group-hover:text-primary-500 transition-colors" />
      </div>
      <div className={`text-3xl font-bold font-heading ${color}`}>{value}</div>
    </div>
  );
}

const BULK_UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'ml', 'box', 'dozen', 'carton', 'pack', 'bag', 'pair'];

function BulkDeleteModal({ count, onClose, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn p-4">
      <div className="glass w-full max-w-sm shadow-2xl rounded-2xl overflow-hidden">
        <div className="p-6 text-center space-y-3">
          <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <Trash2 size={24} className="text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-white font-heading">Delete {count} product{count !== 1 ? 's' : ''}?</h3>
          <p className="text-sm text-gray-400">This cannot be undone. All selected products will be permanently removed from your inventory.</p>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-bold text-white transition-colors disabled:opacity-50 shadow-lg shadow-red-600/20">
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkEditModal({ count, selectedProducts, onClose, onConfirm, firestoreCategories, loading }) {
  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors disabled:opacity-40";
  const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5";

  const [fields, setFields] = useState({
    category: { apply: false, value: '' },
    unit:     { apply: false, value: 'pcs' },
    threshold:{ apply: false, value: 5 },
  });

  const toggle = (key) => setFields(f => ({ ...f, [key]: { ...f[key], apply: !f[key].apply } }));
  const set = (key, value) => setFields(f => ({ ...f, [key]: { ...f[key], value } }));

  const anyApplied = Object.values(fields).some(f => f.apply);
  const catList = [...new Set(selectedProducts.map(p => p.category).filter(Boolean)),
    ...(firestoreCategories || []).map(c => c.name).filter(Boolean)
  ].filter((v, i, a) => a.indexOf(v) === i);

  const ApplyToggle = ({ fieldKey, label, children }) => (
    <div className={`p-4 rounded-xl border transition-all ${fields[fieldKey].apply ? 'border-primary-500/50 bg-primary-600/5' : 'border-white/5 bg-gray-900/40'}`}>
      <div className="flex items-center justify-between mb-3">
        <label className={labelCls + ' mb-0'}>{label}</label>
        <button type="button" onClick={() => toggle(fieldKey)}
          className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${
            fields[fieldKey].apply ? 'bg-primary-600 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
          }`}>
          {fields[fieldKey].apply ? '✓ Apply' : 'Apply'}
        </button>
      </div>
      <div className={fields[fieldKey].apply ? '' : 'opacity-40 pointer-events-none'}>{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn p-4">
      <div className="glass w-full max-w-md shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white font-heading">Bulk Edit</h2>
            <p className="text-xs text-gray-500 mt-0.5">{count} product{count !== 1 ? 's' : ''} selected — toggle fields to apply</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><X size={18} /></button>
        </div>

        {/* Fields */}
        <div className="p-6 space-y-3 overflow-y-auto custom-scrollbar">
          <ApplyToggle fieldKey="category" label="Category">
            <select value={fields.category.value} onChange={e => set('category', e.target.value)} className={inputCls}>
              <option value="">Select category…</option>
              {catList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </ApplyToggle>

          <ApplyToggle fieldKey="unit" label="Unit">
            <select value={fields.unit.value} onChange={e => set('unit', e.target.value)} className={inputCls}>
              {BULK_UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </ApplyToggle>

          <ApplyToggle fieldKey="threshold" label="Low Stock Threshold">
            <input type="number" min="0" value={fields.threshold.value}
              onChange={e => set('threshold', Number(e.target.value))}
              className={inputCls} placeholder="e.g. 10" />
          </ApplyToggle>

          {!anyApplied && (
            <p className="text-xs text-amber-400 text-center pt-1">Toggle at least one field to apply changes</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
          <button onClick={onClose} disabled={loading} className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={() => onConfirm(fields)} disabled={!anyApplied || loading}
            className="flex-[2] py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-bold text-white transition-colors shadow-lg shadow-primary-600/20">
            {loading ? 'Saving…' : `Apply to ${count} product${count !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabOverview({ computedData, onEdit, onDelete, onLoad, onHistory, onBulkDelete, onBulkUpdate, firestoreCategories, toast }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const categories = ['All', ...new Set(computedData.map(p => p.category).filter(Boolean))];

  const filtered = computedData.filter(p => {
    if (search) {
      const s = search.toLowerCase();
      const matchesName = p.name.toLowerCase().includes(s);
      const matchesCategory = p.category?.toLowerCase().includes(s);
      const matchesSku = (p.defaults?.sku || p.sku || '').toLowerCase().includes(s);
      if (!matchesName && !matchesCategory && !matchesSku) return false;
    }
    if (catFilter !== 'All' && p.category !== catFilter) return false;
    if (statusFilter !== 'All') {
      if (statusFilter === 'Healthy' && p.status !== 'healthy') return false;
      if (statusFilter === 'Low Stock' && p.status !== 'low') return false;
      if (statusFilter === 'Out of Stock' && p.status !== 'out') return false;
    }
    return true;
  });

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  const someSelected = selected.size > 0;
  const selectedProducts = computedData.filter(p => selected.has(p.id));

  const toggleRow = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(p => n.delete(p.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); filtered.forEach(p => n.add(p.id)); return n; });
    }
  };

  const handleBulkDelete = async () => {
    setBulkLoading(true);
    try {
      await Promise.all([...selected].map(id => onBulkDelete(id)));
      toast(`${selected.size} product${selected.size !== 1 ? 's' : ''} deleted`);
      setSelected(new Set());
      setBulkDeleteOpen(false);
    } catch {
      toast('Failed to delete some products', 'error');
    } finally { setBulkLoading(false); }
  };

  const handleBulkEdit = async (fields) => {
    setBulkLoading(true);
    try {
      const patch = {};
      if (fields.category.apply && fields.category.value) patch.category = fields.category.value;
      if (fields.unit.apply) patch.unit = fields.unit.value;
      if (fields.threshold.apply) patch.lowStockThreshold = fields.threshold.value;
      await Promise.all([...selected].map(id => onBulkUpdate(id, patch)));
      toast(`${selected.size} product${selected.size !== 1 ? 's' : ''} updated`);
      setSelected(new Set());
      setBulkEditOpen(false);
    } catch {
      toast('Failed to update some products', 'error');
    } finally { setBulkLoading(false); }
  };

  return (
    <div className="space-y-3 animate-fadeIn">
      {/* Bulk Action Bar */}
      <div className={`transition-all duration-300 overflow-hidden ${
        someSelected ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-primary-600/10 border border-primary-500/30 rounded-xl">
          <span className="text-sm font-bold text-primary-300">{selected.size} item{selected.size !== 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setBulkEditOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600/20 hover:bg-primary-600/40 text-primary-300 rounded-lg text-xs font-bold transition-colors">
              <Edit2 size={13} /> Edit Selected
            </button>
            <button onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg text-xs font-bold transition-colors">
              <Trash2 size={13} /> Delete Selected
            </button>
            <button onClick={() => setSelected(new Set())}
              className="flex items-center gap-1 px-2 py-1.5 text-gray-500 hover:text-gray-300 rounded-lg text-xs font-bold transition-colors">
              <X size={13} /> Clear
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by product name or SKU..." className="w-full bg-gray-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-primary-500 transition-colors" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary-500">
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-primary-500">
          {['All', 'Healthy', 'Low Stock', 'Out of Stock'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-5 px-5">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-500">No products found.</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-gray-500 border-b border-white/5">
                <th className="py-3 pr-3 w-8">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                    className="w-4 h-4 accent-primary-600 cursor-pointer rounded" />
                </th>
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
              {filtered.map((p, i) => {
                const isChecked = selected.has(p.id);
                const isExactSku = search && (p.defaults?.sku === search || p.sku === search);
                return (
                  <tr key={p.id}
                    className={`border-b border-white/5 transition-colors cursor-pointer ${
                      isChecked ? 'bg-primary-600/5' : 'hover:bg-white/[0.02]'
                    } ${isExactSku ? 'border-l-2 border-l-primary-500' : ''}`}
                    style={{ animation: `fadeIn 0.3s ease-out ${i * 0.04}s both` }}
                    onClick={() => toggleRow(p.id)}
                  >
                    <td className="py-3 pr-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleRow(p.id)}
                        className="w-4 h-4 accent-primary-600 cursor-pointer rounded" />
                    </td>
                    <td className="py-3 font-bold text-gray-200" onClick={e => e.stopPropagation()}>{p.name}</td>
                    <td className="py-3 text-gray-500" onClick={e => e.stopPropagation()}>{p.category}</td>
                    <td className={`py-3 text-right font-bold ${p.status === 'out' ? 'text-red-500' : p.status === 'low' ? 'text-amber-500' : 'text-gray-200'}`} onClick={e => e.stopPropagation()}>
                      {p.currentStock} <span className="text-xs text-gray-600 font-normal">{p.unit}</span>
                    </td>
                    <td className="py-3 text-right text-gray-500" onClick={e => e.stopPropagation()}>{p.lowStockThreshold}</td>
                    <td className="py-3 text-center" onClick={e => e.stopPropagation()}>
                      {p.status === 'out' ? <span className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-1 rounded-full uppercase tracking-wider">Out of Stock</span> :
                       p.status === 'low' ? <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-full uppercase tracking-wider">Low Stock</span> :
                       <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-1 rounded-full uppercase tracking-wider">Healthy</span>}
                    </td>
                    <td className="py-3 text-right text-gray-500 text-xs" onClick={e => e.stopPropagation()}>{p.lastLoaded}</td>
                    <td className="py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => onLoad(p)} className="px-2 py-1 bg-primary-600/20 text-primary-400 hover:bg-primary-600 hover:text-white rounded text-xs font-bold transition-colors">Load</button>
                        <button onClick={() => onHistory(p)} title="Stock History" className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"><ClipboardList size={14} /></button>
                        <button onClick={() => onEdit(p)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => onDelete(p)} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Bulk Modals */}
      {bulkDeleteOpen && (
        <BulkDeleteModal
          count={selected.size}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={handleBulkDelete}
          loading={bulkLoading}
        />
      )}
      {bulkEditOpen && (
        <BulkEditModal
          count={selected.size}
          selectedProducts={selectedProducts}
          firestoreCategories={firestoreCategories}
          onClose={() => setBulkEditOpen(false)}
          onConfirm={handleBulkEdit}
          loading={bulkLoading}
        />
      )}
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

const UNIT_OPTIONS = ['kg', 'g', 'pcs', 'box', 'litre', 'ml', 'dozen', 'carton', 'pack', 'pair', 'bag', 'Other'];
const MAX_SLOTS = 10;

function emptySlot() {
  return { id: Date.now() + Math.random(), category: '', product: '', qty: '', unit: 'pcs', customUnit: '', size: '', threshold: '', collapsed: false };
}

function LoadStockModal({ computedData, initialProductId, onClose, onSave, onAddHistory, onUpdateProduct, toast }) {
  const todayISO = new Date().toISOString().split('T')[0];
  const categories = [...new Set(computedData.map(p => p.category).filter(Boolean))];

  const makeInitialSlot = () => {
    if (initialProductId) {
      const p = computedData.find(x => x.id === initialProductId);
      if (p) return { ...emptySlot(), category: p.category || '', product: p.id, unit: p.unit || 'pcs', threshold: String(p.lowStockThreshold || '') };
    }
    return emptySlot();
  };

  const [slots, setSlots] = useState([makeInitialSlot()]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateSlot = (idx, patch) => setSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  const toggleCollapse = (idx) => updateSlot(idx, { collapsed: !slots[idx].collapsed });

  const getFilteredProducts = (cat) => computedData.filter(p => !cat || p.category === cat);

  const slotValid = (s) => s.product && s.qty && Number(s.qty) > 0 && s.threshold !== '' && (s.unit !== 'Other' || s.customUnit.trim());

  const handleLoadNext = (idx) => {
    if (!slotValid(slots[idx])) { toast('Fill all required fields before adding next item', 'error'); return; }
    setSlots(prev => [
      ...prev.map((s, i) => i === idx ? { ...s, collapsed: true } : s),
      emptySlot()
    ]);
  };

  const handleConfirmAll = () => {
    const invalid = slots.find(s => !slotValid(s));
    if (invalid) { toast('All slots must be fully filled before confirming', 'error'); return; }
    setConfirmOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const s of slots) {
        const product = computedData.find(p => p.id === s.product);
        if (!product) continue;
        const qty = Number(s.qty);
        const threshold = Number(s.threshold);
        const unitLabel = s.unit === 'Other' ? s.customUnit.trim() : s.unit;
        const stockAfter = product.currentStock + qty;
        await onSave({
          productId: product.id,
          productName: product.name,
          category: product.category,
          date: todayISO,
          quantityLoaded: qty,
          previousStock: product.currentStock,
          newStock: stockAfter,
          unit: unitLabel,
          size: s.size || '',
          note: ''
        });
        await onUpdateProduct(product.id, { lowStockThreshold: threshold });
        // Write stockHistory entry
        if (onAddHistory) {
          await onAddHistory({
            productId: product.id,
            productName: product.name,
            quantityAdded: qty,
            unit: unitLabel,
            stockAfter,
          }).catch(() => {});
        }
      }
      toast(`${slots.length} item${slots.length > 1 ? 's' : ''} loaded successfully`);
      onClose();
    } catch {
      toast('Failed to save stock. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";
  const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="fixed inset-0 z-50 flex bg-black/70 backdrop-blur-sm animate-fadeIn">
      {/* Side drawer */}
      <div className="ml-auto w-full max-w-2xl h-full flex flex-col bg-gray-950 border-l border-white/10 shadow-2xl animate-[slideInRight_0.25s_ease-out_forwards]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600/15 rounded-xl"><Layers size={20} className="text-primary-400" /></div>
            <div>
              <h2 className="text-lg font-bold text-white font-heading">Load Stock</h2>
              <p className="text-xs text-gray-500">{slots.length}/{MAX_SLOTS} slot{slots.length !== 1 ? 's' : ''} added</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors"><X size={18} /></button>
        </div>

        {/* Slots scrollable area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          {slots.map((slot, idx) => {
            const slotProduct = computedData.find(p => p.id === slot.product);
            const isLast = idx === slots.length - 1;

            return (
              <div key={slot.id} className="border border-white/10 rounded-2xl overflow-hidden bg-gray-900/60">
                {/* Slot header */}
                <button type="button" onClick={() => toggleCollapse(idx)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary-600/20 text-primary-400 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                    {slot.collapsed && slotProduct ? (
                      <span className="text-sm font-semibold text-gray-200">
                        {slotProduct.name}
                        <span className="text-gray-500 font-normal ml-2">— Qty: {slot.qty} {slot.unit === 'Other' ? slot.customUnit : slot.unit}</span>
                      </span>
                    ) : (
                      <span className="text-sm font-semibold text-gray-400">{slotProduct ? slotProduct.name : `Item ${idx + 1}`}</span>
                    )}
                  </div>
                  {slot.collapsed
                    ? <ChevronDown size={16} className="text-gray-500" />
                    : <ChevronUp size={16} className="text-gray-500" />
                  }
                </button>

                {/* Slot fields */}
                {!slot.collapsed && (
                  <div className="px-4 pb-4 space-y-3 border-t border-white/5">
                    <div className="pt-3" />
                    {/* Row 1: Category + Product */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Category *</label>
                        <select value={slot.category} onChange={e => updateSlot(idx, { category: e.target.value, product: '' })} className={inputCls}>
                          <option value="">Select category...</option>
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Product *</label>
                        <select value={slot.product} onChange={e => {
                          const p = computedData.find(x => x.id === e.target.value);
                          updateSlot(idx, { product: e.target.value, unit: p?.unit || 'pcs', threshold: String(p?.lowStockThreshold || '') });
                        }} className={inputCls} disabled={!slot.category}>
                          <option value="">{slot.category ? 'Select product...' : 'Category first'}</option>
                          {getFilteredProducts(slot.category).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Quantity + Unit */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Quantity *</label>
                        <input type="number" min="1" value={slot.qty} onChange={e => updateSlot(idx, { qty: e.target.value })} className={inputCls} placeholder="0" />
                      </div>
                      <div>
                        <label className={labelCls}>Unit *</label>
                        <select value={slot.unit} onChange={e => updateSlot(idx, { unit: e.target.value, customUnit: '' })} className={inputCls}>
                          {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                        {slot.unit === 'Other' && (
                          <input type="text" value={slot.customUnit} onChange={e => updateSlot(idx, { customUnit: e.target.value })}
                            className={`${inputCls} mt-2`} placeholder="Enter unit name..." />
                        )}
                      </div>
                    </div>

                    {/* Row 3: Size + Threshold */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Size / Description</label>
                        <input type="text" value={slot.size} onChange={e => updateSlot(idx, { size: e.target.value })}
                          className={inputCls} placeholder="e.g. 1kg bag, 500ml bottle" />
                      </div>
                      <div>
                        <label className={labelCls}>Low Stock Threshold *</label>
                        <input type="number" min="0" value={slot.threshold} onChange={e => updateSlot(idx, { threshold: e.target.value })}
                          className={inputCls} placeholder="e.g. 10" />
                      </div>
                    </div>

                    {/* Stock projection */}
                    {slotProduct && slot.qty && (
                      <div className="flex items-center justify-between px-3 py-2 bg-primary-600/10 border border-primary-500/20 rounded-xl text-sm">
                        <span className="text-xs text-primary-500/70 font-bold uppercase tracking-wider">Projected Stock</span>
                        <span className="font-bold text-primary-400">{slotProduct.currentStock + Number(slot.qty)} {slot.unit === 'Other' ? slot.customUnit : slot.unit}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Load Next button */}
          {slots.length < MAX_SLOTS ? (
            <button type="button" onClick={() => handleLoadNext(slots.length - 1)}
              className="w-full py-3 border border-dashed border-white/20 rounded-2xl text-sm font-bold text-gray-400 hover:border-primary-500/50 hover:text-primary-400 transition-colors flex items-center justify-center gap-2">
              <Plus size={16} /> Load Next Item
            </button>
          ) : (
            <p className="text-center text-xs text-gray-500 py-2">Maximum {MAX_SLOTS} items per load session</p>
          )}
        </div>

        {/* Fixed footer */}
        <div className="shrink-0 px-6 py-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleConfirmAll} disabled={slots.length === 0}
            className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50">
            Confirm All ({slots.length})
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl scale-95 animate-[scaleIn_0.2s_ease-out_forwards] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h3 className="text-lg font-bold text-white font-heading">Confirm Stock Load</h3>
              <p className="text-xs text-gray-500 mt-0.5">Review all items before saving to inventory</p>
            </div>
            <div className="p-6 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {slots.map((s, i) => {
                const p = computedData.find(x => x.id === s.product);
                const unitLabel = s.unit === 'Other' ? s.customUnit : s.unit;
                return (
                  <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0 text-sm">
                    <div>
                      <p className="font-semibold text-gray-200">{p?.name || '—'}</p>
                      {s.size && <p className="text-xs text-gray-500">{s.size}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white">Qty: {s.qty} {unitLabel}</p>
                      <p className="text-xs text-gray-500">Threshold: {s.threshold}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => setConfirmOpen(false)} disabled={saving}
                className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PRODUCT_UNIT_OPTIONS = ['pcs', 'kg', 'g', 'L', 'ml', 'box', 'dozen', 'carton', 'pack', 'bag', 'pair', 'Other'];

function ProductModal({ editId, initialData, onClose, onSave, firestoreCategories = [], addCategory, toast }) {
  const [f, setF] = useState(() => ({
    name: initialData?.name || '',
    category: initialData?.category || '',
    unit: initialData?.defaults?.unit || initialData?.unit || 'pcs',
    customUnit: '',
    size: initialData?.defaults?.size || '',
    sku: initialData?.defaults?.sku || '',
    lowStockThreshold: initialData?.defaults?.threshold ?? initialData?.lowStockThreshold ?? 5,
    openingStock: 0,
    internalNote: initialData?.internalNote || initialData?.note || '',
  }));

  // Category dropdown state
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingCatLoading, setAddingCatLoading] = useState(false);
  const catDropRef = useRef(null);
  const newCatInputRef = useRef(null);
  const [saving, setSaving] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    if (!catDropOpen) return;
    const handler = (e) => {
      if (catDropRef.current && !catDropRef.current.contains(e.target)) {
        setCatDropOpen(false);
        setAddingCat(false);
        setNewCatName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [catDropOpen]);

  useEffect(() => {
    if (addingCat && newCatInputRef.current) newCatInputRef.current.focus();
  }, [addingCat]);

  const filteredCats = firestoreCategories.filter(c =>
    c.name?.toLowerCase().includes(catSearch.toLowerCase())
  );

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setAddingCatLoading(true);
    try {
      await addCategory(newCatName.trim());
      setF(p => ({ ...p, category: newCatName.trim() }));
      setNewCatName('');
      setAddingCat(false);
      setCatDropOpen(false);
    } catch { toast('Failed to add category', 'error'); }
    finally { setAddingCatLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return toast('Product name is required', 'error');
    if (!f.category) return toast('Category is required', 'error');
    if (f.unit === 'Other' && !f.customUnit.trim()) return toast('Custom unit is required', 'error');

    setSaving(true);
    try {
      const unitLabel = f.unit === 'Other' ? f.customUnit.trim() : f.unit;
      const threshold = Number(f.lowStockThreshold) || 0;
      const openingStock = editId ? (initialData?.openingStock ?? 0) : Number(f.openingStock) || 0;

      let status = 'healthy';
      if (openingStock === 0) status = 'out';
      else if (openingStock <= threshold) status = 'low';

      if (editId) {
        await onSave(editId, {
          name: f.name.trim(),
          category: f.category,
          defaults: { unit: unitLabel, size: f.size.trim(), sku: f.sku.trim(), threshold },
          unit: unitLabel,
          lowStockThreshold: threshold,
          internalNote: f.internalNote.trim(),
        });
      } else {
        await onSave({
          name: f.name.trim(),
          category: f.category,
          defaults: { unit: unitLabel, size: f.size.trim(), sku: f.sku.trim(), threshold },
          unit: unitLabel,
          lowStockThreshold: threshold,
          openingStock,
          status,
          internalNote: f.internalNote.trim(),
        });
      }
      toast(editId ? 'Product updated' : 'Product added');
      onClose();
    } catch { toast('Error saving product', 'error'); }
    finally { setSaving(false); }
  };

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";
  const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="glass w-full max-w-lg shadow-2xl scale-95 animate-[scaleIn_0.2s_ease-out_forwards] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white font-heading">{editId ? 'Edit Product' : 'Add New Product'}</h2>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 custom-scrollbar">
          <div className="p-6 space-y-4">

            {/* Row 1: Product Name */}
            <div>
              <label className={labelCls}>Product Name *</label>
              <input required autoFocus value={f.name} onChange={e => setF({...f, name: e.target.value})}
                className={inputCls} placeholder="e.g. Full Cream Milk" />
            </div>

            {/* Row 2: Category + Unit */}
            <div className="grid grid-cols-2 gap-3">
              {/* Category custom dropdown */}
              <div>
                <label className={labelCls}>Category *</label>
                <div className="relative" ref={catDropRef}>
                  <button type="button" onClick={() => { setCatDropOpen(p => !p); setCatSearch(''); }}
                    className={`${inputCls} text-left flex items-center justify-between ${!f.category ? 'text-gray-500' : ''}`}>
                    <span className="truncate">{f.category || 'Select category...'}</span>
                    <ChevronDown size={14} className={`shrink-0 ml-2 transition-transform ${catDropOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {catDropOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                      <div className="p-2">
                        <input value={catSearch} onChange={e => setCatSearch(e.target.value)}
                          className="w-full bg-gray-950 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-primary-500"
                          placeholder="Search categories..." autoFocus />
                      </div>
                      <div className="max-h-44 overflow-y-auto custom-scrollbar">
                        {/* Add New Category option */}
                        {!addingCat ? (
                          <button type="button" onClick={() => { setAddingCat(true); setCatSearch(''); }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-primary-400 hover:bg-primary-600/10 transition-colors">
                            <Plus size={14} /> Add New Category
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 px-3 py-2">
                            <input ref={newCatInputRef} value={newCatName} onChange={e => setNewCatName(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCategory(); } if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); } }}
                              className="flex-1 bg-gray-950 border border-primary-500/50 rounded-lg px-2.5 py-1.5 text-sm text-white outline-none"
                              placeholder="New category name..." />
                            <button type="button" onClick={handleAddCategory} disabled={addingCatLoading || !newCatName.trim()}
                              className="p-1.5 bg-primary-600 rounded-lg text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
                              {addingCatLoading ? '...' : '✓'}
                            </button>
                          </div>
                        )}
                        <div className="border-t border-white/5">
                          {filteredCats.length === 0 && !addingCat && (
                            <p className="text-xs text-gray-500 text-center py-3">No categories yet</p>
                          )}
                          {filteredCats.map(c => (
                            <button key={c.id} type="button" onClick={() => { setF(p => ({...p, category: c.name})); setCatDropOpen(false); }}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                                f.category === c.name ? 'bg-primary-600/20 text-primary-400 font-bold' : 'text-gray-300 hover:bg-white/5'
                              }`}>{c.name}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Unit */}
              <div>
                <label className={labelCls}>Unit *</label>
                <select value={f.unit} onChange={e => setF({...f, unit: e.target.value, customUnit: ''})} className={inputCls}>
                  {PRODUCT_UNIT_OPTIONS.map(u => <option key={u} value={u}>{u === 'pcs' ? 'Pieces (pcs)' : u === 'kg' ? 'Kilograms (kg)' : u === 'g' ? 'Grams (g)' : u === 'L' ? 'Litres (L)' : u === 'ml' ? 'Millilitres (ml)' : u}</option>)}
                </select>
                {f.unit === 'Other' && (
                  <input value={f.customUnit} onChange={e => setF({...f, customUnit: e.target.value})}
                    className={`${inputCls} mt-2`} placeholder="Enter unit name..." required />
                )}
              </div>
            </div>

            {/* Row 3: Size + SKU */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Size / Description</label>
                <input value={f.size} onChange={e => setF({...f, size: e.target.value})}
                  className={inputCls} placeholder="e.g. 500ml, 1kg bag, Large" />
              </div>
              <div>
                <label className={labelCls}>SKU / Code</label>
                <input value={f.sku} onChange={e => setF({...f, sku: e.target.value})}
                  className={inputCls} placeholder="e.g. MLK-001" />
              </div>
            </div>

            {/* Row 4: Threshold + Opening Stock */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Low Stock Threshold *</label>
                <input type="number" min="0" required value={f.lowStockThreshold}
                  onChange={e => setF({...f, lowStockThreshold: e.target.value})} className={inputCls} />
              </div>
              <div>
                <label className={`${labelCls} flex items-center gap-1.5`}>
                  Opening Stock *
                  <span className="relative group cursor-help">
                    <span className="text-gray-600 text-[10px] border border-gray-700 rounded-full px-1">?</span>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 bg-gray-800 text-[10px] text-white p-2 rounded-lg hidden group-hover:block z-10 text-center leading-tight shadow-xl whitespace-normal">
                      Set once at creation. Use 'Load Stock' to add more later.
                    </span>
                  </span>
                </label>
                <input type="number" min="0" value={f.openingStock}
                  onChange={e => setF({...f, openingStock: e.target.value})}
                  disabled={!!editId}
                  className={`${inputCls} ${editId ? 'opacity-50 cursor-not-allowed' : ''}`} />
              </div>
            </div>

            {/* Row 5: Internal Note */}
            <div>
              <label className={labelCls}>Internal Note</label>
              <textarea value={f.internalNote} onChange={e => setF({...f, internalNote: e.target.value})}
                className={`${inputCls} h-16 resize-none`} placeholder="Visible only to you" />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50">
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Add Product'}
            </button>
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
      <div className="glass !border-red-500/30 w-full max-w-sm shadow-2xl p-6 text-center scale-95 animate-[scaleIn_0.2s_ease-out_forwards]">
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

function QuickLoadModal({ product, onClose, onSave, onUpdateProduct, events = [], onUpdateEvent, onAddEvent, toast }) {
  const [f, setF] = useState({
    qty: '',
    unit: UNIT_OPTIONS.includes(product.unit) ? product.unit : (product.unit ? 'Other' : 'pcs'),
    customUnit: UNIT_OPTIONS.includes(product.unit) ? '' : (product.unit || ''),
    size: '',
    threshold: product.lowStockThreshold || ''
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = Number(f.qty);
    if (!qty || qty <= 0) return toast('Valid quantity required', 'error');
    if (f.unit === 'Other' && !f.customUnit.trim()) return toast('Custom unit required', 'error');
    if (f.threshold === '') return toast('Threshold required', 'error');

    setSaving(true);
    try {
      const unitLabel = f.unit === 'Other' ? f.customUnit.trim() : f.unit;
      const todayStr = new Date().toISOString().split('T')[0];
      
      await onSave({
        productId: product.id,
        productName: product.name,
        category: product.category,
        date: todayStr,
        quantityLoaded: qty,
        previousStock: product.currentStock,
        newStock: product.currentStock + qty,
        unit: unitLabel,
        size: f.size.trim(),
        note: ''
      });

      const newThreshold = Number(f.threshold);
      if (newThreshold !== product.lowStockThreshold) {
        await onUpdateProduct(product.id, { lowStockThreshold: newThreshold });
      }

      // Auto-complete linked stock_order events for this product
      if (onUpdateEvent && onAddEvent) {
        const linkedEvents = events.filter(e =>
          e.type === 'stock_order' && e.linkedProductId === product.id && e.status !== 'completed'
        );
        for (const ev of linkedEvents) {
          await onUpdateEvent(ev.id, { status: 'completed' });
          // Auto-generate next recurrence if recurring
          if (ev.recurring?.enabled && ev.recurring?.frequency) {
            const nextDate = new Date(ev.date + 'T12:00:00');
            if (ev.recurring.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
            else if (ev.recurring.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
            else if (ev.recurring.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
            const nextDateStr = nextDate.toISOString().split('T')[0];
            await onAddEvent(null, { ...ev, id: undefined, date: nextDateStr, status: 'pending' }).catch(() => {});
          }
        }
      }

      toast('Stock loaded successfully');
      onClose();
    } catch {
      toast('Failed to load stock', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";
  const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="glass w-full max-w-sm shadow-2xl p-6 scale-95 animate-[scaleIn_0.2s_ease-out_forwards]">
        <h2 className="text-xl font-bold text-white font-heading mb-1 text-center">Restock</h2>
        <p className="text-center text-primary-400 font-bold mb-6">{product.name}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Category</label>
              <input type="text" value={product.category || ''} disabled className={`${inputCls} opacity-60 bg-gray-900 cursor-not-allowed`} />
            </div>
            <div>
              <label className={labelCls}>Product</label>
              <input type="text" value={product.name} disabled className={`${inputCls} opacity-60 bg-gray-900 cursor-not-allowed`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Quantity *</label>
              <input type="number" min="1" required autoFocus value={f.qty} onChange={e => setF({...f, qty: e.target.value})} className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Unit *</label>
              <select value={f.unit} onChange={e => setF({...f, unit: e.target.value, customUnit: ''})} className={inputCls}>
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {f.unit === 'Other' && (
            <div>
              <label className={labelCls}>Custom Unit *</label>
              <input type="text" required value={f.customUnit} onChange={e => setF({...f, customUnit: e.target.value})} className={inputCls} placeholder="Enter unit name..." />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Size / Desc</label>
              <input type="text" value={f.size} onChange={e => setF({...f, size: e.target.value})} className={inputCls} placeholder="e.g. 1kg" />
            </div>
            <div>
              <label className={labelCls}>Threshold *</label>
              <input type="number" min="0" required value={f.threshold} onChange={e => setF({...f, threshold: e.target.value})} className={inputCls} />
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 p-3 bg-primary-600/10 border border-primary-500/20 rounded-xl">
            <span className="text-xs font-bold text-primary-500/70 uppercase tracking-wider">New Stock</span>
            <span className="font-bold text-primary-400">{product.currentStock + (Number(f.qty) || 0)}</span>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
