import { useState, useMemo } from 'react';
import { Card, SummaryCard } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { useProducts, useEntries } from '../hooks/useFirestore';
import { ClipboardList, ShoppingCart, DollarSign } from 'lucide-react';

export default function DataEntry() {
  const { products } = useProducts();
  const { addEntry, entries } = useEntries();
  const { toast, showToast, hideToast } = useToast();

  // Auto-detected date (DD/MM/YYYY)
  const todayISO = new Date().toISOString().split('T')[0];
  const todayDisplay = new Date().toLocaleDateString('en-GB');

  const [f, setF] = useState({ category: '', product: '', qty: '' });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [discountType, setDiscountType] = useState('$'); // '$' or '%'

  // Derive unique categories from products
  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    cats.sort((a, b) => a.localeCompare(b));
    return cats;
  }, [products]);

  // Filter products by selected category
  const filteredProducts = useMemo(() => {
    if (!f.category) return [];
    return products.filter(p => p.category === f.category);
  }, [products, f.category]);

  // Get selected product's price
  const selectedProduct = products.find(p => p.name === f.product);
  const unitPrice = Number(selectedProduct?.price) || 0;
  const total = (Number(f.qty) || 0) * unitPrice;

  // Discount calculation
  const discountAmount = discountType === '%'
    ? (total * (Number(discount) || 0)) / 100
    : Number(discount) || 0;
  const netTotal = Math.max(0, total - discountAmount);

  const handleCategorySelect = (cat) => {
    setF(prev => ({ ...prev, category: cat, product: '', qty: '' }));
  };

  const handleProductSelect = (name) => {
    setF(prev => ({ ...prev, product: name }));
  };

  const isFormValid = f.category && f.product && f.qty;

  const submit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      showToast('Please fill all required fields', 'error'); return;
    }
    try {
      await addEntry({
        date: todayISO,
        product: f.product,
        category: f.category,
        quantitySold: Number(f.qty),
        revenue: netTotal,
        cost: 0,
        stockAdded: 0,
        stockRemaining: 0,
        paymentMethod,
        discount: discountAmount,
        discountType,
      });
      showToast('Bill created successfully!');
      setF({ ...f, product: '', qty: '' });
      setDiscount('');
    } catch {
      showToast('Error processing bill', 'error');
    }
  };

  const todayEntries = entries.filter(e => e.date === todayISO);
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
            <form onSubmit={submit} className="space-y-5">
              {/* Date (auto-detected, read-only) */}
              <div>
                <label className={labelCls}>Date</label>
                <input
                  type="text"
                  readOnly
                  value={todayDisplay}
                  className={`${inputCls} bg-gray-50/50 dark:bg-gray-900/50 cursor-not-allowed opacity-70`}
                />
              </div>

              {/* Category dropdown */}
              <div>
                <label className={labelCls}>Category</label>
                <select
                  value={f.category}
                  onChange={e => handleCategorySelect(e.target.value)}
                  className={inputCls}
                >
                  <option value="" disabled>Select a category...</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {categories.length === 0 && (
                  <p className="text-xs text-amber-500 mt-1">No categories found. Add products with categories in Inventory first.</p>
                )}
              </div>

              {/* Product + inline QT */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className={labelCls}>Product</label>
                  <select
                    value={f.product}
                    onChange={e => handleProductSelect(e.target.value)}
                    className={inputCls}
                    disabled={!f.category}
                  >
                    <option value="" disabled>{f.category ? 'Select a product...' : 'Choose category first'}</option>
                    {filteredProducts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                  {f.category && filteredProducts.length === 0 && (
                    <p className="text-xs text-amber-500 mt-1">No products in this category.</p>
                  )}
                </div>
                <div className="w-20 shrink-0">
                  <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wide text-center">QT</label>
                  <input
                    type="number"
                    min="1"
                    value={f.qty}
                    onChange={e => setF({ ...f, qty: e.target.value })}
                    className={`${inputCls} text-center`}
                    placeholder="0"
                    disabled={!f.product}
                  />
                </div>
              </div>

              {/* Total + Discount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Total ($)</label>
                  <input
                    type="text"
                    readOnly
                    value={total.toFixed(2)}
                    className={`${inputCls} bg-gray-50/50 dark:bg-gray-900/50 cursor-not-allowed opacity-70`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Discount</label>
                  <div className="flex gap-0">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={e => setDiscount(e.target.value)}
                      className={`${inputCls} !rounded-r-none`}
                      placeholder="0"
                    />
                    <button
                      type="button"
                      onClick={() => setDiscountType(prev => prev === '$' ? '%' : '$')}
                      className="px-4 py-3 glass !rounded-l-none !border-l-0 text-sm font-bold text-primary-500 hover:text-primary-400 transition-colors shrink-0 min-w-[44px]"
                    >
                      {discountType}
                    </button>
                  </div>
                </div>
              </div>

              {/* Net Total */}
              <div className="p-4 glass !border-primary-500/30 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Total</span>
                <span className="text-2xl font-bold text-primary-600 dark:text-primary-400 font-heading">${netTotal.toFixed(2)}</span>
              </div>

              {/* Payment Method */}
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

              {/* Checkout Button */}
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
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5">Qty: {f.qty || 0} × ${unitPrice.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-700 dark:text-gray-300">${total.toFixed(2)}</p>
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-sm text-red-500">
                    <p>Discount ({discountType === '%' ? `${discount}%` : `$${discount}`})</p>
                    <p>-${discountAmount.toFixed(2)}</p>
                  </div>
                )}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                  <p className="font-bold text-gray-800 dark:text-white">Net Total</p>
                  <p className="font-bold text-primary-600 dark:text-primary-400 text-lg">${netTotal.toFixed(2)}</p>
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
