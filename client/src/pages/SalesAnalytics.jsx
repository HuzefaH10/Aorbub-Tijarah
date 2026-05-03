import { useMemo, useRef, useEffect } from 'react';
import { useEntries } from '../hooks/useFirestore';
import { SummaryCard } from '../components/ui/Card';
import { Card } from '../components/ui/Card';
import { DollarSign, ShoppingCart, TrendingUp, Star } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export default function SalesAnalytics() {
  const { entries, loading } = useEntries();
  const c1 = useRef(), c2 = useRef(), c3 = useRef();
  const ch1 = useRef(), ch2 = useRef(), ch3 = useRef();

  /* Computed data */
  const data = useMemo(() => {
    const totalRev = entries.reduce((s, e) => s + (e.revenue || 0), 0);
    const totalOrders = entries.length;
    const avgOrder = totalOrders ? totalRev / totalOrders : 0;

    const prodRevMap = {};
    const catMap = {};
    const prodQty = {};
    entries.forEach(e => {
      prodRevMap[e.product] = (prodRevMap[e.product] || 0) + e.revenue;
      catMap[e.category] = (catMap[e.category] || 0) + e.revenue;
      prodQty[e.product] = (prodQty[e.product] || 0) + e.quantitySold;
    });
    const bestProduct = Object.keys(prodRevMap).sort((a, b) => prodRevMap[b] - prodRevMap[a])[0] || 'N/A';

    // Daily rev last 30 days
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    const dailyRev = days.map(d => entries.filter(e => e.date === d).reduce((s, e) => s + e.revenue, 0));

    // Top 5
    const top5 = Object.entries(prodRevMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Week comparison
    const ws = d => { const dd = new Date(d); dd.setDate(dd.getDate() - dd.getDay()); return dd.toISOString().split('T')[0]; };
    const twStart = ws(today), lwStart = ws(new Date(today.getTime() - 7 * 86400000));
    const twEntries = entries.filter(e => e.date >= twStart);
    const lwEntries = entries.filter(e => e.date >= lwStart && e.date < twStart);
    const twRev = twEntries.reduce((s, e) => s + e.revenue, 0);
    const lwRev = lwEntries.reduce((s, e) => s + e.revenue, 0);
    const twProfit = twEntries.reduce((s, e) => s + (e.revenue - e.cost), 0);
    const lwProfit = lwEntries.reduce((s, e) => s + (e.revenue - e.cost), 0);

    // Velocity
    const prodDates = {};
    entries.forEach(e => { if (!prodDates[e.product]) prodDates[e.product] = new Set(); prodDates[e.product].add(e.date); });
    const velocity = Object.entries(prodQty).map(([p, q]) => ({ product: p, avg: (q / (prodDates[p]?.size || 1)).toFixed(1) }));

    return { totalRev, totalOrders, avgOrder, bestProduct, prodRevMap, catMap, prodQty, days, dailyRev, top5, twRev, lwRev, twProfit, lwProfit, velocity };
  }, [entries]);

  /* Charts */
  useEffect(() => {
    if (!entries.length) return;
    const mk = (ref, cref, cfg) => { if (cref.current) cref.current.destroy(); if (ref.current) cref.current = new Chart(ref.current, cfg); };

    mk(c1, ch1, { type: 'line', data: { labels: data.days.map(d => d.slice(5)), datasets: [{ label: 'Revenue', data: data.dailyRev, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.4, pointRadius: 2, pointBackgroundColor: '#3b82f6' }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#64748b', font: { size: 12 } } } }, scales: { x: { ticks: { color: '#94a3b8', maxTicksLimit: 10 }, grid: { color: '#f1f5f9' } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#f1f5f9' } } } } });

    const prods = Object.keys(data.prodRevMap);
    mk(c2, ch2, { type: 'bar', data: { labels: prods, datasets: [{ label: 'Revenue', data: prods.map(p => data.prodRevMap[p]), backgroundColor: 'rgba(59,130,246,0.6)', borderRadius: 8, barThickness: 28 }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#64748b' } } }, scales: { x: { ticks: { color: '#94a3b8' }, grid: { display: false } }, y: { ticks: { color: '#94a3b8' }, grid: { color: '#f1f5f9' } } } } });

    const cats = Object.keys(data.catMap);
    mk(c3, ch3, { type: 'doughnut', data: { labels: cats, datasets: [{ data: cats.map(c => data.catMap[c]), backgroundColor: ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'], borderWidth: 0 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#64748b', padding: 16 } } } } });

    return () => { [ch1, ch2, ch3].forEach(r => r.current?.destroy()); };
  }, [entries, data]);

  if (loading) return <div className="flex items-center justify-center h-[60vh]"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!entries.length) return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400">
      <ShoppingCart size={48} className="mb-4 text-gray-300" />
      <p className="text-lg font-medium text-gray-500 mb-1">No sales data yet</p>
      <p className="text-sm">Add entries in Profit Optimization to see analytics</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Revenue" value={`$${data.totalRev.toLocaleString()}`} color="text-primary-700" icon={<DollarSign size={20} />} />
        <SummaryCard label="Total Orders" value={data.totalOrders} icon={<ShoppingCart size={20} />} />
        <SummaryCard label="Avg Order Value" value={`$${data.avgOrder.toFixed(2)}`} icon={<TrendingUp size={20} />} />
        <SummaryCard label="Best Seller" value={data.bestProduct} color="text-primary-700" icon={<Star size={20} />} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Daily Revenue (30 days)</h3><canvas ref={c1} /></Card>
        <Card><h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Revenue by Product</h3><canvas ref={c2} /></Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Category Sales Split</h3><div className="max-w-[300px] mx-auto"><canvas ref={c3} /></div></Card>
        <Card>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Top 5 Products</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 dark:text-gray-500 text-xs border-b border-gray-100 dark:border-gray-800"><th className="text-left pb-2">#</th><th className="text-left pb-2">Product</th><th className="text-right pb-2">Qty</th><th className="text-right pb-2">Revenue</th><th className="text-right pb-2">%</th></tr></thead>
            <tbody>{data.top5.map(([p, r], i) => (
              <tr key={p} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="py-2.5 text-gray-400 dark:text-gray-500">{i + 1}</td>
                <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{p}</td>
                <td className="py-2.5 text-right text-gray-500 dark:text-gray-400">{data.prodQty[p]}</td>
                <td className="py-2.5 text-right text-primary-600 dark:text-primary-400 font-semibold">${r.toLocaleString()}</td>
                <td className="py-2.5 text-right text-gray-400 dark:text-gray-500">{(r / data.totalRev * 100).toFixed(1)}%</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </div>

      {/* Week Comparison + Velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Week Comparison</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 dark:text-gray-500 text-xs border-b border-gray-100 dark:border-gray-800"><th className="text-left pb-2">Metric</th><th className="text-right pb-2">This Week</th><th className="text-right pb-2">Last Week</th></tr></thead>
            <tbody>
              <tr className="border-b border-gray-50 dark:border-gray-800/50"><td className="py-2.5 text-gray-800 dark:text-gray-200">Revenue</td><td className="py-2.5 text-right text-primary-600 dark:text-primary-400 font-semibold">${data.twRev.toLocaleString()}</td><td className="py-2.5 text-right text-gray-500 dark:text-gray-400">${data.lwRev.toLocaleString()}</td></tr>
              <tr className="border-b border-gray-50 dark:border-gray-800/50"><td className="py-2.5 text-gray-800 dark:text-gray-200">Profit</td><td className="py-2.5 text-right text-green-600 dark:text-green-400 font-semibold">${data.twProfit.toLocaleString()}</td><td className="py-2.5 text-right text-gray-500 dark:text-gray-400">${data.lwProfit.toLocaleString()}</td></tr>
            </tbody>
          </table>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Sales Velocity (Avg Qty/Day)</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-gray-400 dark:text-gray-500 text-xs border-b border-gray-100 dark:border-gray-800"><th className="text-left pb-2">Product</th><th className="text-right pb-2">Avg/Day</th></tr></thead>
            <tbody>{data.velocity.map(v => (
              <tr key={v.product} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="py-2.5 text-gray-800 dark:text-gray-200">{v.product}</td><td className="py-2.5 text-right text-primary-600 dark:text-primary-400 font-semibold">{v.avg}</td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
