import { useState, useEffect, useMemo } from 'react';
import { useBusiness } from '../../context/BusinessContext';
import { useProducts } from '../../hooks/useFirestore';
import { useInvoices, useInvoiceCounter } from '../../hooks/useInvoices';
import { useAuth } from '../../context/AuthContext';
import { writeAuditLog } from '../../hooks/useAuditLog';
import { useRole } from '../../hooks/useRole';
import { todayISO } from '../../utils/dateUtils';
import { Plus, Trash2, Save, Eye, ArrowLeft } from 'lucide-react';
import InvoicePreviewModal from './InvoicePreviewModal';

const PAYMENT_METHODS = ['Cash', 'Card', 'Bank Transfer', 'Other'];

const emptyLine = () => ({ id: Date.now(), productName: '', quantity: 1, unitPrice: 0, total: 0 });

export default function InvoiceBuilder({ editInvoice, onBack, onSaved }) {
  const { user } = useAuth();
  const { role } = useRole();
  const { activeBusinessId, businessData, currency, timezone } = useBusiness();
  const { products } = useProducts();
  const { addInvoice, updateInvoice } = useInvoices();
  const { getNextInvoiceNumber } = useInvoiceCounter();

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayISO(timezone));
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [discountPercent, setDiscountPercent] = useState('');
  const [taxPercent, setTaxPercent] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [status, setStatus] = useState('Draft');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState('');

  // Load edit data or fetch next number
  useEffect(() => {
    if (editInvoice) {
      setInvoiceNumber(String(editInvoice.invoiceNumber || ''));
      setInvoiceDate(editInvoice.invoiceDate || todayISO(timezone));
      setCustomerName(editInvoice.customerName || '');
      setCustomerPhone(editInvoice.customerPhone || '');
      setCustomerEmail(editInvoice.customerEmail || '');
      setLines(editInvoice.items?.length ? editInvoice.items.map((it, i) => ({ ...it, id: Date.now() + i })) : [emptyLine()]);
      setDiscountPercent(editInvoice.discountPercent != null ? String(editInvoice.discountPercent) : '');
      setTaxPercent(editInvoice.taxPercent != null ? String(editInvoice.taxPercent) : '');
      setNotes(editInvoice.notes || '');
      setPaymentMethod(editInvoice.paymentMethod || 'Cash');
      setStatus(editInvoice.status || 'Draft');
    } else {
      getNextInvoiceNumber().then(n => setInvoiceNumber(String(n).padStart(4, '0')));
    }
  }, [editInvoice, timezone]);

  const updateLine = (id, field, value) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'productName') {
        const prod = products.find(p => p.name === value);
        if (prod) { updated.unitPrice = Number(prod.price) || 0; }
      }
      updated.total = (Number(updated.quantity) || 0) * (Number(updated.unitPrice) || 0);
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (id) => setLines(prev => prev.length <= 1 ? prev : prev.filter(l => l.id !== id));

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.total) || 0), 0), [lines]);
  const discountAmt = useMemo(() => subtotal * ((Number(discountPercent) || 0) / 100), [subtotal, discountPercent]);
  const taxableAmount = subtotal - discountAmt;
  const taxAmt = useMemo(() => taxableAmount * ((Number(taxPercent) || 0) / 100), [taxableAmount, taxPercent]);
  const grandTotal = taxableAmount + taxAmt;

  const businessName = businessData?.businessName || businessData?.name || 'My Business';
  const businessAddress = businessData?.address || '';
  const businessPhone = businessData?.phone || '';
  const businessEmail = businessData?.email || '';
  const logoURL = businessData?.logoURL || businessData?.logoUrl || null;

  const buildInvoiceDoc = () => ({
    invoiceNumber: Number(invoiceNumber) || 0,
    invoiceDate,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerEmail: customerEmail.trim(),
    items: lines.map(({ id, ...rest }) => rest),
    subtotal,
    discountPercent: Number(discountPercent) || 0,
    discountAmount: discountAmt,
    taxPercent: Number(taxPercent) || 0,
    taxAmount: taxAmt,
    grandTotal,
    notes: notes.trim(),
    paymentMethod,
    status,
    businessName,
    businessAddress,
    businessPhone,
    businessEmail,
    logoURL,
    currency: currency || 'USD',
  });

  const handleSave = async (saveStatus) => {
    setError('');
    if (lines.every(l => !l.productName)) { setError('Add at least one line item.'); return; }
    setSaving(true);
    try {
      const invoiceDoc = { ...buildInvoiceDoc(), status: saveStatus || status };
      if (editInvoice?.id) {
        await updateInvoice(editInvoice.id, invoiceDoc);
      } else {
        await addInvoice(invoiceDoc);
      }
      writeAuditLog(user, role, 'Invoice saved', `Invoice #${invoiceNumber}, ${currency} ${grandTotal.toFixed(2)}`, null, activeBusinessId);
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError('Failed to save invoice. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full glass text-gray-800 dark:text-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 transition-all rounded-xl";
  const labelCls = "block text-[11px] font-semibold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider";

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all"><ArrowLeft size={20} /></button>
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">{editInvoice ? 'Edit Invoice' : 'New Invoice'}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Invoice #{invoiceNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 px-4 py-2.5 border border-white/10 text-gray-300 rounded-xl text-sm font-bold hover:bg-white/5 transition-all">
            <Eye size={15} /> Preview
          </button>
          <button onClick={() => handleSave('Draft')} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 border border-primary-500/30 text-primary-400 rounded-xl text-sm font-bold hover:bg-primary-500/10 transition-all disabled:opacity-50">
            <Save size={15} /> Save Draft
          </button>
          <button onClick={() => handleSave('Paid')} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
            <Save size={15} /> Save as Paid
          </button>
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">{error}</div>}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column */}
        <div className="flex-1 space-y-5">
          {/* Business Info (readonly) */}
          <div className="glass p-5 rounded-xl">
            <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">From</h3>
            <div className="flex items-center gap-4">
              {logoURL ? <img src={logoURL} alt="Logo" className="w-14 h-14 rounded-xl object-contain bg-white/5 border border-white/10" /> :
                <div className="w-14 h-14 rounded-xl bg-primary-600 flex items-center justify-center text-white font-bold text-xl">{businessName.charAt(0)}</div>
              }
              <div>
                <p className="text-base font-bold text-gray-800 dark:text-white">{businessName}</p>
                {businessAddress && <p className="text-xs text-gray-500">{businessAddress}</p>}
                {businessPhone && <p className="text-xs text-gray-500">{businessPhone}</p>}
              </div>
            </div>
          </div>

          {/* Invoice Meta */}
          <div className="glass p-5 rounded-xl">
            <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>Invoice #</label><input value={invoiceNumber} readOnly className={`${inputCls} opacity-60 cursor-not-allowed`} /></div>
              <div><label className={labelCls}>Date</label><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
                  <option value="Draft">Draft</option><option value="Paid">Paid</option><option value="Unpaid">Unpaid</option>
                </select>
              </div>
              <div><label className={labelCls}>Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Bill To */}
          <div className="glass p-5 rounded-xl">
            <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Bill To</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className={labelCls}>Customer Name</label><input value={customerName} onChange={e => setCustomerName(e.target.value)} className={inputCls} placeholder="Customer name" /></div>
              <div><label className={labelCls}>Phone</label><input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className={inputCls} placeholder="Phone number" /></div>
              <div><label className={labelCls}>Email</label><input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className={inputCls} placeholder="Email (optional)" /></div>
            </div>
          </div>

          {/* Line Items */}
          <div className="glass p-5 rounded-xl">
            <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Line Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider pb-2 pr-2 w-[40%]">Product</th>
                    <th className="text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider pb-2 px-2 w-[15%]">Qty</th>
                    <th className="text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider pb-2 px-2 w-[20%]">Unit Price</th>
                    <th className="text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider pb-2 px-2 w-[20%]">Total</th>
                    <th className="w-[5%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="py-2 pr-2">
                        <input list={`products-${line.id}`} value={line.productName} onChange={e => updateLine(line.id, 'productName', e.target.value)}
                          className={`${inputCls} !py-2`} placeholder="Product name" />
                        <datalist id={`products-${line.id}`}>{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
                      </td>
                      <td className="py-2 px-2"><input type="number" min="1" value={line.quantity} onChange={e => updateLine(line.id, 'quantity', e.target.value)} className={`${inputCls} !py-2 text-right`} /></td>
                      <td className="py-2 px-2"><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={e => updateLine(line.id, 'unitPrice', e.target.value)} className={`${inputCls} !py-2 text-right`} /></td>
                      <td className="py-2 px-2 text-right font-bold text-gray-300">{(Number(line.total) || 0).toFixed(2)}</td>
                      <td className="py-2 pl-1"><button type="button" onClick={() => removeLine(line.id)} className="p-1 text-red-400/60 hover:text-red-400 transition-colors"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addLine} className="mt-3 w-full h-[40px] flex items-center justify-center gap-2 border-2 border-dashed border-primary-400/30 text-primary-400 rounded-xl text-sm font-bold hover:border-primary-500 hover:bg-primary-500/5 transition-all">
              <Plus size={16} /> Add Line
            </button>
          </div>

          {/* Notes */}
          <div className="glass p-5 rounded-xl">
            <label className={labelCls}>Notes / Terms</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} h-20 resize-none`} placeholder="Payment terms, thank you note, etc." />
          </div>
        </div>

        {/* Right Summary */}
        <div className="w-full lg:w-[280px] shrink-0">
          <div className="glass p-5 rounded-xl sticky top-24 space-y-4">
            <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Summary</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-gray-400"><span>Subtotal</span><span className="text-gray-300">{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between items-center text-gray-400">
                <span>Discount</span>
                <div className="flex items-center gap-1"><input type="number" min="0" max="100" step="0.1" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} className="w-16 bg-transparent border border-white/10 text-white text-right px-2 py-1 rounded-lg text-xs outline-none focus:border-primary-500" placeholder="0" /><span className="text-xs">%</span></div>
              </div>
              {discountAmt > 0 && <div className="flex justify-between text-red-400 text-xs"><span></span><span>-{discountAmt.toFixed(2)}</span></div>}
              <div className="flex justify-between items-center text-gray-400">
                <span>Tax</span>
                <div className="flex items-center gap-1"><input type="number" min="0" max="100" step="0.1" value={taxPercent} onChange={e => setTaxPercent(e.target.value)} className="w-16 bg-transparent border border-white/10 text-white text-right px-2 py-1 rounded-lg text-xs outline-none focus:border-primary-500" placeholder="0" /><span className="text-xs">%</span></div>
              </div>
              {taxAmt > 0 && <div className="flex justify-between text-gray-400 text-xs"><span></span><span>+{taxAmt.toFixed(2)}</span></div>}
              <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                <span className="font-bold text-white">Grand Total</span>
                <span className="text-xl font-bold text-primary-400 font-heading">{currency} {grandTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="pt-2 space-y-2">
              <button onClick={() => handleSave('Paid')} disabled={saving} className="w-full h-[44px] flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20 disabled:opacity-50">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save size={15} /> Save Invoice</>}
              </button>
              <button onClick={() => setShowPreview(true)} className="w-full h-[40px] flex items-center justify-center gap-2 border border-white/10 text-gray-400 rounded-xl text-sm font-bold hover:bg-white/5 hover:text-white transition-all">
                <Eye size={15} /> Preview
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <InvoicePreviewModal invoiceData={buildInvoiceDoc()} currency={currency} timezone={timezone} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
