import React, { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  X, UploadCloud, FileText, ChevronRight, ChevronLeft,
  BarChart2, Table as TableIcon, Check, AlertCircle, Loader2
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function detectColType(values) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && v !== '');
  if (!nonEmpty.length) return 'text';

  // Date check
  const isDate = nonEmpty.every(v => {
    const s = String(v);
    return !isNaN(Date.parse(s)) && /[\-\/\s]/.test(s);
  });
  if (isDate) return 'date';

  // Numeric check
  const isNum = nonEmpty.every(v => !isNaN(Number(String(v).replace(/,/g, ''))));
  if (isNum) return 'numeric';

  return 'text';
}

function autoSuggestName(columns) {
  const lc = columns.map(c => c.toLowerCase());
  if (lc.some(c => /revenue|sales|amount|total|income/.test(c)) && lc.some(c => /date|day|month|week|year/.test(c)))
    return 'Revenue Over Time';
  if (lc.some(c => /product|item|sku/.test(c)) && lc.some(c => /qty|quantity|sold|units/.test(c)))
    return 'Sales by Product';
  if (lc.some(c => /category|cat|type|group/.test(c)))
    return 'Category Split';
  return columns.slice(0, 2).join(' vs ');
}

function autoSuggestVizType(colTypes) {
  if (colTypes.date) return 'area';
  if (colTypes.text && colTypes.numeric) return 'bar';
  return 'bar';
}

// ─── CSS shared ──────────────────────────────────────────────────────────────
const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";
const labelCls = "block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5";
const selectCls = `${inputCls} cursor-pointer`;

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepDot({ n, active, done }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
        ${done ? 'bg-green-600 text-white' : active ? 'bg-primary-600 text-white ring-2 ring-primary-500/40' : 'bg-gray-800 text-gray-500'}`}>
        {done ? <Check size={12} /> : n}
      </div>
      <span className={`text-xs font-semibold hidden sm:block ${active ? 'text-white' : 'text-gray-600'}`}>
        {n === 1 ? 'Upload' : n === 2 ? 'Preview' : 'Configure'}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CsvUploader({ onClose, onAdd }) {
  const [step, setStep] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef();

  // Parsed data state
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState([]);      // string[]
  const [colTypes, setColTypes] = useState({});    // { col: 'numeric' | 'date' | 'text' }
  const [rows, setRows] = useState([]);             // all parsed rows
  const [previewRows, setPreviewRows] = useState([]); // first 5

  // Config state
  const [chartName, setChartName] = useState('');
  const [vizType, setVizType] = useState('bar');   // area | bar | donut | table | both
  const [xCol, setXCol] = useState('');
  const [yCol, setYCol] = useState('');
  const [addAs, setAddAs] = useState('chart');     // 'chart' | 'table' | 'both'

  // ── Parse ─────────────────────────────────────────────────────────────────
  const parseFile = useCallback((file) => {
    if (!file) return;
    setError('');

    if (file.size > MAX_BYTES) {
      setError('File too large. Maximum size is 10 MB.');
      return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Only .csv, .xlsx, and .xls files are supported.');
      return;
    }

    setLoading(true);
    setFileName(file.name);

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data, results.meta.fields || []);
          setLoading(false);
        },
        error: (err) => { setError(`Parse error: ${err.message}`); setLoading(false); }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'binary' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
          const cols = data.length ? Object.keys(data[0]) : [];
          processData(data, cols);
        } catch (err) {
          setError(`Excel parse error: ${err.message}`);
        }
        setLoading(false);
      };
      reader.readAsBinaryString(file);
    }
  }, []);

  const processData = (data, cols) => {
    const types = {};
    cols.forEach(col => {
      types[col] = detectColType(data.map(r => r[col]));
    });

    const numericCols = cols.filter(c => types[c] === 'numeric');
    const dateCols = cols.filter(c => types[c] === 'date');
    const labelCols = cols.filter(c => types[c] === 'text');

    const suggestedName = autoSuggestName(cols);
    const suggestedViz = autoSuggestVizType({ date: dateCols[0], text: labelCols[0], numeric: numericCols[0] });

    setColumns(cols);
    setColTypes(types);
    setRows(data);
    setPreviewRows(data.slice(0, 5));
    setChartName(suggestedName);
    setVizType(suggestedViz);
    setXCol(dateCols[0] || labelCols[0] || cols[0] || '');
    setYCol(numericCols[0] || '');
    setStep(2);
  };

  // ── Drop zone ─────────────────────────────────────────────────────────────
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  // ── Confirm & add to dashboard ─────────────────────────────────────────────
  const handleConfirm = () => {
    if (!chartName.trim()) return;

    // Build chart-compatible data from raw rows
    const xValues = rows.map(r => String(r[xCol] ?? ''));
    const yValues = rows.map(r => Number(String(r[yCol] ?? '').replace(/,/g, '')) || 0);

    const csvData = { labels: xValues, values: yValues, raw: rows, columns };

    const widgetId = `csv_${Date.now()}`;

    const makeChart = () => ({
      id: `${widgetId}_chart`,
      type: vizType === 'both' ? 'bar' : vizType,
      name: `${chartName.trim()} 📊`,
      dataset: `csv_${widgetId}`,
      isChart: true,
      enabled: true,
      w: vizType === 'donut' ? 4 : 12,
      h: 4,
      csvData,
      isCSV: true,
    });

    const makeTable = () => ({
      id: `${widgetId}_table`,
      type: 'table',
      name: `${chartName.trim()} 📋`,
      dataset: `csv_${widgetId}`,
      isChart: false,
      enabled: true,
      w: 12,
      h: 3,
      csvData,
      isCSV: true,
    });

    if (addAs === 'both') {
      onAdd(makeChart());
      onAdd(makeTable());
    } else if (addAs === 'chart') {
      onAdd(makeChart());
    } else {
      onAdd(makeTable());
    }

    onClose();
  };

  const numericCols = columns.filter(c => colTypes[c] === 'numeric');
  const xCols = columns.filter(c => colTypes[c] !== 'numeric' || c === xCol);
  const canConfirm = chartName.trim() && xCol && (addAs === 'table' || yCol);

  // ── Badge colour per detected type ────────────────────────────────────────
  const typeBadge = (t) => {
    if (t === 'numeric') return 'bg-blue-500/20 text-blue-400';
    if (t === 'date') return 'bg-amber-500/20 text-amber-400';
    return 'bg-gray-700 text-gray-400';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fadeIn">
      <div className="glass w-full max-w-2xl shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <UploadCloud size={20} className="text-primary-400" />
            <h2 className="text-base font-bold text-white font-heading">Upload CSV / Excel</h2>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-3">
            {[1, 2, 3].map(n => (
              <React.Fragment key={n}>
                <StepDot n={n} active={step === n} done={step > n} />
                {n < 3 && <ChevronRight size={14} className="text-gray-700" />}
              </React.Fragment>
            ))}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition-colors ml-2">
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* ── STEP 1: Drop zone ────────────────────────────────────────── */}
          {step === 1 && (
            <div className="p-8 flex flex-col items-center gap-6">
              <div
                className={`w-full border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 transition-all cursor-pointer
                  ${dragging ? 'border-primary-500 bg-primary-500/10' : 'border-white/10 hover:border-primary-500/50 hover:bg-white/[0.02]'}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {loading ? (
                  <Loader2 size={44} className="text-primary-400 animate-spin" />
                ) : (
                  <UploadCloud size={44} className={`transition-colors ${dragging ? 'text-primary-400' : 'text-gray-600'}`} />
                )}
                <div className="text-center">
                  <p className="text-white font-semibold">
                    {loading ? 'Parsing file…' : 'Drag & drop your file here'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">or click to browse — .csv, .xlsx, .xls · max 10 MB</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => parseFile(e.target.files[0])}
              />
              {error && (
                <div className="w-full flex items-center gap-2.5 bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Preview ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="p-6 space-y-5">
              {/* File info */}
              <div className="flex items-center gap-3 bg-primary-900/20 border border-primary-500/20 rounded-xl px-4 py-3">
                <FileText size={18} className="text-primary-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">{fileName}</p>
                  <p className="text-xs text-gray-500">{rows.length} rows · {columns.length} columns</p>
                </div>
              </div>

              {/* Column type legend */}
              <div className="flex flex-wrap gap-2">
                {columns.map(c => (
                  <span key={c} className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${typeBadge(colTypes[c])}`}>
                    {c} <span className="opacity-60">({colTypes[c]})</span>
                  </span>
                ))}
              </div>

              {/* Preview table */}
              <div>
                <p className={labelCls}>First 5 rows preview</p>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-900/80">
                      <tr>
                        {columns.map(c => (
                          <th key={c} className="px-3 py-2.5 text-left text-gray-400 font-bold uppercase tracking-wider whitespace-nowrap border-b border-white/10">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                          {columns.map(c => (
                            <td key={c} className="px-3 py-2.5 text-gray-300 whitespace-nowrap max-w-[180px] truncate">
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {rows.length > 5 && (
                  <p className="text-xs text-gray-600 mt-2 text-center">… and {rows.length - 5} more rows</p>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: Configure ────────────────────────────────────────── */}
          {step === 3 && (
            <div className="p-6 space-y-5">
              {/* Widget Name */}
              <div>
                <label className={labelCls}>Widget Name *</label>
                <input
                  value={chartName}
                  onChange={e => setChartName(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. Revenue Over Time"
                />
              </div>

              {/* Add as */}
              <div>
                <label className={labelCls}>Add as</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'chart', icon: BarChart2, label: 'Chart' },
                    { v: 'table', icon: TableIcon, label: 'Table' },
                    { v: 'both',  icon: Check,      label: 'Both' },
                  ].map(({ v, icon: Icon, label }) => (
                    <button
                      key={v}
                      onClick={() => setAddAs(v)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-bold transition-all
                        ${addAs === v ? 'border-primary-500 bg-primary-600/20 text-primary-400' : 'border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}
                    >
                      <Icon size={18} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Viz type (only if chart) */}
              {(addAs === 'chart' || addAs === 'both') && (
                <div>
                  <label className={labelCls}>Chart Type</label>
                  <select value={vizType} onChange={e => setVizType(e.target.value)} className={selectCls}>
                    <option value="area">Line / Area</option>
                    <option value="bar">Bar Chart</option>
                    <option value="donut">Pie / Donut</option>
                  </select>
                </div>
              )}

              {/* X axis */}
              <div>
                <label className={labelCls}>X-Axis / Label Column</label>
                <select value={xCol} onChange={e => setXCol(e.target.value)} className={selectCls}>
                  {columns.map(c => (
                    <option key={c} value={c}>{c} ({colTypes[c]})</option>
                  ))}
                </select>
              </div>

              {/* Y axis (only for charts) */}
              {(addAs === 'chart' || addAs === 'both') && (
                <div>
                  <label className={labelCls}>Y-Axis / Value Column</label>
                  <select value={yCol} onChange={e => setYCol(e.target.value)} className={selectCls}>
                    {numericCols.length === 0 && (
                      <option value="">— No numeric columns detected —</option>
                    )}
                    {numericCols.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {numericCols.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1">
                      <AlertCircle size={12} /> No numeric column detected — chart may be empty
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 shrink-0 flex items-center justify-between gap-3">
          {/* Back */}
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-1.5 px-4 py-2 glass text-gray-400 hover:text-white rounded-xl text-sm font-bold transition-all"
          >
            <ChevronLeft size={16} />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {/* Next / Confirm */}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1}  // Step 1: parse handles moving forward
              className="flex items-center gap-1.5 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-30 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary-600/20"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="flex items-center gap-1.5 px-6 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary-600/20"
            >
              <Check size={16} /> Add to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
