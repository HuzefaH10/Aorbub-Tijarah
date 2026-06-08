import React, { useState, useMemo } from 'react';
import { 
  Truck, Plus, Search, X, Edit2, Trash2, Eye, Building2, MapPin, Phone, 
  Mail, Calendar, Box, DollarSign, Wallet, TrendingUp
} from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { useSuppliers } from '../hooks/useSuppliers';
import { useExpenses } from '../hooks/useExpenses';
import { useProducts } from '../hooks/useFirestore';
import { formatCurrency } from '../utils/currencyFormat';
import Toast, { useToast } from '../components/ui/Toast';
import { useNavigate } from 'react-router-dom';

const PAYMENT_TERMS = ['Immediate', '7 Days', '15 Days', '30 Days', '60 Days', 'Custom'];

export default function Suppliers() {
  const { currency } = useBusiness();
  const { suppliers, loading, addSupplier, updateSupplier, deleteSupplier } = useSuppliers();
  const { expenses } = useExpenses();
  const { products } = useProducts();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal & Drawer State
  const [showModal, setShowModal] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [editingSupplier, setEditingSupplier] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Supplier Metrics Logic
  const supplierMetrics = useMemo(() => {
    const metrics = {};
    suppliers.forEach(s => {
      metrics[s.id] = { totalPaid: 0, outstanding: 0, expenses: [] };
    });

    expenses.forEach(exp => {
      if (exp.supplierId && metrics[exp.supplierId]) {
        metrics[exp.supplierId].expenses.push(exp);
        if (exp.status === 'paid') {
          metrics[exp.supplierId].totalPaid += exp.amount;
        } else if (exp.status === 'unpaid') {
          metrics[exp.supplierId].outstanding += exp.amount;
        }
      }
    });
    return metrics;
  }, [suppliers, expenses]);

  // Overall Stats
  const stats = useMemo(() => {
    const now = new Date();
    let totalPaidThisMonth = 0;
    let totalOutstanding = 0;

    expenses.forEach(exp => {
      if (exp.supplierId) {
        if (exp.status === 'unpaid') {
          totalOutstanding += exp.amount;
        } else if (exp.status === 'paid') {
          const isThisMonth = exp.date.getMonth() === now.getMonth() && exp.date.getFullYear() === now.getFullYear();
          if (isThisMonth) {
            totalPaidThisMonth += exp.amount;
          }
        }
      }
    });

    return {
      totalSuppliers: suppliers.length,
      totalPaidThisMonth,
      totalOutstanding
    };
  }, [suppliers, expenses]);

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm) return suppliers;
    const q = searchTerm.toLowerCase();
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(q) || 
      (s.contactPerson && s.contactPerson.toLowerCase().includes(q))
    );
  }, [suppliers, searchTerm]);

  const initForm = (supplier = null) => {
    if (supplier) {
      setFormData({
        name: supplier.name,
        contactPerson: supplier.contactPerson || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        productsSupplied: supplier.productsSupplied || [],
        paymentTerms: supplier.paymentTerms || 'Immediate',
        address: supplier.address || '',
        notes: supplier.notes || ''
      });
    } else {
      setFormData({
        name: '',
        contactPerson: '',
        phone: '',
        email: '',
        productsSupplied: [],
        paymentTerms: 'Immediate',
        address: '',
        notes: ''
      });
    }
    setEditingSupplier(supplier);
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast('Supplier name is required', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, formData);
        toast('Supplier updated successfully', 'success');
        if (selectedSupplier?.id === editingSupplier.id) {
          setSelectedSupplier({ ...editingSupplier, ...formData });
        }
      } else {
        await addSupplier(formData);
        toast('Supplier added successfully', 'success');
      }
      setShowModal(false);
    } catch (err) {
      toast('Failed to save supplier', 'error');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (supplier) => {
    const hasExpenses = supplierMetrics[supplier.id]?.expenses.length > 0;
    if (hasExpenses) {
      toast('Cannot delete a supplier with linked expenses.', 'error');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${supplier.name}?`)) return;
    try {
      await deleteSupplier(supplier.id, supplier.name);
      toast('Supplier deleted', 'success');
      if (selectedSupplier?.id === supplier.id) setShowDrawer(false);
    } catch (err) {
      toast('Failed to delete supplier', 'error');
    }
  };

  const handleProductToggle = (productId) => {
    setFormData(prev => {
      const isSelected = prev.productsSupplied.includes(productId);
      return {
        ...prev,
        productsSupplied: isSelected 
          ? prev.productsSupplied.filter(id => id !== productId)
          : [...prev.productsSupplied, productId]
      };
    });
  };

  return (
    <div className="min-h-screen pb-20 md:pb-8 pt-6 px-4 md:px-8 max-w-[1600px] mx-auto animate-fadeIn relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white font-heading flex items-center gap-2">Supplier Management <ProBadge /></h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your suppliers and track payments</p>
        </div>
        <button 
          onClick={() => initForm()}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 transition-all flex items-center gap-2"
        >
          <Plus size={18} /> Add Supplier
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-xl"><Truck size={18} className="text-blue-500" /></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Suppliers</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalSuppliers}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/10 rounded-xl"><Wallet size={18} className="text-green-500" /></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Paid This Month</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.totalPaidThisMonth, currency)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 p-6 rounded-2xl flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-500/10 rounded-xl"><TrendingUp size={18} className="text-red-500" /></div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Outstanding Payments</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(stats.totalOutstanding, currency)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 rounded-2xl p-4 md:p-6 mb-8">
        <div className="relative max-w-md w-full">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search suppliers by name or contact..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
          />
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-gray-950/50 border-b border-gray-200 dark:border-white/5">
              <tr>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Supplier Name</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Contact Person</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Phone</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Products</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs text-right">Total Paid</th>
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs text-right">Outstanding</th>
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
                    Loading suppliers...
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">No suppliers found.</td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const m = supplierMetrics[supplier.id] || { totalPaid: 0, outstanding: 0 };
                  const linkedProds = products.filter(p => supplier.productsSupplied?.includes(p.id));
                  const prodText = linkedProds.length > 0 
                    ? linkedProds.slice(0, 2).map(p => p.name).join(', ') + (linkedProds.length > 2 ? ` +${linkedProds.length - 2} more` : '')
                    : '—';

                  return (
                    <tr key={supplier.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-600 font-bold">
                            {supplier.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-bold text-gray-900 dark:text-white">{supplier.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{supplier.contactPerson || '—'}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{supplier.phone || '—'}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                        <span className="truncate max-w-[150px] inline-block" title={linkedProds.map(p=>p.name).join(', ')}>
                          {prodText}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(m.totalPaid, currency)}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-red-600 dark:text-red-400">
                        {m.outstanding > 0 ? formatCurrency(m.outstanding, currency) : '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => { setSelectedSupplier(supplier); setShowDrawer(true); }} className="p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-500/10 rounded-lg transition-colors" title="View details">
                            <Eye size={16} />
                          </button>
                          <button onClick={() => initForm(supplier)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" title="Edit">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(supplier)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD/EDIT SUPPLIER */}
      {showModal && formData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-[slideUp_0.2s_ease-out] flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-white/10 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white font-heading">
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-white transition-colors rounded-xl hover:bg-white/5">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
              <form id="supplierForm" onSubmit={handleSave} className="space-y-6">
                
                {/* Row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Supplier Name *</label>
                    <input 
                      type="text" 
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      placeholder="e.g. Fresh Foods LLC"
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Contact Person (Optional)</label>
                    <input 
                      type="text" 
                      value={formData.contactPerson}
                      onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                      placeholder="e.g. John Doe"
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Row 2 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Phone Number (Optional)</label>
                    <input 
                      type="text" 
                      value={formData.phone}
                      onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      placeholder="+1 234 567 890"
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email (Optional)</label>
                    <input 
                      type="email" 
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      placeholder="john@freshfoods.com"
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Row 3 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Products Supplied (Optional)</label>
                    <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl max-h-[150px] overflow-y-auto p-2">
                      {products.length === 0 ? (
                        <p className="text-xs text-gray-500 p-2">No products available. Add some in Inventory.</p>
                      ) : (
                        products.map(p => (
                          <label key={p.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={formData.productsSupplied.includes(p.id)}
                              onChange={() => handleProductToggle(p.id)}
                              className="w-3.5 h-3.5 accent-primary-600 rounded"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Payment Terms</label>
                    <select 
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({...formData, paymentTerms: e.target.value})}
                      className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                    >
                      {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 4 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Address (Optional)</label>
                  <input 
                    type="text" 
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    placeholder="Physical address"
                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notes (Optional)</label>
                  <textarea 
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Any additional notes about this supplier..."
                    rows={3}
                    className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition-colors resize-none"
                  />
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
                form="supplierForm"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER: VIEW SUPPLIER DETAILS */}
      <div 
        className={`fixed inset-y-0 right-0 w-full md:w-[500px] bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-white/10 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          showDrawer ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedSupplier && (() => {
          const m = supplierMetrics[selectedSupplier.id] || { totalPaid: 0, outstanding: 0, expenses: [] };
          const linkedProds = products.filter(p => selectedSupplier.productsSupplied?.includes(p.id));
          const supplierExpenses = m.expenses.sort((a, b) => b.date - a.date);

          return (
            <>
              {/* Drawer Header */}
              <div className="p-6 border-b border-gray-200 dark:border-white/10 shrink-0 relative bg-gray-50 dark:bg-gray-950/50">
                <button onClick={() => setShowDrawer(false)} className="absolute top-6 right-6 p-2 bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full shadow-sm transition-colors">
                  <X size={20} />
                </button>
                <div className="flex items-center gap-4 pr-12">
                  <div className="w-16 h-16 rounded-2xl bg-primary-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary-500/30">
                    {selectedSupplier.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white font-heading">{selectedSupplier.name}</h2>
                    <p className="text-sm text-gray-500">Supplier since {new Date(selectedSupplier.createdAt?.toDate()).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                
                {/* Contact & Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Contact Person</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"><Building2 size={14} className="text-gray-400" /> {selectedSupplier.contactPerson || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Payment Terms</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"><Calendar size={14} className="text-gray-400" /> {selectedSupplier.paymentTerms}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Phone</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {selectedSupplier.phone || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Email</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"><Mail size={14} className="text-gray-400" /> {selectedSupplier.email || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Address</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2"><MapPin size={14} className="text-gray-400" /> {selectedSupplier.address || '—'}</p>
                  </div>
                </div>

                {/* Products Supplied */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2"><Box size={16} className="text-primary-500" /> Products Supplied</h3>
                  <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden">
                    {linkedProds.length === 0 ? (
                      <p className="text-sm text-gray-500 p-4">No products linked.</p>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-white/5">
                        {linkedProds.map(p => (
                          <li key={p.id} className="p-3 flex justify-between items-center text-sm">
                            <span className="text-gray-800 dark:text-gray-200 font-medium">{p.name}</span>
                            <span className="text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">{p.currentStock} {p.unit} in stock</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Payment History */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2"><DollarSign size={16} className="text-green-500" /> Payment History</h3>
                    <button 
                      onClick={() => navigate('/expenses', { state: { prefillSupplierId: selectedSupplier.id } })}
                      className="text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1"
                    >
                      <Plus size={14} /> Record Payment
                    </button>
                  </div>
                  
                  {/* Ledger mini summary */}
                  <div className="flex gap-4 mb-3 p-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/5 rounded-xl">
                    <div className="flex-1">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Total Paid</p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(m.totalPaid, currency)}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Outstanding</p>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(m.outstanding, currency)}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                    {supplierExpenses.length === 0 ? (
                      <p className="text-sm text-gray-500 p-4">No expenses recorded for this supplier.</p>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-white/5">
                        {supplierExpenses.map(exp => (
                          <li key={exp.id} className="p-3 text-sm flex justify-between items-start gap-3">
                            <div>
                              <p className="text-gray-900 dark:text-white font-medium">{exp.description || exp.category}</p>
                              <p className="text-xs text-gray-500">{exp.date.toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(exp.amount, currency)}</p>
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-1 inline-block ${
                                exp.status === 'paid' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                              }`}>
                                {exp.status}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

              </div>
            </>
          );
        })()}
      </div>

      {/* Backdrop for drawer */}
      {showDrawer && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity" onClick={() => setShowDrawer(false)} />
      )}
    </div>
  );
}
