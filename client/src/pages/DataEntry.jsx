import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, SummaryCard } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { useProducts, useBills, useSettings, useEvents } from '../hooks/useFirestore';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useRole } from '../hooks/useRole';
import { usePageGuard } from '../hooks/usePageGuard';
import { writeAuditLog } from '../hooks/useAuditLog';
import { todayISO as getTodayISO, todayDisplay as getTodayDisplay } from '../utils/dateUtils';
import { ClipboardList, ShoppingCart, DollarSign, Settings2, X, Plus, Trash2, ChevronDown, Pencil, FileText } from 'lucide-react';
import InvoiceModal from '../components/invoice/InvoiceModal';

const DEFAULT_FIELDS = { unitPrice: false, tax: false, notes: false };

export default function DataEntry() {
  // Guard: only stock_entry role can access
  usePageGuard('stock_entry');

  const { products } = useProducts();
  const { bills, addBill } = useBills();
  const { settings, updateSettings } = useSettings();
  const { addEvent } = useEvents();
  const { toast, showToast, hideToast } = useToast();
  const { user } = useAuth();
  const { timezone, billDefaults, activeBusinessId, notificationPrefs } = useBusiness();
  const { role } = useRole();
  const navigate = useNavigate();

  // Invoice state
  const [invoiceState, setInvoiceState] = useState({ bill: null, showPrompt: false, showModal: false });

  const todayISO = getTodayISO(timezone);
  const todayDisplay = getTodayDisplay(timezone);

  // Multi-product accordion slots
  const makeSlot = () => ({ id: Date.now(), category: '', product: '', unit: 'pcs', qty: '', manualUnitPrice: '', collapsed: false });
  const [slots, setSlots] = useState([makeSlot()]);
  const [activeSlotIdx, setActiveSlotIdx] = useState(0);

  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [discountType, setDiscountType] = useState('$');

  // Optional field values (bill-level)
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

  // Pre-fill bill defaults from BusinessContext
  useEffect(() => {
    if (!billDefaults) return;
    if (billDefaults.defaultPaymentMethod) setPaymentMethod(billDefaults.defaultPaymentMethod);
    if (billDefaults.defaultDiscount !== undefined && billDefaults.defaultDiscount !== '') setDiscount(String(billDefaults.defaultDiscount));
    if (billDefaults.defaultDiscountType) setDiscountType(billDefaults.defaultDiscountType);
  }, [billDefaults]);

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
    let cats = [...new Set(products.map(p => p.category).filter(Boolean))];
    if (products.some(p => !p.category || p.category.toLowerCase() === 'uncategorized')) {
      cats.push('Uncategorized');
    }
    cats = [...new Set(cats.map(c => c.toLowerCase() === 'uncategorized' ? 'Uncategorized' : c))];
    cats.sort((a, b) => a.localeCompare(b));
    return cats;
  }, [products]);

  const hasCategories = categories.length > 0 && !(categories.length === 1 && categories[0] === 'Uncategorized');

  // Helpers scoped to a slot
  const getFilteredProducts = (cat) => {
    if (!hasCategories) return products;
    if (cat === 'Uncategorized') return products.filter(p => !p.category || p.category.toLowerCase() === 'uncategorized');
    return cat ? products.filter(p => p.category === cat) : [];
  };
  const getSelectedProduct = (name) => products.find(p => p.name === name);

  const updateSlot = (idx, patch) => setSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));

  // Confirmed items = collapsed slots with valid data
  const confirmedSlots = slots.filter(s => s.collapsed && (!hasCategories || s.category) && s.product && Number(s.qty) > 0);
  const billItems = confirmedSlots.map(s => {
    const prod = getSelectedProduct(s.product);
    const price = fieldToggles.unitPrice && s.manualUnitPrice !== '' 
      ? Number(s.manualUnitPrice) 
      : (Number(prod?.price) || 0);
    return {
      id: s.id,
      productId: prod?.id || '',
      productName: s.product,
      category: s.category,
      quantity: Number(s.qty),
      unitPrice: price,
      unit: s.unit,
      total: Number(s.qty) * price,
    };
  });

  // Bill-level calculations
  const subtotal = billItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = fieldToggles.tax ? (subtotal * (Number(taxPercent) || 0)) / 100 : 0;
  const subtotalAfterTax = subtotal + taxAmount;
  const discountAmount = discountType === '%'
    ? (subtotalAfterTax * (Number(discount) || 0)) / 100
    : Number(discount) || 0;
  const netTotal = Math.max(0, subtotalAfterTax - discountAmount);

  // Collapse current slot (confirm it) and open a new one
  const confirmAndAddSlot = () => {
    const slot = slots[activeSlotIdx];
    if (!slot || (hasCategories && !slot.category) || !slot.product || !Number(slot.qty)) return;
    updateSlot(activeSlotIdx, { collapsed: true });
    const newSlot = makeSlot();
    setSlots(prev => [...prev, newSlot]);
    setActiveSlotIdx(slots.length);
  };

  // Expand a collapsed slot for editing
  const expandSlot = (idx) => {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, collapsed: false } : s));
    setActiveSlotIdx(idx);
  };

  // Remove a slot
  const removeSlot = (idx) => {
    if (slots.length <= 1) {
      setSlots([makeSlot()]);
      setActiveSlotIdx(0);
      return;
    }
    setSlots(prev => prev.filter((_, i) => i !== idx));
    if (activeSlotIdx >= idx && activeSlotIdx > 0) setActiveSlotIdx(prev => prev - 1);
  };

  const canConfirmSlot = (slot) => slot && (!hasCategories || slot.category) && slot.product && slot.qty && Number(slot.qty) > 0;

  const removeItem = (id) => {
    const idx = slots.findIndex(s => s.id === id);
    if (idx !== -1) removeSlot(idx);
  };

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
    setSlots([makeSlot()]);
    setActiveSlotIdx(0);
    setDiscount('');
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
      const savedBill = buildBillDoc({ status: 'paid' });
      await addBill(savedBill);
      writeAuditLog(user, role, 'Bill created', `${billItems.length} item(s), total $${netTotal.toFixed(2)}, ${paymentMethod}`, null, activeBusinessId);
      showToast('Bill saved!');
      setInvoiceState({ bill: savedBill, showPrompt: true, showModal: false });
      resetAll();
    } catch { showToast('Error processing bill', 'error'); }
  };

  const submitCredit = async () => {
    if (!creditModal.customerName.trim()) { showToast('Customer name is required', 'error'); return; }
    try {
      const creditBill = buildBillDoc({
        status: 'unpaid',
        credit: {
          customerName: creditModal.customerName.trim(),
          creditAmount: Number(creditModal.creditAmount) || netTotal,
          dueDate: creditModal.dueDate || null,
        },
      });
      const billRef = await addBill(creditBill);
      // Auto-create credit_due event if a due date was set
      if (creditModal.dueDate) {
        try {
          await addEvent(null, {
            title: `Credit due — ${creditModal.customerName.trim()}`,
            type: 'credit_due',
            date: creditModal.dueDate,
            status: 'pending',
            recurring: { enabled: false, frequency: null },
            linkedBillId: billRef?.id || null,
            linkedProductId: null,
            note: `Amount: $${(Number(creditModal.creditAmount) || netTotal).toFixed(2)}`,
          });
        } catch { /* silent */ }
      }
      showToast('Credit bill recorded!');
      writeAuditLog(user, role, 'Bill created', `Credit bill — ${creditModal.customerName}, $${netTotal.toFixed(2)}`, creditModal.customerName, activeBusinessId);
      setCreditModal({ open: false, customerName: '', creditAmount: '', dueDate: '' });
      setInvoiceState({ bill: creditBill, showPrompt: true, showModal: false });
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
    { key: 'tax', label: 'Tax (%)' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <div className="w-full space-y-6 px-6 pb-6 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* Invoice Prompt Banner */}
      {invoiceState.showPrompt && invoiceState.bill && (
        <div className="flex items-center justify-between gap-4 px-5 py-3 bg-green-500/10 border border-green-500/30 rounded-xl animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-green-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-400">Bill saved successfully!</p>
              <p className="text-xs text-gray-400">Would you like to generate an invoice?</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setInvoiceState(prev => ({ ...prev, showModal: true, showPrompt: false }))}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <FileText size={13} /> View Invoice
            </button>
            <button
              onClick={() => setInvoiceState({ bill: null, showPrompt: false, showModal: false })}
              className="px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg text-xs font-bold transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {invoiceState.showModal && invoiceState.bill && (
        <InvoiceModal
          bill={invoiceState.bill}
          businessData={businessData}
          currency={currency}
          timezone={timezone}
          onClose={() => setInvoiceState({ bill: null, showPrompt: false, showModal: false })}
        />
      )}

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

              {/* Accordion Product Slots */}
              {slots.map((slot, idx) => {
                const filteredProds = getFilteredProducts(slot.category);
                const selectedProd = getSelectedProduct(slot.product);

                // Collapsed bar
                if (slot.collapsed) {
                  return (
                    <div key={slot.id} className="flex items-center justify-between h-[44px] px-4 glass rounded-xl cursor-pointer group hover:border-primary-500/40 transition-colors"
                      onClick={() => expandSlot(idx)}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-gray-800 dark:text-white truncate">{slot.product}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">QT: {slot.qty} {slot.unit}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); removeSlot(idx); }}
                          className="p-1 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); expandSlot(idx); }}
                          className="p-1 text-gray-400 hover:text-primary-500 transition-colors"><Pencil size={14} /></button>
                        <ChevronDown size={16} className="text-gray-400" />
                      </div>
                    </div>
                  );
                }

                // Expanded slot (only the active one)
                return (
                  <div key={slot.id} className="space-y-3 p-3 glass rounded-xl border-primary-500/20">
                    {slots.filter(s => !s.collapsed).length > 1 && idx !== activeSlotIdx && (
                      <div className="text-[10px] text-gray-400 text-center cursor-pointer" onClick={() => setActiveSlotIdx(idx)}>Click to edit this slot</div>
                    )}
                    {/* Category + Product side by side */}
                    <div className="flex gap-3">
                      {hasCategories && (
                        <div className="w-1/2">
                          <label className={labelCls}>Category</label>
                          <select value={slot.category} onChange={e => { updateSlot(idx, { category: e.target.value, product: '', qty: '' }); setActiveSlotIdx(idx); }} className={inputCls}>
                            <option value="" disabled>Select category...</option>
                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      )}
                      <div className={hasCategories ? "w-1/2" : "w-full"}>
                        <label className={labelCls}>Product</label>
                        <select value={slot.product} onChange={e => { updateSlot(idx, { product: e.target.value }); setActiveSlotIdx(idx); }} className={inputCls} disabled={hasCategories && !slot.category}>
                          <option value="" disabled>{hasCategories && !slot.category ? 'Category first' : 'Select product...'}</option>
                          {filteredProds.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {/* Unit + QT side by side */}
                    <div className="flex gap-3">
                      <div className="w-1/2">
                        <label className={labelCls}>Unit</label>
                        <select value={slot.unit} onChange={e => updateSlot(idx, { unit: e.target.value })} className={inputCls}>
                          <option value="pcs">Pieces (pcs)</option><option value="kg">Kilograms (kg)</option>
                          <option value="liters">Liters</option><option value="boxes">Boxes</option><option value="meters">Meters</option>
                          <option value="dozen">Dozen</option><option value="pairs">Pairs</option><option value="sets">Sets</option>
                        </select>
                      </div>
                      <div className="w-1/2">
                        <label className={labelCls}>QT</label>
                        <input type="number" min="1" value={slot.qty} onChange={e => { updateSlot(idx, { qty: e.target.value }); setActiveSlotIdx(idx); }}
                          className={`${inputCls} text-center`} placeholder="0" disabled={!slot.product} />
                      </div>
                    </div>
                    
                    {/* Unit Price Override (if toggled) */}
                    {fieldToggles.unitPrice && (
                      <div>
                        <label className={labelCls}>Unit Price ($)</label>
                        <input type="number" min="0" step="0.01" value={slot.manualUnitPrice} onChange={e => updateSlot(idx, { manualUnitPrice: e.target.value })}
                          className={inputCls} placeholder={selectedProd?.price ? `Default: ${selectedProd.price}` : '0.00'} />
                      </div>
                    )}

                    {selectedProd && slot.qty && Number(slot.qty) > 0 && (
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="text-gray-400">@ ${Number(fieldToggles.unitPrice && slot.manualUnitPrice !== '' ? slot.manualUnitPrice : (selectedProd.price || 0)).toFixed(2)} each</span>
                        <span className="font-bold text-primary-600 dark:text-primary-400">${(Number(slot.qty) * Number(fieldToggles.unitPrice && slot.manualUnitPrice !== '' ? slot.manualUnitPrice : (selectedProd.price || 0))).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* + Add Product button */}
              {(() => {
                const currentSlot = slots[activeSlotIdx];
                const hasOpenSlot = slots.some(s => !s.collapsed);
                if (!hasOpenSlot || !canConfirmSlot(currentSlot)) return null;
                return (
                  <button type="button" onClick={confirmAndAddSlot}
                    className="w-full h-[44px] flex items-center justify-center gap-2 border-2 border-dashed border-primary-400/40 dark:border-primary-500/30 text-primary-600 dark:text-primary-400 rounded-xl text-sm font-bold hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-all">
                    <Plus size={16} /> Add Product
                  </button>
                );
              })()}

              {products.length === 0 && <p className="text-xs text-amber-500">No products found. Add products in Inventory first.</p>}

              {/* Optional Fields Grid Layout (Bill Level) */}
              {(() => {
                const activeGridFields = [];
                if (fieldToggles.tax) activeGridFields.push('tax');

                if (activeGridFields.length === 0) return null;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                    {activeGridFields.map((key) => {
                      const colCls = activeGridFields.length === 1 ? 'col-span-1 md:col-span-2' : 'col-span-1';

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
                <div className="flex gap-2 h-[52px]">
                  {['cash', 'credit'].map(m => (
                    <button 
                      key={m} 
                      type="button" 
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 rounded-xl text-[15px] font-semibold transition-all duration-200 capitalize border ${
                        paymentMethod === m 
                          ? 'bg-primary-600 text-white border-primary-600 shadow-lg shadow-primary-600/20' 
                          : 'bg-gray-50 dark:bg-black/20 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkout */}
              <div className="pt-3">
                <button type="submit" disabled={billItems.length === 0}
                  className="w-full bg-primary-600 text-white h-[52px] rounded-xl font-semibold text-[15px] hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary-600">
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
                      <p className="text-gray-500 dark:text-gray-400 text-xs">QT: {item.quantity} {item.unit || 'pcs'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-700 dark:text-gray-300">Net: ${item.total.toFixed(2)}</p>
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
                <button type="button" onClick={() => navigate('/bills?filter=today')} className="text-left group cursor-pointer w-full focus:outline-none">
                  <p className="text-3xl font-bold text-gray-800 dark:text-white font-heading group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{todaySales}</p>
                  <p className="text-xs text-gray-500 mt-1 group-hover:text-primary-500 transition-colors">bill{todaySales !== 1 ? 's' : ''} created today <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-1">→</span></p>
                </button>
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
