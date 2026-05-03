import { useState, useMemo } from 'react';
import { useEntries, useProducts } from '../hooks/useFirestore';
import { SummaryCard, Card } from '../components/ui/Card';
import Toast, { useToast } from '../components/ui/Toast';
import { PasswordModal } from '../components/ui/Modal';
import { DollarSign, TrendingUp, TrendingDown, Percent } from 'lucide-react';

export default function ProfitOptimization() {
  const { entries, addEntry, updateEntry, deleteEntry } = useEntries();
  const { products } = useProducts();
  const { toast, showToast, hideToast } = useToast();
  const [pwModal, setPwModal] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});

  const cats = [...new Set([...products.map(p => p.category), ...entries.map(e => e.category)])].filter(Boolean);
  const prodNames = [...new Set([...products.map(p => p.name), ...entries.map(e => e.product)])].filter(Boolean);

  const blank = { date: '', dateEnd: '', product: '', category: '', quantitySold: '', revenue: '', cost: '', stockAdded: '', stockRemaining: '', isRange: false };
  const [f, setF] = useState(blank);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.date || !f.product || !f.category || !f.quantitySold || !f.revenue || !f.cost || f.stockRemaining === '') {
      showToast('All fields required', 'error'); return;
    }
    if (+f.quantitySold < 0 || +f.revenue < 0 || +f.cost < 0) {
      showToast('Numbers must be positive', 'error'); return;
    }
    const dates = [];
    if (f.isRange && f.dateEnd) {
      let d = new Date(f.date); const end = new Date(f.dateEnd);
      while (d <= end) { dates.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    } else dates.push(f.date);

    try {
      for (const dt of dates) {
        await addEntry({ date: dt, product: f.product, category: f.category, quantitySold: +f.quantitySold, revenue: +f.revenue, cost: +f.cost, stockAdded: +(f.stockAdded || 0), stockRemaining: +f.stockRemaining });
      }
      setF(blank);
      showToast(`${dates.length} entry(s) added`);
    } catch { showToast('Error saving', 'error'); }
  };

  const confirmPw = (action, id) => setPwModal({ action, id });
  const onPwConfirm = () => {
    if (pwModal.action === 'delete') { deleteEntry(pwModal.id); showToast('Entry deleted'); }
    if (pwModal.action === 'edit') { const e = entries.find(x => x.id === pwModal.id); setEditId(pwModal.id); setEditData({ ...e }); }
    setPwModal(null);
  };
  const saveEdit = async () => {
    await updateEntry(editId, { ...editData, quantitySold: +editData.quantitySold, revenue: +editData.revenue, cost: +editData.cost, stockAdded: +editData.stockAdded, stockRemaining: +editData.stockRemaining });
    setEditId(null); showToast('Entry updated');
  };

  const { totalRev, totalCost, totalProfit, margin, insights, marginTable } = useMemo(() => {
    const totalRev = entries.reduce((s, e) => s + e.revenue, 0);
    const totalCost = entries.reduce((s, e) => s + e.cost, 0);
    const totalProfit = totalRev - totalCost;
    const margin = totalRev ? (totalProfit / totalRev * 100) : 0;

    const ps = {};
    entries.forEach(e => {
      if (!ps[e.product]) ps[e.product] = { rev: 0, cost: 0, qty: 0, losses: 0 };
      ps[e.product].rev += e.revenue; ps[e.product].cost += e.cost;
      ps[e.product].qty += e.quantitySold;
      if (e.revenue - e.cost < 0) ps[e.product].losses++;
    });
    const prods = Object.entries(ps);
    const highRev = [...prods].sort((a, b) => b[1].rev - a[1].rev)[0];
    const lowMargin = prods.filter(([, s]) => s.rev > 0).sort((a, b) => (a[1].rev - a[1].cost) / a[1].rev - (b[1].rev - b[1].cost) / b[1].rev)[0];
    const bestQty = [...prods].sort((a, b) => b[1].qty - a[1].qty)[0];
    const repeatLoss = prods.filter(([, s]) => s.losses >= 3);
    const insights = { highRev, lowMargin, bestQty, repeatLoss };

    const marginTable = Object.entries(ps).map(([p, s]) => ({ product: p, rev: s.rev, cost: s.cost, profit: s.rev - s.cost, margin: s.rev ? (s.rev - s.cost) / s.rev * 100 : 0 }));

    return { totalRev, totalCost, totalProfit, margin, insights, marginTable };
  }, [entries]);

  const inputCls = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-all bg-white dark:bg-gray-950 text-gray-800 dark:text-white";
  const labelCls = "block text-xs font-medium text-gray-400 dark:text-gray-500 mb-1";

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {pwModal && <PasswordModal onConfirm={onPwConfirm} onCancel={() => setPwModal(null)} />}

      {/* Data Entry Form */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">Add Entry</h3>
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className={labelCls}>Date</label><input type="date" value={f.date} onChange={e => set('date', e.target.value)} className={inputCls} /></div>
          <div className="flex flex-col"><label className="flex items-center gap-2 text-xs font-medium text-gray-400 dark:text-gray-500 mb-1"><input type="checkbox" checked={f.isRange} onChange={e => set('isRange', e.target.checked)} className="accent-primary-500 rounded" /> Date Range</label>{f.isRange && <input type="date" value={f.dateEnd} onChange={e => set('dateEnd', e.target.value)} className={inputCls} />}</div>
          <div><label className={labelCls}>Product</label><input list="pl" value={f.product} onChange={e => set('product', e.target.value)} className={inputCls} placeholder="Select or type" /><datalist id="pl">{prodNames.map(p => <option key={p} value={p} />)}</datalist></div>
          <div><label className={labelCls}>Category</label><input list="cl" value={f.category} onChange={e => set('category', e.target.value)} className={inputCls} placeholder="Select or type" /><datalist id="cl">{cats.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label className={labelCls}>Qty Sold</label><input type="number" min="0" value={f.quantitySold} onChange={e => set('quantitySold', e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Revenue ($)</label><input type="number" min="0" value={f.revenue} onChange={e => set('revenue', e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Cost ($)</label><input type="number" min="0" value={f.cost} onChange={e => set('cost', e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Stock Added</label><input type="number" min="0" value={f.stockAdded} onChange={e => set('stockAdded', e.target.value)} className={inputCls} /></div>
          <div><label className={labelCls}>Stock Remaining</label><input type="number" min="0" value={f.stockRemaining} onChange={e => set('stockRemaining', e.target.value)} className={inputCls} /></div>
          <div className="flex items-end"><button type="submit" className="w-full bg-primary-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors">Add Entry</button></div>
        </form>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Revenue" value={`$${totalRev.toLocaleString()}`} color="text-primary-700 dark:text-primary-400" icon={<DollarSign size={20} />} />
        <SummaryCard label="Total Cost" value={`$${totalCost.toLocaleString()}`} icon={<TrendingDown size={20} />} />
        <SummaryCard label="Total Profit" value={`$${totalProfit.toLocaleString()}`} color={totalProfit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} icon={<TrendingUp size={20} />} />
        <SummaryCard label="Overall Margin" value={`${margin.toFixed(1)}%`} color={margin >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} icon={<Percent size={20} />} />
      </div>

      {/* Insights */}
      {entries.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Insights</h3>
          <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
            {insights.highRev && <p>📈 <span className="text-primary-600 dark:text-primary-400 font-semibold">{insights.highRev[0]}</span> generates highest revenue (${insights.highRev[1].rev.toLocaleString()})</p>}
            {insights.lowMargin && <p>📉 <span className="text-primary-600 dark:text-primary-400 font-semibold">{insights.lowMargin[0]}</span> has lowest margin ({((insights.lowMargin[1].rev - insights.lowMargin[1].cost) / insights.lowMargin[1].rev * 100).toFixed(1)}%)</p>}
            {insights.bestQty && <p>🏆 <span className="text-primary-600 dark:text-primary-400 font-semibold">{insights.bestQty[0]}</span> is your best seller by quantity</p>}
            {totalProfit < 0 ? <p className="text-red-500 dark:text-red-400 font-medium">⚠️ Your business is currently at a loss</p> : <p className="text-green-600 dark:text-green-400 font-medium">✅ Business is profitable overall</p>}
            {insights.repeatLoss.map(([p]) => <p key={p} className="text-amber-600 dark:text-amber-500">🔁 {p} has appeared in loss 3+ times — review pricing</p>)}
          </div>
        </Card>
      )}

      {/* Data Table */}
      <Card className="overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">All Entries</h3>
        {entries.length === 0 ? <p className="text-gray-400 text-center py-8 text-sm">No data yet — add your first entry above</p> :
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400 dark:text-gray-500 text-xs border-b border-gray-100 dark:border-gray-800"><th className="text-left pb-2">Date</th><th className="text-left pb-2">Product</th><th className="text-left pb-2">Category</th><th className="text-right pb-2">Qty</th><th className="text-right pb-2">Revenue</th><th className="text-right pb-2">Cost</th><th className="text-right pb-2">Profit</th><th className="text-right pb-2">Margin%</th><th className="text-right pb-2">Stock</th><th className="text-right pb-2">Actions</th></tr></thead>
          <tbody>{[...entries].map(e => {
            const profit = e.revenue - e.cost;
            const mg = e.revenue ? (profit / e.revenue * 100) : 0;
            if (editId === e.id) return (
              <tr key={e.id} className="border-b border-gray-50 dark:border-gray-800/50 bg-primary-50/30 dark:bg-primary-900/10">
                <td className="py-1.5"><input type="date" value={editData.date} onChange={ev => setEditData(p => ({ ...p, date: ev.target.value }))} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-lg px-2 py-1 text-xs w-28 outline-none" /></td>
                <td className="py-1.5"><input value={editData.product} onChange={ev => setEditData(p => ({ ...p, product: ev.target.value }))} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-lg px-2 py-1 text-xs w-24 outline-none" /></td>
                <td className="py-1.5"><input value={editData.category} onChange={ev => setEditData(p => ({ ...p, category: ev.target.value }))} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-lg px-2 py-1 text-xs w-20 outline-none" /></td>
                <td className="py-1.5"><input type="number" value={editData.quantitySold} onChange={ev => setEditData(p => ({ ...p, quantitySold: ev.target.value }))} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-lg px-2 py-1 text-xs w-14 outline-none text-right" /></td>
                <td className="py-1.5"><input type="number" value={editData.revenue} onChange={ev => setEditData(p => ({ ...p, revenue: ev.target.value }))} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-lg px-2 py-1 text-xs w-20 outline-none text-right" /></td>
                <td className="py-1.5"><input type="number" value={editData.cost} onChange={ev => setEditData(p => ({ ...p, cost: ev.target.value }))} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-lg px-2 py-1 text-xs w-20 outline-none text-right" /></td>
                <td /><td /><td className="py-1.5"><input type="number" value={editData.stockRemaining} onChange={ev => setEditData(p => ({ ...p, stockRemaining: ev.target.value }))} className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-800 dark:text-white rounded-lg px-2 py-1 text-xs w-14 outline-none text-right" /></td>
                <td className="py-1.5 text-right"><button onClick={saveEdit} className="text-xs bg-primary-600 text-white px-2.5 py-1 rounded-lg mr-1 hover:bg-primary-700">Save</button><button onClick={() => setEditId(null)} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">Cancel</button></td>
              </tr>
            );
            return (
              <tr key={e.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="py-2.5 text-gray-800 dark:text-gray-200">{e.date}</td><td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{e.product}</td><td className="py-2.5 text-gray-400 dark:text-gray-500">{e.category}</td>
                <td className="py-2.5 text-right text-gray-800 dark:text-gray-200">{e.quantitySold}</td><td className="py-2.5 text-right text-primary-600 dark:text-primary-400 font-semibold">${e.revenue.toLocaleString()}</td>
                <td className="py-2.5 text-right text-gray-500 dark:text-gray-400">${e.cost.toLocaleString()}</td>
                <td className={`py-2.5 text-right font-semibold ${profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>${profit.toLocaleString()}</td>
                <td className="py-2.5 text-right text-gray-400 dark:text-gray-500">{mg.toFixed(1)}%</td>
                <td className="py-2.5 text-right text-gray-800 dark:text-gray-200">{e.stockRemaining}</td>
                <td className="py-2.5 text-right"><button onClick={() => confirmPw('edit', e.id)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline mr-2 font-medium">Edit</button><button onClick={() => confirmPw('delete', e.id)} className="text-xs text-red-500 hover:underline font-medium">Delete</button></td>
              </tr>
            );
          })}</tbody>
        </table>}
      </Card>

      {/* Margin Table */}
      {marginTable.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Profit Margin by Product</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 dark:text-gray-500 text-xs border-b border-gray-100 dark:border-gray-800"><th className="text-left pb-2">Product</th><th className="text-right pb-2">Revenue</th><th className="text-right pb-2">Cost</th><th className="text-right pb-2">Profit</th><th className="text-right pb-2">Margin%</th></tr></thead>
            <tbody>{marginTable.map(m => (
              <tr key={m.product} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{m.product}</td>
                <td className="py-2.5 text-right text-primary-600 dark:text-primary-400 font-semibold">${m.rev.toLocaleString()}</td>
                <td className="py-2.5 text-right text-gray-500 dark:text-gray-400">${m.cost.toLocaleString()}</td>
                <td className={`py-2.5 text-right font-semibold ${m.profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>${m.profit.toLocaleString()}</td>
                <td className="py-2.5 text-right text-gray-400 dark:text-gray-500">{m.margin.toFixed(1)}%</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
