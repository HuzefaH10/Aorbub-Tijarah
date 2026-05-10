import React, { useState, useMemo, useEffect } from 'react';
import { 
  Receipt, Plus, Calendar as CalendarIcon, Filter, Search, X, Download, UploadCloud, 
  Trash2, Edit2, CheckCircle, RefreshCcw, CreditCard, Landmark, Coins, TrendingUp
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { useExpenses } from '../hooks/useExpenses';
import Pagination from '../components/ui/Pagination';
import Toast, { useToast } from '../components/ui/Toast';
import { formatCurrency } from '../utils/currencyFormat';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { writeAuditLog } from '../hooks/useAuditLog';
import { useAuth } from '../context/AuthContext';
import { useRole } from '../hooks/useRole';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Salaries & Wages',
  'Utilities',
  'Supplier / Stock Purchase',
  'Transport & Delivery',
  'Marketing & Advertising',
  'Equipment & Maintenance',
  'Packaging',
  'Insurance',
  'Taxes & Fees',
  'Miscellaneous'
];

export default function Expenses() {
  const { activeBusinessId, currency, timezone } = useBusiness();
  const { user } = useAuth();
  const { role } = useRole();
  const { expenses, loading, addExpense, updateExpense, deleteExpense } = useExpenses();
  const { toast } = useToast();

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('This Month');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  
  const [customDateRange, setCustomDateRange] = useState({ from: '', to: '' });
  
  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState(null);
  const [file, setFile] = useState(null);
  const [customCategory, setCustomCategory] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-generation of recurring expenses
  useEffect(() => {
    const processRecurring = async () => {
      if (!activeBusinessId) return;
      try {
        const q = query(
          collection(db, 'expenses'),
          where('businessId', '==', activeBusinessId),
          where('recurring.enabled', '==', true)
        );
        const snapshot = await getDocs(q);
        const now = new Date();
        
        snapshot.docs.forEach(async (docSnapshot) => {
          const data = docSnapshot.data();
          const nextDateTs = data.recurring.nextDate;
          if (!nextDateTs) return;
          
          const nextDate = nextDateTs.toDate();
          if (now >= nextDate) {
            // Auto generate new expense
            const newExpense = {
              ...data,
              date: nextDate,
              expenseId: undefined, // will auto-gen
              createdAt: serverTimestamp(),
              receiptUrl: null, // don't copy receipt
            };

            // Calculate new nextDate
            const newNext = new Date(nextDate);
            if (data.recurring.frequency === 'weekly') newNext.setDate(newNext.getDate() + 7);
            else if (data.recurring.frequency === 'monthly') newNext.setMonth(newNext.getMonth() + 1);
            else if (data.recurring.frequency === 'yearly') newNext.setFullYear(newNext.getFullYear() + 1);
            
            newExpense.recurring.nextDate = newNext;

            // Add new expense
            const newDocRef = await addDoc(collection(db, 'expenses'), newExpense);
            await updateDoc(newDocRef, { expenseId: newDocRef.id });

            // Update old expense to stop recurring (or just keep it and let the new one carry the flag)
            // It's better to let the chain continue on the NEW document, and disable recurring on the OLD one to prevent duplicates if logic runs twice
            await updateDoc(docSnapshot.ref, { 
              'recurring.enabled': false 
            });

            await writeAuditLog(user, role, 'Recurring expense auto-generated', `Category: ${data.category} Amount: ${data.amount}`, 'Expenses', activeBusinessId);
          }
        });
      } catch (err) {
        console.error("Failed to process recurring expenses:", err);
      }
    };
    
    processRecurring();
  }, [activeBusinessId]);

  const initForm = (expense = null) => {
    if (expense) {
      setFormData({
        date: expense.date.toISOString().split('T')[0],
        amount: expense.amount,
        category: EXPENSE_CATEGORIES.includes(expense.category) ? expense.category : 'Custom',
        paymentMethod: expense.paymentMethod,
        description: expense.description || '',
        recurring: expense.recurring?.enabled || false,
        frequency: expense.recurring?.frequency || 'monthly'
      });
      if (!EXPENSE_CATEGORIES.includes(expense.category)) {
        setCustomCategory(expense.category);
      }
    } else {
      setFormData({
        date: new Date().toLocaleDateString('en-CA', { timeZone: timezone }), // YYYY-MM-DD in local tz
        amount: '',
        category: 'Rent',
        paymentMethod: 'bank_transfer',
        description: '',
        recurring: false,
        frequency: 'monthly'
      });
      setCustomCategory('');
    }
    setFile(null);
    setEditingExpense(expense);
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const cat = formData.category === 'Custom' ? customCategory : formData.category;
    if (!cat) {
      toast('Please specify a category', 'error');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      date: new Date(formData.date),
      amount: parseFloat(formData.amount),
      category: cat,
      paymentMethod: formData.paymentMethod,
      description: formData.description,
      recurring: {
        enabled: formData.recurring,
        frequency: formData.recurring ? formData.frequency : null
      }
    };

    // calculate nextDate if recurring
    if (payload.recurring.enabled) {
      const nextD = new Date(payload.date);
      if (payload.recurring.frequency === 'weekly') nextD.setDate(nextD.getDate() + 7);
      else if (payload.recurring.frequency === 'monthly') nextD.setMonth(nextD.getMonth() + 1);
      else if (payload.recurring.frequency === 'yearly') nextD.setFullYear(nextD.getFullYear() + 1);
      payload.recurring.nextDate = nextD;
    }

    try {
      if (editingExpense) {
        await updateExpense(editingExpense.id, payload, file);
        toast('Expense updated successfully!', 'success');
      } else {
        await addExpense(payload, file);
        toast('Expense recorded successfully!', 'success');
      }
      setShowModal(false);
    } catch (err) {
      toast('Failed to save expense.', 'error');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (exp) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await deleteExpense(exp.id, exp.category, exp.amount);
      toast('Expense deleted', 'success');
    } catch (err) {
      toast('Failed to delete expense', 'error');
    }
  };

  // --- Analytics & Filtering ---
  const filteredExpenses = useMemo(() => {
    let result = expenses;
    
    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(e => e.description?.toLowerCase().includes(q) || e.category.toLowerCase().includes(q));
    }

    // Category
    if (categoryFilter !== 'All') {
      result = result.filter(e => e.category === categoryFilter);
    }

    // Payment Method
    if (paymentFilter !== 'All') {
      result = result.filter(e => e.paymentMethod === paymentFilter);
    }

    // Date
    const now = new Date();
    result = result.filter(e => {
      const d = e.date;
      if (dateFilter === 'Today') {
        return d.toDateString() === now.toDateString();
      } else if (dateFilter === 'This Week') {
        const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
        return d >= firstDay;
      } else if (dateFilter === 'This Month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      } else if (dateFilter === 'This Year') {
        return d.getFullYear() === now.getFullYear();
      } else if (dateFilter === 'Custom') {
        if (customDateRange.from && d < new Date(customDateRange.from)) return false;
        if (customDateRange.to && d > new Date(customDateRange.to)) return false;
        return true;
      }
      return true;
    });

    return result;
  }, [expenses, searchTerm, categoryFilter, paymentFilter, dateFilter, customDateRange]);

  const totalFilteredAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Pagination
  const paginatedData = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE;
    return filteredExpenses.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredExpenses, page]);

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    let monthTotal = 0;
    let yearTotal = 0;
    let largest = null;
    const catCounts = {};

    expenses.forEach(e => {
      const isThisMonth = e.date.getMonth() === now.getMonth() && e.date.getFullYear() === now.getFullYear();
      const isThisYear = e.date.getFullYear() === now.getFullYear();

      if (isThisMonth) {
        monthTotal += e.amount;
        if (!largest || e.amount > largest.amount) largest = e;
        catCounts[e.category] = (catCounts[e.category] || 0) + 1;
      }
      if (isThisYear) {
        yearTotal += e.amount;
      }
    });

    let topCat = 'None';
    let topCatCount = 0;
    for (const [cat, count] of Object.entries(catCounts)) {
      if (count > topCatCount) {
        topCat = cat;
        topCatCount = count;
      }
    }

    return {
      monthTotal,
      yearTotal,
      largest,
      topCat
    };
  }, [expenses]);

  return (
    <div className="min-h-screen pb-20 md:pb-8 pt-6 px-4 md:px-8 max-w-[1600px] mx-auto animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white font-heading">Expense Tracker</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Record and monitor your business expenditures</p>
        </div>
        <button 
          onClick={() => initForm()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2"
        >
          <Plus size={18} /> Add Expense
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/10 rounded-xl"><TrendingUp size={18} className="text-red-500" /></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">This Month</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.monthTotal, currency)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-500/10 rounded-xl"><CalendarIcon size={18} className="text-primary-500" /></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">This Year</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.yearTotal, currency)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-500/10 rounded-xl"><Receipt size={18} className="text-amber-500" /></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Largest Expense</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.largest ? formatCurrency(stats.largest.amount, currency) : '—'}</p>
          <p className="text-xs text-gray-500 truncate mt-1">{stats.largest ? stats.largest.category : ''}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/10 rounded-xl"><Filter size={18} className="text-purple-500" /></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Top Category</p>
          </div>
          <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{stats.topCat}</p>
        </div>
      </div>

      {/* FILTERS */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 rounded-2xl p-4 md:p-6 mb-8 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search descriptions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
          />
        </div>
        
        <select 
          value={dateFilter} 
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 min-w-[140px]"
        >
          <option>All Time</option>
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
          <option>This Year</option>
          <option>Custom</option>
        </select>

        {dateFilter === 'Custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customDateRange.from} onChange={e => setCustomDateRange(prev => ({...prev, from: e.target.value}))} className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
            <span className="text-gray-500 text-sm">to</span>
            <input type="date" value={customDateRange.to} onChange={e => setCustomDateRange(prev => ({...prev, to: e.target.value}))} className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-white" />
          </div>
        )}

        <select 
          value={categoryFilter} 
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 min-w-[160px]"
        >
          <option value="All">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select 
          value={paymentFilter} 
          onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
          className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 min-w-[140px]"
        >
          <option value="All">All Methods</option>
          <option value="cash">Cash</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="card">Card</option>
        </select>
      </div>

      {/* TABLE */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-gray-950/50 border-b border-gray-200 dark:border-white/5">
              <tr>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Date</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Category</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs w-full">Description</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Method</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs text-right">Amount</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs text-center">Receipt</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center mb-3">
                      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                    Loading expenses...
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">No expenses found for current filters.</td>
                </tr>
              ) : (
                paginatedData.map((expense) => (
                  <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 text-gray-800 dark:text-gray-300">
                      <div className="flex items-center gap-2">
                        {expense.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {expense.recurring?.enabled && <RefreshCcw size={12} className="text-primary-500" title={`Recurring ${expense.recurring.frequency}`} />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold">
                        {expense.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400 truncate max-w-[200px]" title={expense.description}>
                      {expense.description || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wider font-bold">
                        {expense.paymentMethod === 'cash' && <Coins size={14} />}
                        {expense.paymentMethod === 'bank_transfer' && <Landmark size={14} />}
                        {expense.paymentMethod === 'card' && <CreditCard size={14} />}
                        {expense.paymentMethod.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                      {formatCurrency(expense.amount, currency)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {expense.receiptUrl ? (
                        <a href={expense.receiptUrl} target="_blank" rel="noreferrer" className="inline-block p-1.5 bg-primary-500/10 text-primary-500 rounded-lg hover:bg-primary-500/20 transition-colors">
                          <Receipt size={16} />
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => initForm(expense)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(expense)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Footer Totals & Pagination */}
        <div className="bg-gray-50 dark:bg-gray-950/50 p-4 border-t border-gray-200 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm font-bold text-gray-500 uppercase tracking-wider">
            Total for current filter: <span className="text-gray-900 dark:text-white text-base ml-2">{formatCurrency(totalFilteredAmount, currency)}</span>
          </div>
          <Pagination 
            currentPage={page}
            totalPages={Math.ceil(filteredExpenses.length / PAGE_SIZE)}
            totalCount={filteredExpenses.length}
            pageSize={PAGE_SIZE}
            onNext={() => setPage(p => p + 1)}
            onPrevious={() => setPage(p => p - 1)}
          />
        </div>
      </div>

      {/* MODAL */}
      {showModal && formData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-[slideUp_0.2s_ease-out] flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-white/10 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white font-heading">
                {editingExpense ? 'Edit Expense' : 'Record Expense'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-white transition-colors rounded-xl hover:bg-white/5">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <form id="expenseForm" onSubmit={handleSave} className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Date</label>
                    <input 
                      type="date" 
                      required
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Amount ({currency})</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={formData.amount}
                      onChange={(e) => setFormData({...formData, amount: e.target.value})}
                      placeholder="0.00"
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Category</label>
                    <select 
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                    >
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="Custom">+ Add Custom</option>
                    </select>
                    {formData.category === 'Custom' && (
                      <input 
                        type="text" 
                        required
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="Custom category name..."
                        className="w-full mt-2 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-primary-500"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Method</label>
                    <div className="flex bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden p-1">
                      {['cash', 'bank_transfer', 'card'].map((method) => (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setFormData({...formData, paymentMethod: method})}
                          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${formData.paymentMethod === method ? 'bg-primary-600 text-white shadow-md' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                        >
                          {method.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Description (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="e.g. Monthly rent payment — Dubai Design District"
                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 dark:bg-gray-950/50 p-4 border border-gray-200 dark:border-white/5 rounded-xl">
                  {/* File Upload */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Receipt / Attachment</label>
                    <input 
                      type="file" 
                      accept=".jpg,.jpeg,.png,.pdf"
                      onChange={(e) => {
                        const f = e.target.files[0];
                        if (f && f.size > 5 * 1024 * 1024) {
                          toast('File too large (Max 5MB)', 'error');
                          e.target.value = '';
                          return;
                        }
                        setFile(f);
                      }}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-600 hover:file:bg-primary-100 dark:file:bg-primary-500/10 dark:file:text-primary-400 dark:hover:file:bg-primary-500/20 transition-colors"
                    />
                    {editingExpense?.receiptUrl && !file && (
                      <p className="text-xs text-primary-400 mt-2 flex items-center gap-1">
                        <CheckCircle size={12} /> Existing receipt attached
                      </p>
                    )}
                  </div>

                  {/* Recurring Toggle */}
                  <div className="flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recurring Expense</label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={formData.recurring} onChange={e => setFormData({...formData, recurring: e.target.checked})} />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                      </label>
                    </div>
                    {formData.recurring && (
                      <select 
                        value={formData.frequency}
                        onChange={(e) => setFormData({...formData, frequency: e.target.value})}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    )}
                  </div>
                </div>

              </form>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-white/10 flex justify-end gap-3 shrink-0">
              <button 
                type="button" 
                onClick={() => setShowModal(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="expenseForm"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
