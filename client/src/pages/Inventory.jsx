import { useState, useMemo, useRef, useEffect } from 'react';
import { useProducts, useEntries } from '../hooks/useFirestore';
import { SummaryCard, Card } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { Package, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export default function Inventory() {
  const { products, addProduct, updateProduct, deleteProduct } = useProducts();
  const { entries } = useEntries();
  const { toast, showToast, hideToast } = useToast();
  const blank = { name: '', category: '', unit: 'pcs', quantity: '', lowStockThreshold: '' };
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState(null);
  const chartRef = useRef(); const cRef = useRef();
  const units = ['kg', 'pcs', 'liters', 'boxes'];

  const addProd = async (e) => {
    e.preventDefault();
    if (!f.name || !f.category || !f.lowStockThreshold) { showToast('All fields required', 'error'); return; }
    try {
      if (editId) { await updateProduct(editId, { name: f.name, category: f.category, unit: f.unit, quantity: +f.quantity, lowStockThreshold: +f.lowStockThreshold }); setEditId(null); showToast('Product updated'); }
      else { await addProduct({ name: f.name, category: f.category, unit: f.unit, quantity: +f.quantity, lowStockThreshold: +f.lowStockThreshold }); showToast('Product added'); }
      setF(blank);
    } catch { showToast('Error saving', 'error'); }
  };
  const startEdit = p => { setEditId(p.id); setF({ name: p.name, category: p.category, unit: p.unit, quantity: p.quantity || '', lowStockThreshold: p.lowStockThreshold }); };
  const delProd = async (id) => { await deleteProduct(id); showToast('Deleted'); };

  const { stockData, outCount, lowCount, okCount, restockLog } = useMemo(() => {
    const getStock = p => {
      const pe = entries.filter(e => e.product === p.name).sort((a, b) => b.date?.localeCompare(a.date) || 0);
      return pe.length ? pe[0].stockRemaining : (p.quantity || 0);
    };
    const stockData = products.map(p => {
      const stock = getStock(p);
      const status = stock === 0 ? 'out' : stock <= p.lowStockThreshold ? 'low' : 'ok';
      return { ...p, stock, status };
    });
    return {
      stockData,
      outCount: stockData.filter(s => s.status === 'out').length,
      lowCount: stockData.filter(s => s.status === 'low').length,
      okCount: stockData.filter(s => s.status === 'ok').length,
      restockLog: entries.filter(e => e.stockAdded > 0).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    };
  }, [products, entries]);

  useEffect(() => {
    if (cRef.current) cRef.current.destroy();
    if (chartRef.current && stockData.length) {
      cRef.current = new Chart(chartRef.current, {
        type: 'bar',
        data: { labels: stockData.map(s => s.name), datasets: [{ label: 'Stock Level', data: stockData.map(s => s.stock), backgroundColor: stockData.map(s => s.status === 'out' ? 'rgba(239,68,68,0.5)' : s.status === 'low' ? 'rgba(245,158,11,0.5)' : 'rgba(59,130,246,0.5)'), borderRadius: 8, barThickness: 28 }] },
        options: { responsive: true, plugins: { legend: { labels: { color: '#64748b' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#f1f5f9' } } } }
      });
    }
    return () => { if (cRef.current) cRef.current.destroy(); };
  }, [stockData]);

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all bg-white dark:bg-gray-950 text-gray-800 dark:text-white";
  const labelCls = "block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1";

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      <Card>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">{editId ? 'Edit' : 'Add'} Product</h3>
        <form onSubmit={addProd} className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div><label className={labelCls}>Name</label><input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>Category</label><input value={f.category} onChange={e => setF(p => ({ ...p, category: e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>Unit</label><select value={f.unit} onChange={e => setF(p => ({ ...p, unit: e.target.value }))} className={inputCls}>{units.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
          <div><label className={labelCls}>Quantity</label><input type="number" min="0" value={f.quantity} onChange={e => setF(p => ({ ...p, quantity: e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>Low Stock Threshold</label><input type="number" min="0" value={f.lowStockThreshold} onChange={e => setF(p => ({ ...p, lowStockThreshold: e.target.value }))} className={inputCls} /></div>
          <div className="flex items-end gap-2"><button type="submit" className="flex-1 bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">{editId ? 'Update' : 'Add'}</button>{editId && <button type="button" onClick={() => { setEditId(null); setF(blank); }} className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-2.5 px-3 rounded-xl text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>}</div>
        </form>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Products" value={products.length} icon={<Package size={20} />} />
        <SummaryCard label="Out of Stock" value={outCount} color="text-red-500 dark:text-red-400" icon={<XCircle size={20} />} />
        <SummaryCard label="Low Stock" value={lowCount} color="text-amber-500" icon={<AlertTriangle size={20} />} />
        <SummaryCard label="Healthy" value={okCount} color="text-green-600 dark:text-green-400" icon={<CheckCircle size={20} />} />
      </div>

      <Card className="overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Stock Overview</h3>
        {products.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">No products registered yet</p> :
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 dark:text-gray-500 text-xs border-b border-gray-100 dark:border-gray-800"><th className="text-left pb-2">Product</th><th className="text-left pb-2">Category</th><th className="text-left pb-2">Unit</th><th className="text-right pb-2">Stock</th><th className="text-right pb-2">Threshold</th><th className="text-center pb-2">Status</th><th className="text-right pb-2">Actions</th></tr></thead>
          <tbody>{stockData.map(s => (
            <tr key={s.id} className={`border-b border-gray-50 dark:border-gray-800/50 transition-colors ${s.status === 'out' ? 'bg-red-50/50 dark:bg-red-900/10' : s.status === 'low' ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
              <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{s.name}</td><td className="py-2.5 text-gray-400 dark:text-gray-500">{s.category}</td><td className="py-2.5 text-gray-400 dark:text-gray-500">{s.unit}</td>
              <td className="py-2.5 text-right font-semibold text-gray-800 dark:text-gray-200">{s.stock}</td><td className="py-2.5 text-right text-gray-400 dark:text-gray-500">{s.lowStockThreshold}</td>
              <td className="py-2.5 text-center">{s.status === 'out' ? <span className="text-xs font-medium text-red-500 bg-red-50 dark:bg-red-900/30 px-2 py-1 rounded-full">🔴 Out</span> : s.status === 'low' ? <span className="text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">🟡 Low</span> : <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-1 rounded-full">🟢 OK</span>}</td>
              <td className="py-2.5 text-right"><button onClick={() => startEdit(s)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline mr-2 font-medium">Edit</button><button onClick={() => delProd(s.id)} className="text-xs text-red-500 hover:underline font-medium">Delete</button></td>
            </tr>
          ))}</tbody>
        </table>}
      </Card>

      {stockData.length > 0 && <Card><h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Stock Levels</h3><canvas ref={chartRef} /></Card>}

      {restockLog.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Restock Log</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 dark:text-gray-500 text-xs border-b border-gray-100 dark:border-gray-800"><th className="text-left pb-2">Date</th><th className="text-left pb-2">Product</th><th className="text-right pb-2">Qty Added</th><th className="text-right pb-2">New Stock</th></tr></thead>
            <tbody>{restockLog.map(e => (
              <tr key={e.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"><td className="py-2.5 text-gray-800 dark:text-gray-200">{e.date}</td><td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{e.product}</td><td className="py-2.5 text-right text-green-600 dark:text-green-400 font-semibold">+{e.stockAdded}</td><td className="py-2.5 text-right text-gray-800 dark:text-gray-200">{e.stockRemaining}</td></tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
