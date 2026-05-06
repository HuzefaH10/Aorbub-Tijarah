import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, SummaryCard } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { useProducts, useEntries, useSettings } from '../hooks/useFirestore';
import { ClipboardList, ShoppingCart, DollarSign, Settings2, X } from 'lucide-react';

const DEFAULT_FIELDS = { unitPrice: false, unit: false, tax: false, notes: false };

export default function DataEntry() {
  const { products } = useProducts();
  const { addEntry, entries } = useEntries();
  const { settings, updateSettings } = useSettings();
  const { toast, showToast, hideToast } = useToast();

  // Auto-detected date (DD/MM/YYYY)
  const todayISO = new Date().toISOString().split('T')[0];
  const todayDisplay = new Date().toLocaleDateString('en-GB');

  const [f, setF] = useState({ category: '', product: '', qty: '' });
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [discountType, setDiscountType] = useState('$');

  // Optional field values
  const [manualUnitPrice, setManualUnitPrice] = useState('');
  const [unitField, setUnitField] = useState('pcs');
  const [taxPercent, setTaxPercent] = useState('');
  const [notesField, setNotesField] = useState('');

  // Customizable field toggles (persisted via Firestore settings)
  const [fieldToggles, setFieldToggles] = useState(DEFAULT_FIELDS);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  // Credit modal state
  const [creditModal, setCreditModal] = useState({ open: false, customerName: '', creditAmount: '', dueDate: '' });

  // Load saved field prefs from Firestore
  useEffect(() => {
    if (settings?.billingFields) {
      setFieldToggles(prev => ({ ...prev, ...settings.billingFields }));
    }
  }, [settings]);

  // Close panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelOpen && panelRef.current && !panelRef.current.contains(e.target) && !btnRef.current.contains(e.target)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const toggleField = async (key) => {
    const updated = { ...fieldToggles, [key]: !fieldToggles[key] };
    setFieldToggles(updated);
    try {
      await updateSettings({ billingFields: updated });
    } catch {
      // silently fail — local state still updates
    }
  };

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
  const effectiveUnitPrice = fieldToggles.unitPrice && manualUnitPrice !== ''
    ? Number(manualUnitPrice)
    : Number(selectedProduct?.price) || 0;
  const total = (Number(f.qty) || 0) * effectiveUnitPrice;

  // Tax calculation
  const taxAmount = fieldToggles.tax ? (total * (Number(taxPercent) || 0)) / 100 : 0;
  const totalAfterTax = total + taxAmount;

  // Discount calculation (applied after tax)
  const discountAmount = discountType === '%'
    ? (totalAfterTax * (Number(discount) || 0)) / 100
    : Number(discount) || 0;
  const netTotal = Math.max(0, totalAfterTax - discountAmount);

  const handleCategorySelect = (cat) => {
    setF(prev => ({ ...prev, category: cat, product: '', qty: '' }));
    setManualUnitPrice('');
  };

  const handleProductSelect = (name) => {
    setF(prev => ({ ...prev, product: name }));
    setManualUnitPrice('');
  };

  const isFormValid = f.category && f.product && f.qty;

  // Build the common entry data object
  const buildEntryData = (extras = {}) => ({
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
    ...(fieldToggles.unit && { unit: unitField }),
    ...(fieldToggles.tax && { tax: Number(taxPercent) || 0, taxAmount }),
    ...(fieldToggles.notes && notesField && { notes: notesField }),
    ...extras,
  });

  const resetForm = () => {
    setF({ ...f, product: '', qty: '' });
    setDiscount('');
    setManualUnitPrice('');
    setTaxPercent('');
    setNotesField('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!isFormValid) {
      showToast('Please fill all required fields', 'error'); return;
    }

    if (paymentMethod === 'credit') {
      // Open credit modal instead of saving immediately
      setCreditModal({ open: true, customerName: '', creditAmount: String(netTotal.toFixed(2)), dueDate: '' });
      return;
    }

    // Cash — save immediately
    try {
      await addEntry(buildEntryData({ status: 'paid' }));
      showToast('Bill created successfully!');
      resetForm();
    } catch {
      showToast('Error processing bill', 'error');
    }
  };

  const submitCredit = async () => {
    if (!creditModal.customerName.trim()) {
      showToast('Customer name is required', 'error'); return;
    }
    try {
      await addEntry(buildEntryData({
        status: 'unpaid',
        credit: {
          customerName: creditModal.customerName.trim(),
          creditAmount: Number(creditModal.creditAmount) || netTotal,
          dueDate: creditModal.dueDate || null,
        },
      }));
      showToast('Credit bill recorded!');
      setCreditModal({ open: false, customerName: '', creditAmount: '', dueDate: '' });
      resetForm();
    } catch {
      showToast('Error processing credit bill', 'error');
    }
  };

  const todayEntries = entries.filter(e => e.date === todayISO);
  const todayRev = todayEntries.reduce((s, e) => s + e.revenue, 0);
  const todaySales = todayEntries.length;

  const inputCls = "w-full glass text-gray-800 dark:text-white px-4 py-3 text-sm outline-none focus:border-primary-500 transition-all";
  const labelCls = "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide";

  const fieldOptions = [
    { key: 'unitPrice', label: 'Unit Price' },
    { key: 'unit', label: 'Unit (kg, pcs, box)' },
    { key: 'tax', label: 'Tax (%)' },
    { key: 'notes', label: 'Notes' },
  ];

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
            {/* Header with customize button */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-5">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white font-heading flex items-center gap-2">
                <ClipboardList size={20} className="text-primary-500" /> New Bill
              </h3>
              <div className="relative">
                <button
                  ref={btnRef}
                  type="button"
                  onClick={() => setPanelOpen(prev => !prev)}
                  className={`p-2 rounded-lg transition-all duration-200 ${panelOpen ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'}`}
                  title="Customize Fields"
                >
                  <Settings2 size={18} />
                </button>

                {/* Customize Fields Panel */}
                {panelOpen && (
                  <div
                    ref={panelRef}
                    className="absolute right-0 top-full mt-2 w-64 glass-opaque p-4 animate-fadeIn origin-top-right z-50"
                  >
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-3">Customize Fields</h4>
                    <div className="space-y-3">
                      {fieldOptions.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
                          <button
                            type="button"
                            onClick={() => toggleField(key)}
                            className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${fieldToggles[key] ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                          >
                            <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${fieldToggles[key] ? 'left-[20px]' : 'left-[2px]'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3 leading-tight">Preferences are saved automatically for your business.</p>
                  </div>
                )}
              </div>
            </div>

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

              {/* Optional Fields (toggled) */}
              {(fieldToggles.unitPrice || fieldToggles.unit) && (
                <div className={`grid gap-4 ${fieldToggles.unitPrice && fieldToggles.unit ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {fieldToggles.unitPrice && (
                    <div>
                      <label className={labelCls}>Unit Price ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={manualUnitPrice}
                        onChange={e => setManualUnitPrice(e.target.value)}
                        className={inputCls}
                        placeholder={selectedProduct?.price ? `Default: ${selectedProduct.price}` : '0.00'}
                      />
                    </div>
                  )}
                  {fieldToggles.unit && (
                    <div>
                      <label className={labelCls}>Unit</label>
                      <select
                        value={unitField}
                        onChange={e => setUnitField(e.target.value)}
                        className={inputCls}
                      >
                        <option value="pcs">Pieces (pcs)</option>
                        <option value="kg">Kilograms (kg)</option>
                        <option value="liters">Liters</option>
                        <option value="boxes">Boxes</option>
                        <option value="meters">Meters</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {fieldToggles.tax && (
                <div>
                  <label className={labelCls}>Tax (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={taxPercent}
                    onChange={e => setTaxPercent(e.target.value)}
                    className={inputCls}
                    placeholder="0"
                  />
                </div>
              )}

              {fieldToggles.notes && (
                <div>
                  <label className={labelCls}>Notes</label>
                  <input
                    type="text"
                    value={notesField}
                    onChange={e => setNotesField(e.target.value)}
                    className={inputCls}
                    placeholder="Add a note to this bill..."
                  />
                </div>
              )}

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
                <div>
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Net Total</span>
                  {fieldToggles.tax && taxAmount > 0 && (
                    <p className="text-[10px] text-gray-400 mt-0.5">incl. tax ${taxAmount.toFixed(2)}</p>
                  )}
                </div>
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

          {/* Credit Modal */}
          {creditModal.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
              <div className="glass-opaque w-full max-w-md shadow-2xl p-6 scale-95 animate-[scaleIn_0.2s_ease-out_forwards]">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white font-heading">Credit Details</h3>
                  <button onClick={() => setCreditModal(prev => ({ ...prev, open: false }))} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Customer Name *</label>
                    <input
                      type="text"
                      autoFocus
                      value={creditModal.customerName}
                      onChange={e => setCreditModal(prev => ({ ...prev, customerName: e.target.value }))}
                      className={inputCls}
                      placeholder="Enter customer name"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Credit Amount ($)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={creditModal.creditAmount}
                      onChange={e => setCreditModal(prev => ({ ...prev, creditAmount: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Due Date (optional)</label>
                    <input
                      type="date"
                      value={creditModal.dueDate}
                      onChange={e => setCreditModal(prev => ({ ...prev, dueDate: e.target.value }))}
                      className={inputCls}
                    />
                  </div>

                  <div className="p-3 glass !border-primary-500/20 flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bill Total</span>
                    <span className="text-lg font-bold text-primary-600 dark:text-primary-400">${netTotal.toFixed(2)}</span>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCreditModal(prev => ({ ...prev, open: false }))}
                      className="flex-1 py-3 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitCredit}
                      className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20"
                    >
                      Confirm Credit
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5">Qty: {f.qty || 0} × ${effectiveUnitPrice.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-700 dark:text-gray-300">${total.toFixed(2)}</p>
                  </div>
                </div>
                {fieldToggles.tax && taxAmount > 0 && (
                  <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
                    <p>Tax ({taxPercent}%)</p>
                    <p>+${taxAmount.toFixed(2)}</p>
                  </div>
                )}
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
