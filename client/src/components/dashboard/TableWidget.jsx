import React from 'react';
import { TrendingUp, TrendingDown, ArrowRight, Lightbulb, AlertTriangle, Trophy } from 'lucide-react';

const DeltaCell = ({ primary, compare }) => {
  if (compare === undefined || compare === null) return null;
  const delta = primary - compare;
  const pct = compare !== 0 ? ((delta / compare) * 100).toFixed(1) : null;
  const isPos = delta >= 0;
  return (
    <span className={`text-xs font-bold ml-1 ${isPos ? 'text-green-400' : 'text-red-400'}`}>
      {isPos ? '+' : ''}{delta % 1 === 0 ? delta : delta.toFixed(1)}{pct !== null ? ` (${isPos ? '+' : ''}${pct}%)` : ''}
    </span>
  );
};

export default function TableWidget({ widget, data, compareData, primaryLabel, compareLabel }) {
  const { dataset } = widget;
  const hasCompare = !!compareData;

  // ── CSV widget: render raw rows ──────────────────────────────────────────
  if (widget.isCSV && widget.csvData) {
    const { raw = [], columns = [] } = widget.csvData;
    if (raw.length === 0) {
      return <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm italic">No data</div>;
    }
    return (
      <div className="overflow-auto w-full h-full p-4 custom-scrollbar">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-white/10">
            <tr>
              {columns.map(c => <th key={c} className="pb-2 pr-4 whitespace-nowrap">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {raw.slice(0, 200).map((row, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                {columns.map(c => (
                  <td key={c} className="py-2 pr-4 text-gray-300 whitespace-nowrap max-w-[200px] truncate">
                    {String(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
            {raw.length > 200 && (
              <tr><td colSpan={columns.length} className="py-2 text-center text-xs text-gray-600 italic">Showing first 200 of {raw.length} rows</td></tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
  // ── End CSV branch ───────────────────────────────────────────────────────

  if (dataset === 'topProductsTable') {
    const list = data.topProductsList || [];

    // Build compare lookup by product name
    const compareMap = {};
    if (hasCompare) {
      (compareData.topProductsList || []).forEach(item => {
        compareMap[item.product] = item;
      });
    }

    return (
      <div className="overflow-auto w-full h-full p-4 custom-scrollbar">
        {hasCompare && (
          <div className="flex items-center gap-4 mb-3 text-[10px] font-bold uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary-500 inline-block" />{primaryLabel || 'Primary'}</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />{compareLabel || 'Compare'}</span>
          </div>
        )}
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-white/10">
            <tr>
              <th className="pb-2">Product</th>
              <th className="pb-2">Category</th>
              <th className="pb-2 text-right">Units Sold</th>
              {hasCompare && <th className="pb-2 text-right text-blue-400">Cmp Units</th>}
              <th className="pb-2 text-right">Revenue</th>
              {hasCompare && <th className="pb-2 text-right text-blue-400">Cmp Rev</th>}
              <th className="pb-2 text-right">Last Sold</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item, i) => {
              const cmp = compareMap[item.product];
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="py-2.5 font-medium text-gray-200">{item.product}</td>
                  <td className="py-2.5 text-gray-500">{item.category}</td>
                  <td className="py-2.5 text-right font-medium text-white">
                    {item.qty}
                    {hasCompare && <DeltaCell primary={item.qty} compare={cmp?.qty} />}
                  </td>
                  {hasCompare && <td className="py-2.5 text-right text-blue-300 text-xs">{cmp?.qty ?? '—'}</td>}
                  <td className="py-2.5 text-right text-primary-400 font-bold">
                    ${Number(item.revenue).toLocaleString()}
                    {hasCompare && <DeltaCell primary={item.revenue} compare={cmp?.revenue} />}
                  </td>
                  {hasCompare && <td className="py-2.5 text-right text-blue-300 text-xs">${cmp ? Number(cmp.revenue).toLocaleString() : '—'}</td>}
                  <td className="py-2.5 text-right text-gray-500 text-xs">{item.lastSold || '—'}</td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={hasCompare ? 7 : 5} className="text-center py-8 text-gray-500 italic">No data for this period</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }


  if (dataset === 'periodComparisonTable') {
    const p = data.periodComparison || { twRev: 0, lwRev: 0, twProfit: 0, lwProfit: 0 };
    return (
      <div className="overflow-auto w-full h-full p-4">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-white/10">
            <tr><th className="pb-2">Metric</th><th className="pb-2 text-right">This Week</th><th className="pb-2 text-right">Last Week</th></tr>
          </thead>
          <tbody>
            <tr className="border-b border-white/5">
              <td className="py-3 font-medium text-gray-800 dark:text-gray-200">Revenue</td>
              <td className="py-3 text-right text-primary-600 dark:text-primary-400 font-bold">${p.twRev.toLocaleString()}</td>
              <td className="py-3 text-right text-gray-500">${p.lwRev.toLocaleString()}</td>
            </tr>
            <tr className="border-b border-white/5">
              <td className="py-3 font-medium text-gray-800 dark:text-gray-200">Profit</td>
              <td className="py-3 text-right text-green-600 dark:text-green-400 font-bold">${p.twProfit.toLocaleString()}</td>
              <td className="py-3 text-right text-gray-500">${p.lwProfit.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (dataset === 'salesVelocityTable') {
    const list = data.salesVelocity || [];
    return (
      <div className="overflow-auto w-full h-full p-4">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-white/10">
            <tr><th className="pb-2">Product</th><th className="pb-2 text-right">Avg Qty/Day</th></tr>
          </thead>
          <tbody>
            {list.map((item, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{item.product}</td>
                <td className="py-2.5 text-right text-primary-600 dark:text-primary-400 font-bold">{item.avg} / day</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="2" className="text-center py-4 text-gray-500">No data</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  if (dataset === 'insightsPanel') {
    const insights = data.insights || [];
    return (
      <div className="overflow-auto w-full h-full p-4 space-y-3">
        {insights.length === 0 ? (
          <p className="text-gray-500 text-sm text-center mt-4">Not enough data for insights.</p>
        ) : (
          insights.map((insight, i) => {
            let Icon = Lightbulb;
            let color = "text-primary-500";
            if (insight.includes('up')) { Icon = TrendingUp; color = "text-green-500"; }
            if (insight.includes('down')) { Icon = TrendingDown; color = "text-red-500"; }
            if (insight.includes('negative') || insight.includes('⚠️')) { Icon = AlertTriangle; color = "text-amber-500"; }
            if (insight.includes('top earner') || insight.includes('🏆')) { Icon = Trophy; color = "text-primary-500"; }
            
            return (
              <div key={i} className="flex items-start gap-3 glass p-3 rounded-xl">
                <Icon size={18} className={`shrink-0 mt-0.5 ${color}`} />
                <p className="text-sm text-gray-800 dark:text-gray-200 font-medium leading-snug">{insight.replace(/[🏆⚠️📈🔁💡📦]/g, '')}</p>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return <div className="p-4 text-sm text-gray-500">Unknown table type</div>;
}
