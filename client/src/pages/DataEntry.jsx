import { useState } from 'react';
import { Card, SummaryCard } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import DataImporter from '../components/ui/DataImporter';
import { useProducts, useEntries } from '../hooks/useFirestore';
import { ClipboardList, ShoppingCart, DollarSign } from 'lucide-react';

export default function DataEntry() {
  const { products } = useProducts();
  const { addEntry, entries } = useEntries();
  const { toast, showToast, hideToast } = useToast();
  
  const [f, setF] = useState({ date: new Date().toISOString().split('T')[0], product: '', category: '', qty: '', rev: '', cost: '' });

  const handleProductSelect = (name) => {
    const prod = products.find(p => p.name === name);
    setF(prev => ({ ...prev, product: name, category: prod?.category || prev.category }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.date || !f.product || !f.qty || !f.rev || !f.cost) {
      showToast('Please fill all fields', 'error'); return;
    }
    try {
      await addEntry({
        date: f.date,
        product: f.product,
        category: f.category || 'Uncategorized',
        quantitySold: Number(f.qty),
        revenue: Number(f.rev),
        cost: Number(f.cost),
        stockAdded: 0,
        stockRemaining: 0 // In a real app, this would calculate from previous stock
      });
      showToast('Sale recorded successfully!');
      setF({ ...f, product: '', qty: '', rev: '', cost: '' });
    } catch {
      showToast('Error recording sale', 'error');
    }
  };

  const todayEntries = entries.filter(e => e.date === new Date().toISOString().split('T')[0]);
  const todayRev = todayEntries.reduce((s, e) => s + e.revenue, 0);
  const todaySales = todayEntries.length;

  const inputCls = "w-full glass text-gray-800 dark:text-white px-4 py-3 text-sm outline-none focus:border-primary-500 transition-all";
  const labelCls = "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide";

  return (
    <div className="max-w-5xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      {/* Floating Importer Widget */}
      <DataImporter />

      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Daily Log</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Record point-of-sale transactions and upload historical data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white font-heading border-b border-gray-100 dark:border-gray-800 pb-4 mb-5 flex items-center gap-2">
              <ClipboardList size={20} className="text-primary-500" /> New Sale Entry
            </h3>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={f.date} onChange={e => setF({...f, date: e.target.value})} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Category (Auto)</label>
                  <input value={f.category} onChange={e => setF({...f, category: e.target.value})} className={inputCls} placeholder="Category" />
                </div>
              </div>
              
              <div>
                <label className={labelCls}>Product</label>
                <select value={f.product} onChange={e => handleProductSelect(e.target.value)} className={inputCls}>
                  <option value="" disabled>Select a product...</option>
                  {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                {products.length === 0 && <p className="text-xs text-amber-500 mt-1">No products found. Add products in Inventory first.</p>}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Qty Sold</label>
                  <input type="number" min="1" value={f.qty} onChange={e => setF({...f, qty: e.target.value})} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Revenue ($)</label>
                  <input type="number" min="0" value={f.rev} onChange={e => setF({...f, rev: e.target.value})} className={inputCls} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls}>Cost ($)</label>
                  <input type="number" min="0" value={f.cost} onChange={e => setF({...f, cost: e.target.value})} className={inputCls} placeholder="0.00" />
                </div>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full bg-primary-600 text-white py-3.5 rounded-xl font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 text-sm">
                  Record Transaction
                </button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <SummaryCard label="Today's Sales" value={todaySales} icon={<ShoppingCart size={20} />} />
          <SummaryCard label="Today's Revenue" value={`$${todayRev.toLocaleString()}`} color="text-primary-600" icon={<DollarSign size={20} />} />
          
          <Card className="bg-gradient-to-br from-primary-900 to-gray-950 text-white border-none mt-6">
            <h3 className="font-bold font-heading text-lg mb-2 text-primary-100">Need Bulk Import?</h3>
            <p className="text-xs text-primary-200/80 mb-4 leading-relaxed">
              Use the floating gold button at the bottom right of the screen to quickly upload your historical Excel or CSV sheets. It will instantly optimize your charts!
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
