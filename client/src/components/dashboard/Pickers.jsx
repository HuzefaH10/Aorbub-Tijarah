import React, { useState } from 'react';
import { X, BarChart2, Table as TableIcon, TrendingUp, PieChart, BarChart, LineChart } from 'lucide-react';

// ─── Chart Picker Options ───────────────────────────────────────────
const CHART_TYPE_OPTIONS = [
  { value: 'area',  label: 'Line / Area' },
  { value: 'bar',   label: 'Bar' },
  { value: 'donut', label: 'Donut / Pie' },
];

const CHART_SOURCE_OPTIONS = [
  { value: 'revenueByDate',   label: 'Revenue Over Time',  dataset: 'revenueByDate',   type: 'area', w: 12, h: 4 },
  { value: 'salesByProduct',  label: 'Sales by Product',   dataset: 'salesByProduct',  type: 'bar',  w: 6,  h: 4 },
  { value: 'categorySplit',   label: 'Category Split',     dataset: 'categorySplit',   type: 'donut',w: 4,  h: 4 },
];

// ─── Table Picker Options ────────────────────────────────────────────
const TABLE_SOURCE_OPTIONS = [
  { value: 'topProductsTable',      label: 'Top Products',         dataset: 'topProductsTable',      w: 12, h: 3 },
  { value: 'billsHistoryTable',     label: 'Bills History',        dataset: 'billsHistoryTable',     w: 12, h: 3 },
  { value: 'creditUnpaidTable',     label: 'Credit / Unpaid Bills',dataset: 'creditUnpaidTable',     w: 12, h: 3 },
  { value: 'stockOverviewTable',    label: 'Stock Overview',       dataset: 'stockOverviewTable',    w: 12, h: 3 },
];

const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";
const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5";
const selectCls = `${inputCls} cursor-pointer appearance-none`;

export default function Pickers({ type, onClose, onAdd }) {
  // ── Chart state ──
  const [chartName, setChartName] = useState('');
  const [chartType, setChartType] = useState('area');
  const [chartSource, setChartSource] = useState(CHART_SOURCE_OPTIONS[0].value);

  // ── Table state ──
  const [tableName, setTableName] = useState('');
  const [tableSource, setTableSource] = useState(TABLE_SOURCE_OPTIONS[0].value);

  const isChart = type === 'chart';

  const handleAdd = () => {
    if (isChart) {
      if (!chartName.trim()) return;
      const src = CHART_SOURCE_OPTIONS.find(s => s.value === chartSource);
      onAdd({
        id: `widget_${Date.now()}`,
        type: chartType,
        name: chartName.trim(),
        dataset: src?.dataset || chartSource,
        isChart: true,
        enabled: true,
        w: src?.w || 6,
        h: src?.h || 4,
      });
    } else {
      if (!tableName.trim()) return;
      const src = TABLE_SOURCE_OPTIONS.find(s => s.value === tableSource);
      onAdd({
        id: `widget_${Date.now()}`,
        type: 'table',
        name: tableName.trim(),
        dataset: src?.dataset || tableSource,
        isChart: false,
        enabled: true,
        w: src?.w || 12,
        h: src?.h || 3,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeIn">
      <div className="glass w-full max-w-md shadow-2xl rounded-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isChart
              ? <BarChart2 size={20} className="text-primary-400" />
              : <TableIcon size={20} className="text-primary-400" />}
            <h2 className="text-lg font-bold text-white font-heading">
              {isChart ? 'Add Chart Widget' : 'Add Table Widget'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {isChart ? (
            <>
              {/* Chart Name */}
              <div>
                <label className={labelCls}>Chart Name *</label>
                <input
                  value={chartName}
                  onChange={e => setChartName(e.target.value)}
                  placeholder="e.g. Monthly Revenue"
                  className={inputCls}
                  autoFocus
                />
              </div>

              {/* Chart Type */}
              <div>
                <label className={labelCls}>Chart Type</label>
                <select value={chartType} onChange={e => setChartType(e.target.value)} className={selectCls}>
                  {CHART_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Data Source */}
              <div>
                <label className={labelCls}>Data Source</label>
                <select value={chartSource} onChange={e => setChartSource(e.target.value)} className={selectCls}>
                  {CHART_SOURCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Date Range note */}
              <p className="text-xs text-gray-600 italic">Date range inherits the global filter from the top bar.</p>
            </>
          ) : (
            <>
              {/* Table Name */}
              <div>
                <label className={labelCls}>Table Name *</label>
                <input
                  value={tableName}
                  onChange={e => setTableName(e.target.value)}
                  placeholder="e.g. Top Products"
                  className={inputCls}
                  autoFocus
                />
              </div>

              {/* Data Source */}
              <div>
                <label className={labelCls}>Data Source</label>
                <select value={tableSource} onChange={e => setTableSource(e.target.value)} className={selectCls}>
                  {TABLE_SOURCE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 glass text-gray-400 hover:text-white rounded-xl text-sm font-bold transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={isChart ? !chartName.trim() : !tableName.trim()}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary-600/20"
          >
            Add to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
