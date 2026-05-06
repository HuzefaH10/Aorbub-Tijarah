import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, SummaryCard } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { useProducts, useBills, useSettings } from '../hooks/useFirestore';
import { ClipboardList, ShoppingCart, DollarSign, Settings2, X, Plus, Trash2, ChevronDown } from 'lucide-react';

const DEFAULT_FIELDS = { unitPrice: false, unit: false, tax: false, notes: false };

export default function DataEntry() {
  const { products } = useProducts();
  const { bills, addBill } = useBills();
  const { settings, updateSettings } = useSettings();
  const { toast, showToast, hideToast } = useToast();

  const todayISO = new Date().toISOString().split('T')[0];
  const todayDisplay = new Date().toLocaleDateString('en-GB');

  // Current item being configured
  const [f, setF] = useState({ category: '', product: '', qty: '' });
  // Accumulated bill items
  const [billItems, setBillItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [discountType, setDiscountType] = useState('$');

  // Optional field values (per-item)
  const [manualUnitPrice, setManualUnitPrice] = useState('');
  const [unitField, setUnitField] = useState('pcs');
  const [taxPercent, setTaxPercent] = useState('');
  const [notesField, setNotesField] = useState('');

  // Toggles & panels
  const [fieldToggles, setFieldToggles] = useState(DEFAULT_FIELDS);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);
  const [creditModal, setCreditModal] = useState({ open: false, customerName: '', creditAmount: '', dueDate: '' });

  useEffect(() => {
    if (settings?.billingFields) setFieldToggles(prev => ({ ...prev, ...settings.billingFields }));
  }, [settings]);

  useEffect(() => {
    const handler = (e) => {
      if (panelOpen && panelRef.current && !panelRef.current.contains(e.target) && !btnRef.current.contains(e.target)) setPanelOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const toggleField = async (key) => {
    const updated = { ...fieldToggles, [key]: !fieldToggles[key] };
    setFieldToggles(updated);
    try { await updateSettings({ billingFields: updated }); } catch {}
  };

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    cats.sort((a, b) => a.localeCompare(b));
    return cats;
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!f.category) return [];
    return products.filter(p => p.category === f.category);
  }, [products, f.category]);

  const selectedProduct = products.find(p => p.name === f.product);
  const effectiveUnitPrice = fieldToggles.unitPrice && manualUnitPrice !== ''
    ? Number(manualUnitPrice) : Number(selectedProduct?.price) || 0;
  const currentItemTotal = (Number(f.qty) || 0) * effectiveUnitPrice;

  // Bill-level calculations
  const subtotal = billItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = fieldToggles.tax ? (subtotal * (Number(taxPercent) || 0)) / 100 : 0;
  const subtotalAfterTax = subtotal + taxAmount;
  const discountAmount = discountType === '%'
    ? (subtotalAfterTax * (Number(discount) || 0)) / 100
    : Number(discount) || 0;
  const netTotal = Math.max(0, subtotalAfterTax - discountAmount);

  const handleCategorySelect = (cat) => {
    setF(prev => ({ ...prev, category: cat, product: '', qty: '' }));
    setManualUnitPrice('');
  };
  const handleProductSelect = (name) => {
    setF(prev => ({ ...prev, product: name }));
    setManualUnitPrice('');
  };

  const canAddItem = f.category && f.product && f.qty && Number(f.qty) > 0;

  const addItem = () => {
    if (!canAddItem) return;
    const item = {
      id: Date.now(),
      productId: selectedProduct?.id || '',
      productName: f.product,
      category: f.category,
      quantity: Number(f.qty),
      unitPrice: effectiveUnitPrice,
      total: currentItemTotal,
      ...(fieldToggles.unit && { unit: unitField }),
    };
    setBillItems(prev => [...prev, item]);
    setF({ ...f, product: '', qty: '' });
    setManualUnitPrice('');
  };

  const removeItem = (id) => setBillItems(prev => prev.filter(i => i.id !== id));

  const buildBillDoc = (extras = {}) => ({
    date: todayISO,
    items: billItems.map(({ id, ...rest }) => rest),
    subtotal,
    discount: { type: discountType === '%' ? 'percent' : 'flat', value: Number(discount) || 0 },
    netTotal,
    paymentMethod,
    ...(fieldToggles.tax && { tax: Number(taxPercent) || 0, taxAmount }),
    ...(fieldToggles.notes && notesField && { notes: notesField }),
    ...extras,
  });

  const resetAll = () => {
    setBillItems([]);
    setF({ category: '', product: '', qty: '' });
    setDiscount('');
    setManualUnitPrice('');
    setTaxPercent('');
    setNotesField('');
  };

  const checkout = async (e) => {
    e.preventDefault();
    if (billItems.length === 0) { showToast('Add at least one item', 'error'); return; }
    if (paymentMethod === 'credit') {
      setCreditModal({ open: true, customerName: '', creditAmount: String(netTotal.toFixed(2)), dueDate: '' });
      return;
    }
    try {
      await addBill(buildBillDoc({ status: 'paid' }));
      showToast('Bill created successfully!');
      resetAll();
    } catch { showToast('Error processing bill', 'error'); }
  };

  const submitCredit = async () => {
    if (!creditModal.customerName.trim()) { showToast('Customer name is required', 'error'); return; }
    try {
      await addBill(buildBillDoc({
        status: 'unpaid',
        credit: {
          customerName: creditModal.customerName.trim(),
          creditAmount: Number(creditModal.creditAmount) || netTotal,
          dueDate: creditModal.dueDate || null,
        },
      }));
      showToast('Credit bill recorded!');
      setCreditModal({ open: false, customerName: '', creditAmount: '', dueDate: '' });
      resetAll();
    } catch { showToast('Error processing credit bill', 'error'); }
  };

  const todayBills = bills.filter(b => b.date === todayISO);
  const todaySales = todayBills.length;
  const todayPaidRev = todayBills.filter(b => b.status === 'paid').reduce((s, b) => s + (b.netTotal || 0), 0);
  const todayCashRev = todayBills.filter(b => b.paymentMethod === 'cash' && b.status === 'paid').reduce((s, b) => s + (b.netTotal || 0), 0);
  const todayCreditRev = todayBills.filter(b => b.paymentMethod === 'credit').reduce((s, b) => s + (b.netTotal || 0), 0);
  const todayTotalRev = todayPaidRev + todayCreditRev;

  const [billsExpanded, setBillsExpanded] = useState(false);
  const [revenueExpanded, setRevenueExpanded] = useState(false);

  const inputCls = "w-full glass text-gray-800 dark:text-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 transition-all rounded-xl";
  const labelCls = "block text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider";
  const fieldOptions = [
    { key: 'unitPrice', label: 'Unit Price' },
    { key: 'unit', label: 'Unit (kg, pcs, box)' },
    { key: 'tax', label: 'Tax (%)' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div className="w-full space-y-6 px-6 pb-6 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800/60 pb-3 mb-1">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Stock Entry</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create and confirm customer bills in real time.</p>
        </div>
        <div className="text-left md:text-right">
          <span className="inline-block text-[11px] font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/5 px-2.5 py-1 rounded-full border border-gray-200/20 dark:border-white/5">
            Last updated: 6 May 2026
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 justify-between">
        {/* Left Column: Billing Form (62%) */}
        <div className="w-full lg:w-[62%] space-y-5">
          <Card className="!p-5">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading flex items-center gap-2">
                <ClipboardList size={18} className="text-primary-500" /> New Bill
              </h3>
              <div className="relative">
                <button ref={btnRef} type="button" onClick={() => setPanelOpen(prev => !prev)}
                  className={`p-2 rounded-lg transition-all duration-200 ${panelOpen ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'}`}
                  title="Customize Fields">
                  <Settings2 size={18} />
                </button>
                {panelOpen && (
                  <div ref={panelRef} className="absolute right-0 top-full mt-2 w-64 glass-opaque p-4 animate-fadeIn origin-top-right z-50">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-3">Customize Fields</h4>
                    <div className="space-y-3">
                      {fieldOptions.map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
                          <button type="button" onClick={() => toggleField(key)}
                            className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 ${fieldToggles[key] ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                            <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200 ${fieldToggles[key] ? 'left-[20px]' : 'left-[2px]'}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3 leading-tight">Preferences are saved automatically.</p>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={checkout} className="space-y-3">
              {/* Date */}
              <div>
                <label className={labelCls}>Date</label>
                <input type="text" readOnly value={todayDisplay} className={`${inputCls} bg-gray-50/50 dark:bg-gray-900/50 cursor-not-allowed opacity-60`} />
              </div>

              {/* Category + Product + QT side by side */}
              <div className="flex gap-3 items-end">
                <div className="w-1/2">
                  <label className={labelCls}>Category</label>
                  <select value={f.category} onChange={e => handleCategorySelect(e.target.value)} className={inputCls}>
                    <option value="" disabled>Select category...</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="w-[43%] flex gap-2 items-end">
                  <div className="flex-1">
                    <label className={labelCls}>Product</label>
                    <select value={f.product} onChange={e => handleProductSelect(e.target.value)} className={inputCls} disabled={!f.category}>
                      <option value="" disabled>{f.category ? 'Select product...' : 'Category first'}</option>
                      {filteredProducts.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="w-[7%] min-w-[56px] shrink-0">
                  <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider text-center">QT</label>
                  <input type="number" min="1" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })}
                    className={`${inputCls} text-center !px-1`} placeholder="0" disabled={!f.product} />
                </div>
                <button type="button" onClick={addItem} disabled={!canAddItem}
                  className="shrink-0 p-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-primary-600/20"
                  title="Add item to bill">
                  <Plus size={18} />
                </button>
              </div>
              {categories.length === 0 && <p className="text-xs text-amber-500">No categories found. Add products in Inventory first.</p>}

              {/* Optional Fields Grid Layout */}
              {(() => {
                const activeGridFields = [];
                if (fieldToggles.unitPrice) activeGridFields.push('unitPrice');
                if (fieldToggles.unit) activeGridFields.push('unit');
                if (fieldToggles.tax) activeGridFields.push('tax');

                if (activeGridFields.length === 0) return null;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                    {activeGridFields.map((key, index) => {
                      const isFullWidth = activeGridFields.length === 1 || (activeGridFields.length === 3 && index === 2);
                      const colCls = isFullWidth ? 'col-span-1 md:col-span-2' : 'col-span-1';

                      if (key === 'unitPrice') {
                        return (
                          <div key="unitPrice" className={colCls}>
                            <label className={labelCls}>Unit Price ($)</label>
                            <input type="number" min="0" step="0.01" value={manualUnitPrice} onChange={e => setManualUnitPrice(e.target.value)}
                              className={inputCls} placeholder={selectedProduct?.price ? `Default: ${selectedProduct.price}` : '0.00'} />
                          </div>
                        );
                      }
                      if (key === 'unit') {
                        return (
                          <div key="unit" className={colCls}>
                            <label className={labelCls}>Unit</label>
                            <select value={unitField} onChange={e => setUnitField(e.target.value)} className={inputCls}>
                              <option value="pcs">Pieces (pcs)</option><option value="kg">Kilograms (kg)</option>
                              <option value="liters">Liters</option><option value="boxes">Boxes</option><option value="meters">Meters</option>
                            </select>
                          </div>
                        );
                      }
                      if (key === 'tax') {
                        return (
                          <div key="tax" className={colCls}>
                            <label className={labelCls}>Tax (%)</label>
                            <input type="number" min="0" max="100" step="0.01" value={taxPercent} onChange={e => setTaxPercent(e.target.value)} className={inputCls} placeholder="0" />
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                );
              })()}

              {fieldToggles.notes && (
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea value={notesField} onChange={e => setNotesField(e.target.value)}
                    className={`${inputCls} h-16 resize-none`} placeholder="Add a note to this bill..." />
                </div>
              )}

              {/* Discount + Net Total side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Discount</label>
                  <div className="flex gap-0">
                    <input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)}
                      className={`${inputCls} !rounded-r-none h-[38px]`} placeholder="0" />
                    <button type="button" onClick={() => setDiscountType(prev => prev === '$' ? '%' : '$')}
                      className="px-3 glass !rounded-l-none !rounded-r-xl !border-l-0 text-sm font-bold text-primary-500 hover:text-primary-400 transition-colors shrink-0 min-w-[40px] h-[38px]">
                      {discountType}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Net Total</label>
                  <div className="glass !border-primary-500/30 px-3.5 rounded-xl flex items-center justify-between h-[38px]">
                    <span className="text-base font-bold text-primary-600 dark:text-primary-400 font-heading">${netTotal.toFixed(2)}</span>
                    {fieldToggles.tax && taxAmount > 0 && <span className="text-[9px] text-gray-400 font-medium tracking-wide">+tax ${taxAmount.toFixed(2)}</span>}
                  </div>
                </div>
              </div>

              {/* Payment Method — segmented control */}
              <div>
                <label className={labelCls}>Payment Method</label>
                <div className="flex glass !p-1 rounded-xl h-[38px] items-center">
                  {['cash', 'credit'].map(m => (
                    <button key={m} type="button" onClick={() => setPaymentMethod(m)}
                      className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all duration-200 capitalize ${
                        paymentMethod === m ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}>{m}</button>
                  ))}
                </div>
              </div>

              {/* Checkout */}
              <div className="pt-3">
                <button type="submit" disabled={billItems.length === 0}
                  className="w-full bg-primary-600 text-white h-11 rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-600">
                  Checkout ({billItems.length} item{billItems.length !== 1 ? 's' : ''})
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
                  <button onClick={() => setCreditModal(p => ({ ...p, open: false }))} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"><X size={18} /></button>
                </div>
                <div className="space-y-4">
                  <div><label className={labelCls}>Customer Name *</label>
                    <input type="text" autoFocus value={creditModal.customerName} onChange={e => setCreditModal(p => ({ ...p, customerName: e.target.value }))} className={inputCls} placeholder="Enter customer name" /></div>
                  <div><label className={labelCls}>Credit Amount ($)</label>
                    <input type="number" min="0" step="0.01" value={creditModal.creditAmount} onChange={e => setCreditModal(p => ({ ...p, creditAmount: e.target.value }))} className={inputCls} /></div>
                  <div><label className={labelCls}>Due Date (optional)</label>
                    <input type="date" value={creditModal.dueDate} onChange={e => setCreditModal(p => ({ ...p, dueDate: e.target.value }))} className={inputCls} /></div>
                  <div className="p-3 glass !border-primary-500/20 flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bill Total</span>
                    <span className="text-lg font-bold text-primary-600 dark:text-primary-400">${netTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setCreditModal(p => ({ ...p, open: false }))}
                      className="flex-1 py-3 border border-gray-200 dark:border-white/10 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
                    <button type="button" onClick={submitCredit}
                      className="flex-1 py-3 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">Confirm Credit</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Order Summary & Stats (33%) */}
        <div className="w-full lg:w-[33%] lg:ml-auto space-y-4">
          <Card className="border border-primary-500/20">
            <h3 className="font-bold text-gray-800 dark:text-white border-b border-gray-100 dark:border-gray-800 pb-3 mb-3">Order Summary</h3>
            {billItems.length > 0 ? (
              <div className="space-y-3">
                {billItems.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm group">
                    <div className="flex-1 pr-2">
                      <p className="font-semibold text-gray-800 dark:text-white line-clamp-1">{item.productName}</p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">QT: {item.quantity} × ${item.unitPrice.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-700 dark:text-gray-300">${item.total.toFixed(2)}</p>
                      <button type="button" onClick={() => removeItem(item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-500 transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}

                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
                  </div>
                  {fieldToggles.tax && taxAmount > 0 && (
                    <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                      <span>Tax ({taxPercent}%)</span><span>+${taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-red-500">
                      <span>Discount ({discountType === '%' ? `${discount}%` : `$${discount}`})</span>
                      <span>-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                  <p className="font-bold text-gray-800 dark:text-white">Net Total</p>
                  <p className="font-bold text-primary-600 dark:text-primary-400 text-lg">${netTotal.toFixed(2)}</p>
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Payment</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 capitalize">{paymentMethod}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic py-2">No items added yet</p>
            )}
          </Card>

          {/* Bills Today — Collapsible */}
          <Card>
            <button type="button" onClick={() => setBillsExpanded(p => !p)} className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary-600/10"><ShoppingCart size={18} className="text-primary-500" /></div>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Bills Today</span>
              </div>
              <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${billsExpanded ? 'rotate-180' : ''}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-200 ease-in-out ${billsExpanded ? 'max-h-40 mt-4' : 'max-h-0'}`}>
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                <p className="text-3xl font-bold text-gray-800 dark:text-white font-heading">{todaySales}</p>
                <p className="text-xs text-gray-500 mt-1">bill{todaySales !== 1 ? 's' : ''} created today</p>
              </div>
            </div>
          </Card>

          {/* Revenue Today — Collapsible */}
          <Card>
            <button type="button" onClick={() => setRevenueExpanded(p => !p)} className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary-600/10"><DollarSign size={18} className="text-primary-500" /></div>
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Revenue Today</span>
              </div>
              <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${revenueExpanded ? 'rotate-180' : ''}`} />
            </button>
            <div className={`overflow-hidden transition-all duration-200 ease-in-out ${revenueExpanded ? 'max-h-40 mt-4' : 'max-h-0'}`}>
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                <p className="text-3xl font-bold text-primary-600 dark:text-primary-400 font-heading">${todayTotalRev.toLocaleString()}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Cash</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">${todayCashRev.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Credit</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">${todayCreditRev.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
