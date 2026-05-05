import { useState } from 'react';
import { Card, SummaryCard } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { useProducts, useEntries } from '../hooks/useFirestore';
import { ClipboardList, ShoppingCart, DollarSign } from 'lucide-react';

export default function DataEntry() {
  const { products } = useProducts();
  const { addEntry, entries } = useEntries();
  const { toast, showToast, hideToast } = useToast();
  
  const [f, setF] = useState({ date: new Date().toISOString().split('T')[0], product: '', category: '', qty: '', unitPrice: '' });
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const total = (Number(f.qty) || 0) * (Number(f.unitPrice) || 0);

  const handleProductSelect = (name) => {
    const prod = products.find(p => p.name === name);
    // Auto-populate unit price if product has a price, otherwise leave it empty for manual entry
    setF(prev => ({ 
      ...prev, 
      product: name, 
      category: prod?.category || prev.category,
      unitPrice: prod?.price || prev.unitPrice
    }));
  };

  const isFormValid = f.date && f.product && f.qty && f.unitPrice;

  const submit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      showToast('Please fill all required fields', 'error'); return;
    }
    try {
      await addEntry({
        date: f.date,
        product: f.product,
        category: f.category || 'Uncategorized',
        quantitySold: Number(f.qty),
        revenue: total,
        cost: 0, // Backend cost calculation can be updated later; setting to 0 for checkout
        stockAdded: 0,
        stockRemaining: 0 // In a real app, this would calculate from previous stock
      });
      showToast('Bill created successfully!');
      setF({ ...f, product: '', qty: '', unitPrice: '' });
    } catch {
      showToast('Error processing bill', 'error');
    }
  };

  const todayEntries = entries.filter(e => e.date === new Date().toISOString().split('T')[0]);
  const todayRev = todayEntries.reduce((s, e) => s + e.revenue, 0);
  const todaySales = todayEntries.length;

  const inputCls = "w-full glass text-gray-800 dark:text-white px-4 py-3 text-sm outline-none focus:border-primary-500 transition-all";
  const labelCls = "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide";

  return (
    <div className="w-full space-y-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      <div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Billing & Checkout</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Create and confirm customer bills in real time.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Billing Form (66%) */}
        <div className="lg:col-span-8 space-y-6">
          <Card>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white font-heading border-b border-gray-100 dark:border-gray-800 pb-4 mb-5 flex items-center gap-2">
              <ClipboardList size={20} className="text-primary-500" /> New Bill
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
                  <label className={labelCls}>Quantity</label>
                  <input type="number" min="1" value={f.qty} onChange={e => setF({...f, qty: e.target.value})} className={inputCls} placeholder="0" />
                </div>
                <div>
                  <label className={labelCls}>Unit Price ($)</label>
                  <input type="number" min="0" step="0.01" value={f.unitPrice} onChange={e => setF({...f, unitPrice: e.target.value})} className={inputCls} placeholder="0.00" />
                </div>
                <div>
                  <label className={labelCls}>Total ($)</label>
                  <input type="text" readOnly value={total.toFixed(2)} className={`${inputCls} bg-gray-50/50 dark:bg-gray-900/50 cursor-not-allowed opacity-70`} />
                </div>
              </div>

              <div>
                <label className={labelCls}>Payment Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                      paymentMethod === 'cash'
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : 'glass text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('credit')}
                    className={`py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                      paymentMethod === 'credit'
                        ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                        : 'glass text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                    }`}
                  >
                    Credit
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={!isFormValid}
                  className="w-full bg-primary-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-600"
                >
                  Checkout
                </button>
              </div>
            </form>
          </Card>
        </div>

        {/* Right Column: Order Summary & Stats (33%) */}
        <div className="lg:col-span-4 space-y-5">
          <Card className="border border-primary-500/20">
            <h3 className="font-bold text-gray-800 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-3 mb-3">Order Summary</h3>
            {f.product ? (
              <div className="space-y-3">
                <div className="flex justify-between items-start text-sm">
                  <div className="flex-1 pr-2">
                    <p className="font-semibold text-gray-800 dark:text-white line-clamp-2">{f.product}</p>
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5">Quantity: {f.qty || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 dark:text-gray-400">${Number(f.unitPrice || 0).toFixed(2)}</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                  <p className="font-bold text-gray-800 dark:text-white">Total</p>
                  <p className="font-bold text-primary-600 dark:text-primary-400 text-lg">${total.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic py-2">No items added yet</p>
            )}
          </Card>
          
          <SummaryCard label="Bills Today" value={todaySales} icon={<ShoppingCart size={20} />} />
          <SummaryCard label="Revenue Today" value={`$${todayRev.toLocaleString()}`} color="text-primary-600" icon={<DollarSign size={20} />} />
        </div>
      </div>
    </div>
  );
}
