import React, { useState, useMemo } from 'react';
import { useBills, useEvents } from '../hooks/useFirestore';
import { useBusiness } from '../context/BusinessContext';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';
import { writeAuditLog } from '../hooks/useAuditLog';
import { todayISO as getTodayISO } from '../utils/dateUtils';
import { db } from '../services/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Search, ChevronLeft, ChevronRight, Eye, CheckCircle, 
  NotebookTabs, AlertTriangle, Clock, DollarSign, X
} from 'lucide-react';
import Toast, { useToast } from '../components/ui/Toast';
import Pagination from '../components/ui/Pagination';
import BillDetailModal from '../components/dashboard/BillDetailModal'; // I will just copy the modal logic here since TabBillHistory has it inline and it's not exported. Wait, I'll put it inline to ensure it works.

export default function Credits() {
  const { bills } = useBills();
  const { events } = useEvents();
  const { activeBusinessId, timezone } = useBusiness();
  const { user } = useAuth();
  const { role } = useRole();
  const { toast, showToast, hideToast } = useToast();

  const todayISO = getTodayISO(timezone);
  const todayMs = new Date(todayISO).getTime();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('due_asc');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  const [selectedBill, setSelectedBill] = useState(null);
  const [confirmPay, setConfirmPay] = useState(null);
  const [customerDrawer, setCustomerDrawer] = useState(null); // stores customerName

  // --- Derived Data ---
  const creditBills = useMemo(() => bills.filter(b => b.paymentMethod === 'credit'), [bills]);
  const unpaidCredits = useMemo(() => creditBills.filter(b => b.status === 'unpaid'), [creditBills]);

  const stats = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let dueThisWeek = 0;

    unpaidCredits.forEach(b => {
      outstanding += Number(b.netTotal || 0);
      if (b.credit?.dueDate) {
        const diffDays = Math.round((new Date(b.credit.dueDate).getTime() - todayMs) / 86400000);
        if (diffDays < 0) overdue++;
        else if (diffDays <= 7) dueThisWeek++;
      }
    });
    return { outstanding, overdue, dueThisWeek };
  }, [unpaidCredits, todayMs]);

  // --- Filtering & Sorting ---
  const filteredCredits = useMemo(() => {
    let res = unpaidCredits;

    if (search) {
      const q = search.toLowerCase();
      res = res.filter(b => 
        b.credit?.customerName?.toLowerCase().includes(q) || 
        b.id.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      res = res.filter(b => {
        if (!b.credit?.dueDate) return false;
        const diffDays = Math.round((new Date(b.credit.dueDate).getTime() - todayMs) / 86400000);
        if (statusFilter === 'overdue') return diffDays < 0;
        if (statusFilter === 'duethisweek') return diffDays >= 0 && diffDays <= 7;
        if (statusFilter === 'upcoming') return diffDays > 7;
        return true;
      });
    }

    res.sort((a, b) => {
      const aDue = a.credit?.dueDate ? new Date(a.credit.dueDate).getTime() : 0;
      const bDue = b.credit?.dueDate ? new Date(b.credit.dueDate).getTime() : 0;
      
      if (sortBy === 'due_asc') return aDue - bDue;
      if (sortBy === 'due_desc') return bDue - aDue;
      if (sortBy === 'amount_desc') return Number(b.netTotal || 0) - Number(a.netTotal || 0);
      return 0;
    });

    return res;
  }, [unpaidCredits, search, statusFilter, sortBy, todayMs]);

  const totalPages = Math.max(1, Math.ceil(filteredCredits.length / ITEMS_PER_PAGE));
  const paginatedCredits = filteredCredits.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // --- Actions ---
  const handleMarkAsPaid = async (billId) => {
    try {
      await updateDoc(doc(db, 'bills', billId), {
        status: 'paid',
        paidAt: serverTimestamp()
      });

      const linkedEvent = events.find(e => e.type === 'credit_due' && e.linkedBillId === billId);
      if (linkedEvent) {
        await updateDoc(doc(db, 'events', linkedEvent.id), { status: 'completed' });
      }

      writeAuditLog(user, role, 'Bill paid', `Bill #${billId} marked as paid`, billId, activeBusinessId);
      
      showToast('Bill marked as paid');
      setConfirmPay(null);
      if (selectedBill?.id === billId) {
        setSelectedBill(null); // Close modal automatically
      }
    } catch (err) {
      console.error('Failed to mark paid:', err);
      showToast('Failed to update bill', 'error');
    }
  };

  const getStatusBadge = (dueDate) => {
    if (!dueDate) return { label: 'UNKNOWN', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' };
    const diffDays = Math.round((new Date(dueDate).getTime() - todayMs) / 86400000);
    if (diffDays < 0) return { label: 'OVERDUE', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' };
    if (diffDays <= 7) return { label: 'DUE SOON', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' };
    return { label: 'UPCOMING', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400' };
  };

  // --- Customer History Drawer Logic ---
  const customerHistory = useMemo(() => {
    if (!customerDrawer) return null;
    const custBills = creditBills.filter(b => b.credit?.customerName === customerDrawer).sort((a, b) => b.createdAt - a.createdAt);
    const totalOwed = custBills.reduce((s, b) => s + Number(b.netTotal || 0), 0);
    const totalPaid = custBills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.netTotal || 0), 0);
    const outstanding = totalOwed - totalPaid;
    return { bills: custBills, totalOwed, totalPaid, outstanding };
  }, [customerDrawer, creditBills]);

  return (
    <div className="space-y-6 animate-fadeIn pb-20 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 glass p-6 rounded-2xl shadow-xl border border-white/5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-primary-600/20 border border-primary-500/30">
              <NotebookTabs size={24} className="text-primary-400" />
            </div>
            <h1 className="text-3xl font-bold text-white font-heading">Credits & Ledger</h1>
          </div>
          <p className="text-sm text-gray-400">Track unpaid credit bills and customer balances</p>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Total Outstanding</span>
            <DollarSign size={16} className="text-primary-400" />
          </div>
          <div className="text-3xl font-bold font-heading text-white">${stats.outstanding.toLocaleString(undefined, {minimumFractionDigits:2})}</div>
        </div>
        <div className="glass p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Overdue</span>
            <AlertTriangle size={16} className="text-red-400 animate-pulse" />
          </div>
          <div className="text-3xl font-bold font-heading text-red-400">{stats.overdue}</div>
        </div>
        <div className="glass p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Due This Week</span>
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-heading text-amber-400">{stats.dueThisWeek}</div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="glass p-4 rounded-2xl border border-white/5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            value={search} onChange={e => {setSearch(e.target.value); setPage(1)}}
            placeholder="Search customer name or Bill ID..." 
            className="w-full pl-8 pr-4 py-2 bg-gray-900/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors" 
          />
        </div>
        <select value={statusFilter} onChange={e => {setStatusFilter(e.target.value); setPage(1)}} className="px-4 py-2 bg-gray-900/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors appearance-none cursor-pointer">
          <option value="all">All Unpaid</option>
          <option value="overdue">Overdue</option>
          <option value="duethisweek">Due This Week</option>
          <option value="upcoming">Upcoming</option>
        </select>
        <select value={sortBy} onChange={e => {setSortBy(e.target.value); setPage(1)}} className="px-4 py-2 bg-gray-900/50 border border-white/10 rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors appearance-none cursor-pointer">
          <option value="due_asc">Due Date (Earliest)</option>
          <option value="due_desc">Due Date (Latest)</option>
          <option value="amount_desc">Amount (High to Low)</option>
        </select>
      </div>

      <div className="text-xs font-bold text-gray-500">
        Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filteredCredits.length)} of {filteredCredits.length} credits
      </div>

      {/* TABLE */}
      <div className="glass overflow-hidden rounded-2xl border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-900/80 text-xs text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4 font-bold">Customer Name</th>
                <th className="px-5 py-4 font-bold">Bill ID</th>
                <th className="px-5 py-4 font-bold text-right">Amount Due</th>
                <th className="px-5 py-4 font-bold">Bill Date</th>
                <th className="px-5 py-4 font-bold">Due Date</th>
                <th className="px-5 py-4 font-bold text-center">Days Overdue</th>
                <th className="px-5 py-4 font-bold text-center">Status</th>
                <th className="px-5 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedCredits.map(b => {
                const diffDays = b.credit?.dueDate ? Math.round((new Date(b.credit.dueDate).getTime() - todayMs) / 86400000) : 0;
                const isOverdue = diffDays < 0;
                const badge = getStatusBadge(b.credit?.dueDate);
                
                return (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-4 font-bold text-white cursor-pointer hover:text-primary-400 transition-colors" onClick={() => setCustomerDrawer(b.credit.customerName)}>
                      {b.credit?.customerName || 'Unknown'}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs text-gray-400">{b.id}</td>
                    <td className="px-5 py-4 text-right font-bold text-white">${Number(b.netTotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td className="px-5 py-4 text-gray-400">{b.date}</td>
                    <td className="px-5 py-4 text-gray-300 font-medium">{b.credit?.dueDate || '—'}</td>
                    <td className="px-5 py-4 text-center">
                      {isOverdue ? <span className="text-red-400 font-bold">{Math.abs(diffDays)} days</span> : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right space-x-2">
                      <button onClick={() => setSelectedBill(b)} className="px-3 py-1.5 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors inline-flex items-center gap-1.5">
                        <Eye size={14} /> View
                      </button>
                      {confirmPay === b.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => setConfirmPay(null)} className="px-2 py-1.5 text-xs font-bold text-gray-400 hover:text-white bg-gray-800 rounded-lg transition-colors">Cancel</button>
                          <button onClick={() => handleMarkAsPaid(b.id)} className="px-2 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">Confirm</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmPay(b.id)} className="px-3 py-1.5 text-xs font-bold text-green-400 hover:text-white bg-green-500/10 hover:bg-green-600 rounded-lg transition-colors inline-flex items-center gap-1.5">
                          <CheckCircle size={14} /> Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginatedCredits.length === 0 && (
                <tr>
                  <td colSpan="8" className="px-5 py-10 text-center text-gray-500">No unpaid credit bills found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PAGINATION */}
      <Pagination 
        currentPage={page}
        totalPages={totalPages}
        totalCount={filteredCredits.length}
        pageSize={ITEMS_PER_PAGE}
        onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        onPrevious={() => setPage(p => Math.max(1, p - 1))}
      />

      {/* BILL DETAIL MODAL (Inline copy for independence) */}
      {selectedBill && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gray-900/50">
              <h2 className="text-lg font-bold text-white font-heading">Bill Details</h2>
              <button onClick={() => {setSelectedBill(null); setConfirmPay(null);}} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Bill ID</p>
                  <p className="font-mono font-bold text-white">{selectedBill.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Date</p>
                  <p className="font-bold text-white">{selectedBill.date}</p>
                </div>
              </div>

              <div className="flex justify-between items-center bg-gray-800/50 p-4 rounded-xl border border-white/5">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    selectedBill.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {selectedBill.status}
                  </span>
                  {selectedBill.status === 'paid' && (
                    <span className="text-xs text-gray-500 ml-2">
                      on {selectedBill.paidAt?.toDate ? selectedBill.paidAt.toDate().toISOString().split('T')[0] : todayISO}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Payment Method</p>
                  <p className="font-bold capitalize text-white">{selectedBill.paymentMethod}</p>
                </div>
              </div>

              {selectedBill.paymentMethod === 'credit' && selectedBill.credit && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2">Credit Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-amber-500/70 font-semibold mb-0.5">Customer Name</p>
                      <p className="font-bold text-amber-200">{selectedBill.credit.customerName}</p>
                    </div>
                    {selectedBill.credit.customerPhone && (
                      <div>
                        <p className="text-xs text-amber-500/70 font-semibold mb-0.5">Phone</p>
                        <p className="font-bold text-amber-200">{selectedBill.credit.customerPhone}</p>
                      </div>
                    )}
                    {selectedBill.credit.dueDate && (
                      <div>
                        <p className="text-xs text-amber-500/70 font-semibold mb-0.5">Due Date</p>
                        <p className="font-bold text-amber-200">{selectedBill.credit.dueDate}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Line Items</h4>
                <div className="border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-800/80 text-xs text-gray-400">
                      <tr>
                        <th className="px-4 py-3 font-bold">Product</th>
                        <th className="px-4 py-3 font-bold">Category</th>
                        <th className="px-4 py-3 font-bold text-right">Qty</th>
                        <th className="px-4 py-3 font-bold text-right">Price</th>
                        <th className="px-4 py-3 font-bold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-white">
                      {selectedBill.items.map((item, idx) => (
                        <tr key={idx} className="bg-gray-900/30">
                          <td className="px-4 py-3 font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{item.category}</td>
                          <td className="px-4 py-3 text-right">{item.quantity} <span className="text-xs text-gray-500">{item.unit}</span></td>
                          <td className="px-4 py-3 text-right">${Number(item.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="px-4 py-3 text-right font-bold">${(Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-gray-800/50 p-4 rounded-xl space-y-2 border border-white/5">
                <div className="flex justify-between text-sm text-gray-300">
                  <span>Subtotal</span>
                  <span className="font-bold">${Number(selectedBill.subTotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                {Number(selectedBill.discount || 0) > 0 && (
                  <div className="flex justify-between text-sm text-red-400">
                    <span>Discount</span>
                    <span className="font-bold">-${Number(selectedBill.discount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-white/10 flex justify-between text-lg font-bold text-white">
                  <span>Net Total</span>
                  <span>${Number(selectedBill.netTotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </div>

              {selectedBill.status === 'unpaid' && (
                <div className="pt-4 border-t border-white/10">
                  {confirmPay === selectedBill.id ? (
                    <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-xl flex items-center justify-between">
                      <span className="text-sm font-bold text-green-400">Mark this bill as paid?</span>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmPay(null)} className="px-4 py-2 text-xs font-bold text-gray-300 hover:text-white bg-gray-800 rounded-lg transition-colors">Cancel</button>
                        <button onClick={() => handleMarkAsPaid(selectedBill.id)} className="px-4 py-2 text-xs font-bold bg-green-600 text-white hover:bg-green-500 rounded-lg shadow-lg shadow-green-600/20 transition-colors">Confirm</button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmPay(selectedBill.id)}
                      className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2 text-base"
                    >
                      <CheckCircle size={20} /> Mark as Paid
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER HISTORY DRAWER */}
      {customerDrawer && customerHistory && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-gray-900 border-l border-white/10 w-full max-w-md h-full shadow-2xl flex flex-col animate-slideInRight">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-gray-800/50">
              <div>
                <h2 className="text-lg font-bold text-white font-heading">{customerDrawer}</h2>
                <p className="text-xs text-gray-400 mt-1">Credit History</p>
              </div>
              <button onClick={() => setCustomerDrawer(null)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 p-2 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 border-b border-white/10 bg-gray-900/30 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Total Owed</p>
                <p className="text-lg font-bold text-white">${customerHistory.totalOwed.toLocaleString(undefined, {minimumFractionDigits:2})}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Total Paid</p>
                <p className="text-lg font-bold text-green-400">${customerHistory.totalPaid.toLocaleString(undefined, {minimumFractionDigits:2})}</p>
              </div>
              <div className="col-span-2 bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl mt-2 flex justify-between items-center">
                <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">Current Outstanding</span>
                <span className="text-xl font-bold font-heading text-amber-400">${customerHistory.outstanding.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">All Credit Bills</h3>
              {customerHistory.bills.map(b => (
                <div key={b.id} className="bg-gray-800/50 border border-white/5 rounded-xl p-4 hover:border-white/20 transition-colors">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-sm font-bold text-white">${Number(b.netTotal || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{b.id}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      b.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {b.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-end mt-2 pt-3 border-t border-white/5">
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>Date: {b.date}</p>
                      {b.status === 'unpaid' && b.credit?.dueDate && <p>Due: <span className="text-gray-300">{b.credit.dueDate}</span></p>}
                    </div>
                    <button onClick={() => setSelectedBill(b)} className="text-xs font-bold text-primary-400 hover:text-primary-300 transition-colors">View Details</button>
                  </div>
                </div>
              ))}
              {customerHistory.bills.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-10">No history found.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
