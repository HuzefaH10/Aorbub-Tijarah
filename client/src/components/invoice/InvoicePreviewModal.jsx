import { useRef } from 'react';
import { X, Printer, Download } from 'lucide-react';

function fmt(amount, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${Number(amount).toFixed(2)}`; }
}

export default function InvoicePreviewModal({ invoiceData, currency = 'USD', timezone, onClose }) {
  const printRef = useRef(null);
  if (!invoiceData) return null;

  const d = invoiceData;
  const f = (n) => fmt(Number(n) || 0, currency);

  const dateStr = d.invoiceDate
    ? new Date(d.invoiceDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone || 'UTC' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const handlePrint = () => {
    const html = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Invoice #${d.invoiceNumber}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#111;background:#fff;padding:32px}
      .wrap{max-width:780px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
      .inv-label{font-size:36px;font-weight:900;color:#7c3aed;letter-spacing:-1px}.inv-num{font-size:12px;color:#6b7280;margin-top:4px}
      .biz-name{font-size:18px;font-weight:700}.biz-sub{font-size:12px;color:#6b7280;margin-top:2px}
      .divider{border:none;border-top:1px solid #e5e7eb;margin:24px 0}
      .section-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:4px}
      .customer-name{font-size:16px;font-weight:700}.customer-sub{font-size:12px;color:#6b7280;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      th{background:#f3f4f6;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;padding:10px 12px;text-align:left}
      td{padding:10px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6}.text-right{text-align:right}
      .total-row td{font-weight:700;font-size:14px;background:#f9fafb}
      .net-row td{font-weight:900;font-size:16px;color:#7c3aed;background:#f5f3ff}
      .badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px}
      .badge-paid{background:#dcfce7;color:#16a34a}.badge-unpaid{background:#fee2e2;color:#dc2626}.badge-draft{background:#fef9c3;color:#a16207}
      .footer{border-top:1px solid #e5e7eb;padding-top:20px;text-align:center;color:#9ca3af;font-size:12px}
      .notes{background:#f9fafb;padding:16px;border-radius:8px;margin-bottom:24px;font-size:12px;color:#6b7280}
      </style></head><body><div class="wrap">${html}</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  };

  const handleDownloadPDF = async () => {
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, Math.min(pdfH, pdf.internal.pageSize.getHeight()));
      pdf.save(`Invoice-${d.invoiceNumber}.pdf`);
    } catch (err) { console.error('PDF generation failed:', err); }
  };

  const statusClass = d.status === 'Paid' ? 'badge-paid' : d.status === 'Unpaid' ? 'badge-unpaid' : 'badge-draft';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="w-full max-w-3xl my-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white font-heading">Invoice Preview</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-colors border border-white/10">
              <Printer size={15} /> Print
            </button>
            <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-primary-600/20">
              <Download size={15} /> Download PDF
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"><X size={18} /></button>
          </div>
        </div>

        <div ref={printRef} className="bg-white rounded-2xl shadow-2xl p-10 text-gray-800">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              {d.logoURL ? <img src={d.logoURL} alt="Logo" className="max-w-[160px] max-h-[60px] object-contain mb-2" /> :
                <div className="w-14 h-14 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold text-2xl mb-2">{(d.businessName || 'M').charAt(0)}</div>
              }
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-violet-600 tracking-tight">INVOICE</div>
              <div className="text-xs text-gray-400 mt-1 font-mono">#{String(d.invoiceNumber).padStart(4, '0')}</div>
              <div className="mt-4">
                <div className="text-lg font-bold text-gray-800">{d.businessName}</div>
                {d.businessAddress && <div className="text-sm text-gray-500 mt-0.5">{d.businessAddress}</div>}
                {d.businessPhone && <div className="text-sm text-gray-500">{d.businessPhone}</div>}
                {d.businessEmail && <div className="text-sm text-gray-500">{d.businessEmail}</div>}
              </div>
            </div>
          </div>

          <hr className="border-gray-200 mb-6" />

          {/* Bill To + Date */}
          <div className="flex justify-between mb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Bill To</div>
              <div className="text-lg font-bold text-gray-800">{d.customerName || 'Walk-in Customer'}</div>
              {d.customerPhone && <div className="text-sm text-gray-500 mt-0.5">{d.customerPhone}</div>}
              {d.customerEmail && <div className="text-sm text-gray-500">{d.customerEmail}</div>}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Invoice Date</div>
              <div className="text-sm font-semibold text-gray-700">{dateStr}</div>
              <div className="mt-2"><span className={`badge ${statusClass}`}>{d.status || 'Draft'}</span></div>
            </div>
          </div>

          {/* Line Items */}
          <table className="w-full mb-6 text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 rounded-tl-lg">#</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Product</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Qty</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Unit Price</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 rounded-tr-lg">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(d.items || []).map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{item.productName || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{item.quantity || 0}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{f(item.unitPrice)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-800">{f(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-500">Subtotal</td>
                <td className="px-3 py-2.5 text-right font-bold text-gray-700">{f(d.subtotal)}</td>
              </tr>
              {d.discountAmount > 0 && (
                <tr className="bg-gray-50">
                  <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-500">Discount ({d.discountPercent}%)</td>
                  <td className="px-3 py-2.5 text-right font-bold text-red-500">- {f(d.discountAmount)}</td>
                </tr>
              )}
              {d.taxAmount > 0 && (
                <tr className="bg-gray-50">
                  <td colSpan={4} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-500">Tax ({d.taxPercent}%)</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-700">{f(d.taxAmount)}</td>
                </tr>
              )}
              <tr className="bg-violet-50">
                <td colSpan={4} className="px-3 py-3 text-right text-sm font-black text-violet-700 rounded-bl-lg">Grand Total</td>
                <td className="px-3 py-3 text-right text-xl font-black text-violet-700 rounded-br-lg">{f(d.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Payment + Notes */}
          <div className="flex items-center gap-3 mb-6">
            <span className={`badge ${statusClass}`}>{d.status || 'Draft'}</span>
            <span className="px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-gray-100 text-gray-600">{d.paymentMethod || 'Cash'}</span>
          </div>

          {d.notes && <div className="notes"><strong>Notes:</strong> {d.notes}</div>}

          <div className="border-t border-gray-200 pt-6 text-center">
            <p className="text-base font-bold text-gray-600">Thank you for your business!</p>
            <p className="text-sm text-gray-400 mt-1">{d.businessName}{d.businessPhone && ` · ${d.businessPhone}`}{d.businessEmail && ` · ${d.businessEmail}`}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
