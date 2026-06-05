import { useState, useMemo } from 'react';
import { useInvoices } from '../hooks/useInvoices';
import { useBusiness } from '../context/BusinessContext';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { writeAuditLog } from '../hooks/useAuditLog';
import Toast, { useToast } from '../components/ui/Toast';
import InvoiceBuilder from '../components/invoice/InvoiceBuilder';
import InvoicePreviewModal from '../components/invoice/InvoicePreviewModal';
import { Plus, FileText, Search, Filter, Trash2, Eye, Download, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 15;
const STATUS_COLORS = {
  Paid: 'bg-green-500/15 text-green-400 border-green-500/20',
  Unpaid: 'bg-red-500/15 text-red-400 border-red-500/20',
  Draft: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
};

export default function Invoices() {
  const { invoices, loading, deleteInvoice } = useInvoices();
  const { currency, timezone, activeBusinessId, businessData } = useBusiness();
  const { user } = useAuth();
  const { role } = useRole();
  const { toast, showToast, hideToast } = useToast();

  // Views
  const [view, setView] = useState('list'); // 'list' | 'builder'
  const [editInvoice, setEditInvoice] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Preview
  const [previewInvoice, setPreviewInvoice] = useState(null);

  const filtered = useMemo(() => {
    let items = [...invoices];
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(inv =>
        (inv.customerName || '').toLowerCase().includes(s) ||
        String(inv.invoiceNumber).includes(s)
      );
    }
    if (statusFilter) items = items.filter(inv => inv.status === statusFilter);
    if (dateFrom) items = items.filter(inv => (inv.invoiceDate || '') >= dateFrom);
    if (dateTo) items = items.filter(inv => (inv.invoiceDate || '') <= dateTo);
    return items;
  }, [invoices, search, statusFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete Invoice #${inv.invoiceNumber}?`)) return;
    try {
      await deleteInvoice(inv.id);
      writeAuditLog(user, role, 'Invoice deleted', `Invoice #${inv.invoiceNumber}`, null, activeBusinessId);
      showToast('Invoice deleted');
    } catch { showToast('Failed to delete invoice', 'error'); }
  };

  const handleDownloadPDF = async (inv) => {
    setPreviewInvoice({ ...inv, _autoDownload: true });
  };

  const openBuilder = (inv = null) => { setEditInvoice(inv); setView('builder'); };

  const fmt = (n) => {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n); }
    catch { return `${currency} ${Number(n).toFixed(2)}`; }
  };

  const inputCls = "h-[36px] bg-transparent border border-white/10 text-white text-sm rounded-lg px-3 outline-none focus:border-primary-500 transition-all";

  // Builder view
  if (view === 'builder') {
    return (
      <div className="w-full px-6 pb-12 animate-fadeIn">
        {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
        <InvoiceBuilder
          editInvoice={editInvoice}
          onBack={() => { setView('list'); setEditInvoice(null); }}
          onSaved={() => { setView('list'); setEditInvoice(null); showToast('Invoice saved successfully!'); }}
        />
      </div>
    );
  }

  // List view
  return (
    <div className="w-full px-6 pb-12 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800/60 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-white font-heading">Invoices</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Create, manage and track all your invoices</p>
        </div>
        <button onClick={() => openBuilder()} className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20">
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total', value: invoices.length, color: 'text-white' },
          { label: 'Paid', value: invoices.filter(i => i.status === 'Paid').length, color: 'text-green-400' },
          { label: 'Unpaid', value: invoices.filter(i => i.status === 'Unpaid').length, color: 'text-red-400' },
          { label: 'Drafts', value: invoices.filter(i => i.status === 'Draft').length, color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="glass p-4 rounded-xl">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-bold font-heading ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass p-4 rounded-xl mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search by customer or invoice #..." className={`${inputCls} w-full pl-9`} />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className={`${inputCls} min-w-[120px]`}>
            <option value="">All Status</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Draft">Draft</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className={inputCls} title="From date" />
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className={inputCls} title="To date" />
          {(search || statusFilter || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }} className="text-xs text-gray-400 hover:text-white font-bold px-3 py-2 rounded-lg hover:bg-white/5 transition-all">Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Invoice #', 'Customer', 'Date', 'Amount', 'Status', 'Payment', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-16"><div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-gray-500">
                  <FileText size={32} className="mx-auto mb-2 text-gray-600" />
                  <p className="font-bold">No invoices found</p>
                  <p className="text-xs mt-1">Create your first invoice to get started</p>
                </td></tr>
              ) : paginated.map(inv => (
                <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3.5 font-mono font-bold text-primary-400">#{String(inv.invoiceNumber).padStart(4, '0')}</td>
                  <td className="px-4 py-3.5 font-semibold text-white">{inv.customerName || <span className="text-gray-600 italic">Walk-in</span>}</td>
                  <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap">{inv.invoiceDate ? new Date(inv.invoiceDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td className="px-4 py-3.5 font-bold text-gray-200">{fmt(inv.grandTotal)}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_COLORS[inv.status] || STATUS_COLORS.Draft}`}>{inv.status || 'Draft'}</span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-400 text-xs">{inv.paymentMethod || '—'}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setPreviewInvoice(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all" title="View"><Eye size={15} /></button>
                      <button onClick={() => handleDownloadPDF(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all" title="Download PDF"><Download size={15} /></button>
                      <button onClick={() => openBuilder(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all" title="Edit"><FileText size={15} /></button>
                      <button onClick={() => handleDelete(inv)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs font-bold text-gray-500">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 flex items-center gap-1 text-sm font-bold text-gray-400 hover:bg-white/5 rounded-lg disabled:opacity-40 transition-all"><ChevronLeft size={14} /> Prev</button>
              <span className="text-xs font-bold text-gray-500">Page {page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 flex items-center gap-1 text-sm font-bold text-gray-400 hover:bg-white/5 rounded-lg disabled:opacity-40 transition-all">Next <ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewInvoice && (
        <InvoicePreviewModal
          invoiceData={previewInvoice}
          currency={currency}
          timezone={timezone}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </div>
  );
}
