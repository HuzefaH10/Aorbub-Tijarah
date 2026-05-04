import React from 'react';
import { TrendingUp, TrendingDown, ArrowRight, Lightbulb, AlertTriangle, Trophy } from 'lucide-react';

export default function TableWidget({ widget, data }) {
  const { dataset } = widget;

  if (dataset === 'topProductsTable') {
    const list = data.topProductsList || [];
    return (
      <div className="overflow-auto w-full h-full p-4">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-800">
            <tr><th className="pb-2">Product</th><th className="pb-2 text-right">Qty</th><th className="pb-2 text-right">Revenue</th></tr>
          </thead>
          <tbody>
            {list.map((item, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
                <td className="py-2.5 font-medium text-gray-800 dark:text-gray-200">{item.product}</td>
                <td className="py-2.5 text-right text-gray-500">{item.qty}</td>
                <td className="py-2.5 text-right text-primary-600 dark:text-primary-400 font-bold">${item.revenue.toLocaleString()}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="3" className="text-center py-4 text-gray-500">No data</td></tr>}
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
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-800">
            <tr><th className="pb-2">Metric</th><th className="pb-2 text-right">This Week</th><th className="pb-2 text-right">Last Week</th></tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50 dark:border-gray-800/50">
              <td className="py-3 font-medium text-gray-800 dark:text-gray-200">Revenue</td>
              <td className="py-3 text-right text-primary-600 dark:text-primary-400 font-bold">${p.twRev.toLocaleString()}</td>
              <td className="py-3 text-right text-gray-500">${p.lwRev.toLocaleString()}</td>
            </tr>
            <tr className="border-b border-gray-50 dark:border-gray-800/50">
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
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-100 dark:border-gray-800">
            <tr><th className="pb-2">Product</th><th className="pb-2 text-right">Avg Qty/Day</th></tr>
          </thead>
          <tbody>
            {list.map((item, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-gray-800/50">
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
              <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50">
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
