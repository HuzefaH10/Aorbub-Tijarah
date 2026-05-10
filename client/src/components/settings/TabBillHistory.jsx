import React, { useState, useMemo } from 'react';
import { useBills, useEvents } from '../../hooks/useFirestore';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../hooks/useRole';
import { writeAuditLog } from '../../hooks/useAuditLog';
import { todayISO as getTodayISO } from '../../utils/dateUtils';
import { db } from '../../services/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Search, ChevronLeft, ChevronRight, Eye, Calendar, DollarSign, X, Receipt, CheckCircle } from 'lucide-react';
import Toast, { useToast } from '../ui/Toast';
import Pagination from '../ui/Pagination';

export default function TabBillHistory({ cardCls, labelCls, inputCls }) {
  const { bills } = useBills();
  const { events } = useEvents();
  const { activeBusinessId, timezone } = useBusiness();
  const { user } = useAuth();
  const { role } = useRole();
  const { toast, showToast, hideToast } = useToast();

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payMethod, setPayMethod] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  const [selectedBill, setSelectedBill] = useState(null);
  const [confirmPay, setConfirmPay] = useState(null);

  const todayISO = getTodayISO(timezone);

  // Quick preset functions
  const setPreset = (preset) => {
    const d = new Date(todayISO);
    let from = todayISO;
    let to = todayISO;
    
    if (preset === 'week') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(d.setDate(diff));
      from = monday.toISOString().split('T')[0];
    } else if (preset === 'month') {
      from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
      to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    } else if (preset === 'year') {
      from = new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
      to = new Date(d.getFullYear(), 11, 31).toISOString().split('T')[0];
    }
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  };

  const resetFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPayMethod('all');
    setStatusFilter('all');
    setPage(1);
  };

  const filteredBills = useMemo(() => {
    let res = bills;
    if (search) {
      const q = search.toLowerCase();
      res = res.filter(b => 
        b.id.toLowerCase().includes(q) || 
        b.items.some(i => i.name.toLowerCase().includes(q)) || 
        (b.credit?.customerName && b.credit.customerName.toLowerCase().includes(q))
      );
    }
    if (dateFrom) res = res.filter(b => b.date >= dateFrom);
    if (dateTo) res = res.filter(b => b.date <= dateTo);
    if (payMethod !== 'all') res = res.filter(b => b.paymentMethod === payMethod);
    if (statusFilter !== 'all') res = res.filter(b => b.status === statusFilter);

    // Sort newest first
    return res.sort((a, b) => b.createdAt - a.createdAt);
  }, [bills, search, dateFrom, dateTo, payMethod, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / ITEMS_PER_PAGE));
  const paginatedBills = filteredBills.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const handleMarkAsPaid = async (billId) => {
    try {
      // 1. Update bill document
      await updateDoc(doc(db, 'bills', billId), {
        status: 'paid',
        paidAt: serverTimestamp()
      });

      // 2. Update associated event if exists
      const linkedEvent = events.find(e => e.type === 'credit_due' && e.linkedBillId === billId);
      if (linkedEvent) {
        await updateDoc(doc(db, 'events', linkedEvent.id), {
          status: 'completed'
        });
      }

      // 3. Write audit log
      writeAuditLog(user, role, 'Bill paid', `Bill #${billId} marked as paid`, billId, activeBusinessId);
      
      showToast('Bill marked as paid');
      setConfirmPay(null);
      // Close modal if open
      if (selectedBill?.id === billId) {
        setSelectedBill(prev => ({ ...prev, status: 'paid', paidAt: new Date() }));
      }
    } catch (err) {
      console.error('Failed to mark paid:', err);
      showToast('Failed to update bill', 'error');
    }
  };

  return (
    <div id="bills" className={cardCls}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100 dark:border-white/[0.06]">
        <div className="p-2 rounded-lg bg-primary-500/10">
          <Receipt size={20} className="text-primary-500" />
        </div>
        <div>
          <h3 className="text-base font-bold text-gray-800 dark:text-white font-heading">Bill History</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">View and manage all recorded transactions</p>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              value={search} onChange={e => {setSearch(e.target.value); setPage(1)}}
              placeholder="Search ID, product, customer..." 
              className={`pl-8 ${inputCls}`} 
            />
          </div>
          <select value={payMethod} onChange={e => {setPayMethod(e.target.value); setPage(1)}} className={inputCls}>
            <option value="all">All Payment Methods</option>
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
          </select>
          <select value={statusFilter} onChange={e => {setStatusFilter(e.target.value); setPage(1)}} className={inputCls}>
            <option value="all">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => {setDateFrom(e.target.value); setPage(1)}} className={inputCls} />
            <span className="text-gray-400 text-xs">to</span>
            <input type="date" value={dateTo} onChange={e => {setDateTo(e.target.value); setPage(1)}} className={inputCls} />
          </div>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700 mx-1"></div>
          <button onClick={() => setPreset('today')} className="text-xs font-bold text-gray-500 hover:text-primary-500 transition-colors">Today</button>
          <button onClick={() => setPreset('week')} className="text-xs font-bold text-gray-500 hover:text-primary-500 transition-colors">This Week</button>
          <button onClick={() => setPreset('month')} className="text-xs font-bold text-gray-500 hover:text-primary-500 transition-colors">This Month</button>
          <button onClick={() => setPreset('year')} className="text-xs font-bold text-gray-500 hover:text-primary-500 transition-colors">This Year</button>
          <div className="flex-1"></div>
          <button onClick={resetFilters} className="text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors">Reset Filters</button>
        </div>
      </div>

      <div className="mb-3 text-xs font-bold text-gray-400">
        Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filteredBills.length)} of {filteredBills.length} bills
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/80 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 font-bold">Bill ID</th>
              <th className="px-4 py-3 font-bold">Date</th>
              <th className="px-4 py-3 font-bold">Items</th>
              <th className="px-4 py-3 font-bold text-right">Net Total</th>
              <th className="px-4 py-3 font-bold">Method</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Paid On</th>
              <th className="px-4 py-3 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/5">
            {paginatedBills.map(b => (
              <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{b.id}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{b.date}</td>
                <td className="px-4 py-3 text-gray-800 dark:text-white font-medium">
                  {b.items[0]?.name || 'Unknown'} {b.items.length > 1 && <span className="text-gray-400 text-xs ml-1">+{b.items.length - 1} more</span>}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-800 dark:text-white">${Number(b.netTotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{b.paymentMethod}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    b.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                  }`}>
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {b.status === 'paid' ? (b.paidAt?.toDate ? b.paidAt.toDate().toISOString().split('T')[0] : todayISO) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => setSelectedBill(b)} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded transition-colors" title="View Details">
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {paginatedBills.length === 0 && (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-gray-500 text-sm">No bills found matching your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <Pagination 
        currentPage={page}
        totalPages={totalPages}
        totalCount={filteredBills.length}
        pageSize={ITEMS_PER_PAGE}
        onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        onPrevious={() => setPage(p => Math.max(1, p - 1))}
      />

      {/* BILL DETAIL MODAL */}
      {selectedBill && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/10">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white font-heading">Bill Details</h2>
              <button onClick={() => setSelectedBill(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Bill ID</p>
                  <p className="font-mono font-bold text-gray-800 dark:text-white">{selectedBill.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Date</p>
                  <p className="font-bold text-gray-800 dark:text-white">{selectedBill.date}</p>
                </div>
              </div>

              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Status</p>
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    selectedBill.status === 'paid' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
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
                  <p className="font-bold capitalize text-gray-800 dark:text-white">{selectedBill.paymentMethod}</p>
                </div>
              </div>

              {selectedBill.paymentMethod === 'credit' && selectedBill.credit && (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 rounded-xl">
                  <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-widest mb-2">Credit Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-amber-600/70 dark:text-amber-500/70 font-semibold mb-0.5">Customer Name</p>
                      <p className="font-bold text-amber-900 dark:text-amber-200">{selectedBill.credit.customerName}</p>
                    </div>
                    {selectedBill.credit.customerPhone && (
                      <div>
                        <p className="text-xs text-amber-600/70 dark:text-amber-500/70 font-semibold mb-0.5">Phone</p>
                        <p className="font-bold text-amber-900 dark:text-amber-200">{selectedBill.credit.customerPhone}</p>
                      </div>
                    )}
                    {selectedBill.credit.dueDate && (
                      <div>
                        <p className="text-xs text-amber-600/70 dark:text-amber-500/70 font-semibold mb-0.5">Due Date</p>
                        <p className="font-bold text-amber-900 dark:text-amber-200">{selectedBill.credit.dueDate}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Line Items</h4>
                <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800/80 text-xs text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="px-4 py-2 font-bold">Product</th>
                        <th className="px-4 py-2 font-bold">Category</th>
                        <th className="px-4 py-2 font-bold text-right">Qty</th>
                        <th className="px-4 py-2 font-bold text-right">Price</th>
                        <th className="px-4 py-2 font-bold text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5 text-gray-800 dark:text-white">
                      {selectedBill.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 font-medium">{item.name}</td>
                          <td className="px-4 py-2 text-xs text-gray-500">{item.category}</td>
                          <td className="px-4 py-2 text-right">{item.quantity} <span className="text-xs text-gray-500">{item.unit}</span></td>
                          <td className="px-4 py-2 text-right">${Number(item.price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          <td className="px-4 py-2 text-right font-bold">${(Number(item.price || 0) * Number(item.quantity || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                  <span>Subtotal</span>
                  <span className="font-bold">${Number(selectedBill.subTotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                {Number(selectedBill.discount || 0) > 0 && (
                  <div className="flex justify-between text-sm text-red-500">
                    <span>Discount</span>
                    <span className="font-bold">-${Number(selectedBill.discount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200 dark:border-white/10 flex justify-between text-lg font-bold text-gray-800 dark:text-white">
                  <span>Net Total</span>
                  <span>${Number(selectedBill.netTotal || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </div>

              {selectedBill.status === 'unpaid' && (
                <div className="pt-4 border-t border-gray-200 dark:border-white/10">
                  {confirmPay === selectedBill.id ? (
                    <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 p-4 rounded-xl flex items-center justify-between">
                      <span className="text-sm font-bold text-green-800 dark:text-green-400">Mark this bill as paid?</span>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmPay(null)} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                        <button onClick={() => handleMarkAsPaid(selectedBill.id)} className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white hover:bg-green-700 rounded-lg shadow-lg shadow-green-600/20 transition-colors">Confirm</button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setConfirmPay(selectedBill.id)}
                      className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all flex items-center justify-center gap-2 text-base"
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
    </div>
  );
}
