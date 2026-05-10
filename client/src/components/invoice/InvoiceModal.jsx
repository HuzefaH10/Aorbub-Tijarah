import { useRef } from 'react';
import { X, Printer, Download } from 'lucide-react';

// Generate invoice number from date
function generateInvoiceNumber() {
  const now = new Date();
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `INV-${yyyymmdd}-${rand}`;
}

function formatCurrencyValue(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

export default function InvoiceModal({ bill, businessData, currency = 'USD', timezone, onClose }) {
  const printRef = useRef(null);
  const invoiceNumber = useRef(generateInvoiceNumber()).current;

  if (!bill) return null;

  const fmt = (n) => formatCurrencyValue(Number(n) || 0, currency);

  const billedDate = bill.date
    ? new Date(bill.date + 'T12:00:00').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone || 'UTC'
      })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const isCredit = bill.paymentMethod === 'credit';
  const customerName = isCredit ? (bill.credit?.customerName || 'Credit Customer') : 'Walk-in Customer';
  const discountAmount = (() => {
    const d = bill.discount;
    if (!d || !d.value) return 0;
    if (d.type === 'percent') return (bill.subtotal || 0) * (d.value / 100);
    return d.value;
  })();

  const businessName = businessData?.businessName || businessData?.name || 'My Business';
  const businessAddress = businessData?.address || '';
  const businessPhone = businessData?.phone || businessData?.contact || '';
  const businessEmail = businessData?.email || '';
  const logoUrl = businessData?.logoUrl || null;

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>Invoice ${invoiceNumber}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 32px; }
            .invoice-wrap { max-width: 780px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
            .logo { max-width: 160px; max-height: 60px; object-fit: contain; }
            .inv-label { font-size: 36px; font-weight: 900; color: #7c3aed; letter-spacing: -1px; }
            .inv-num { font-size: 12px; color: #6b7280; margin-top: 4px; }
            .biz-info { text-align: right; }
            .biz-name { font-size: 18px; font-weight: 700; color: #111; }
            .biz-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
            .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
            .bill-to-section { display: flex; justify-content: space-between; margin-bottom: 24px; }
            .section-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 4px; }
            .customer-name { font-size: 16px; font-weight: 700; color: #111; }
            .customer-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
            th { background: #f3f4f6; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; padding: 10px 12px; text-align: left; }
            td { padding: 10px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; }
            .text-right { text-align: right; }
            .total-row td { font-weight: 700; font-size: 14px; background: #f9fafb; }
            .net-row td { font-weight: 900; font-size: 16px; color: #7c3aed; background: #f5f3ff; }
            .badges { display: flex; gap: 12px; margin-bottom: 24px; }
            .badge { padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
            .badge-cash { background: #dcfce7; color: #16a34a; }
            .badge-credit { background: #fee2e2; color: #dc2626; }
            .badge-paid { background: #dcfce7; color: #16a34a; }
            .badge-unpaid { background: #fee2e2; color: #dc2626; }
            .footer { border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #9ca3af; font-size: 12px; }
            .footer-biz { font-weight: 600; color: #6b7280; margin-top: 6px; }
          </style>
        </head>
        <body>
          <div class="invoice-wrap">${printContents}</div>
        </body>
      </html>
    `);
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
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      pdf.save(`${invoiceNumber}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="w-full max-w-3xl my-6">
        {/* Action Bar */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white font-heading">Invoice Preview</h2>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-colors border border-white/10">
              <Printer size={15} /> Print
            </button>
            <button onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-primary-600/20">
              <Download size={15} /> Download PDF
            </button>
            <button onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Invoice Paper */}
        <div ref={printRef} className="bg-white rounded-2xl shadow-2xl p-10 text-gray-800">
          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              {logoUrl ? (
                <img src={logoUrl} alt="Business Logo" className="max-w-[160px] max-h-[60px] object-contain mb-2" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold text-2xl mb-2">
                  {businessName.charAt(0)}
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-violet-600 tracking-tight">INVOICE</div>
              <div className="text-xs text-gray-400 mt-1 font-mono">{invoiceNumber}</div>
              <div className="mt-4 text-right">
                <div className="text-lg font-bold text-gray-800">{businessName}</div>
                {businessAddress && <div className="text-sm text-gray-500 mt-0.5">{businessAddress}</div>}
                {businessPhone && <div className="text-sm text-gray-500">{businessPhone}</div>}
                {businessEmail && <div className="text-sm text-gray-500">{businessEmail}</div>}
                <div className="text-sm text-gray-500 mt-0.5">{billedDate}</div>
              </div>
            </div>
          </div>

          <hr className="border-gray-200 mb-6" />

          {/* Bill To */}
          <div className="flex justify-between mb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Bill To</div>
              <div className="text-lg font-bold text-gray-800">{customerName}</div>
              {isCredit && bill.credit?.dueDate && (
                <div className="text-sm text-red-500 mt-0.5 font-medium">Due: {bill.credit.dueDate}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Invoice Date</div>
              <div className="text-sm font-semibold text-gray-700">{billedDate}</div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-6 text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 rounded-tl-lg">#</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Product</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Category</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Unit</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Qty</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400">Unit Price</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 rounded-tr-lg">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(bill.items || []).map((item, i) => (
                <tr key={i}>
                  <td className="px-3 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-2.5 font-semibold text-gray-800">{item.productName || item.name || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{item.category || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-500">{item.unit || 'pcs'}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{item.quantity || item.qty || 0}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{fmt(item.unitPrice || (item.quantity ? (item.total / item.quantity) : 0))}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-800">{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={6} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-500">Subtotal</td>
                <td className="px-3 py-2.5 text-right font-bold text-gray-700">{fmt(bill.subtotal)}</td>
              </tr>
              {discountAmount > 0 && (
                <tr className="bg-gray-50">
                  <td colSpan={6} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-500">
                    Discount {bill.discount?.type === 'percent' ? `(${bill.discount.value}%)` : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold text-red-500">- {fmt(discountAmount)}</td>
                </tr>
              )}
              {bill.taxAmount > 0 && (
                <tr className="bg-gray-50">
                  <td colSpan={6} className="px-3 py-2.5 text-right text-sm font-semibold text-gray-500">Tax ({bill.tax}%)</td>
                  <td className="px-3 py-2.5 text-right font-bold text-gray-700">{fmt(bill.taxAmount)}</td>
                </tr>
              )}
              <tr className="bg-violet-50">
                <td colSpan={6} className="px-3 py-3 text-right text-sm font-black text-violet-700 rounded-bl-lg">Net Total</td>
                <td className="px-3 py-3 text-right text-xl font-black text-violet-700 rounded-br-lg">{fmt(bill.netTotal)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Payment Info */}
          <div className="flex items-center gap-3 mb-8">
            <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
              isCredit ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'
            }`}>
              {isCredit ? 'Credit' : 'Cash'}
            </span>
            <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
              bill.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {bill.status === 'paid' ? 'Paid' : bill.status === 'unpaid' ? 'Unpaid' : bill.status}
            </span>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 pt-6 text-center">
            <p className="text-base font-bold text-gray-600">Thank you for your business!</p>
            <p className="text-sm text-gray-400 mt-1">
              {businessName}
              {businessPhone && ` · ${businessPhone}`}
              {businessEmail && ` · ${businessEmail}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
