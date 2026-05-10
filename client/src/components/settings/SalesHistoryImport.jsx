import React, { useState, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { UploadCloud, ArrowRight, ArrowLeft, RefreshCw, CheckCircle, AlertTriangle, Info, BarChart3 } from 'lucide-react';
import { db } from '../../services/firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp, query, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { writeAuditLog } from '../../hooks/useAuditLog';
import { useRole } from '../../hooks/useRole';
import { detectSalesColumns, normalizePaymentMethod, cleanNumeric, parseFlexibleDate } from '../../utils/importDetector';

const SALES_FIELDS = {
  date: 'Date', productName: 'Product Name', category: 'Category', quantity: 'Quantity',
  unitPrice: 'Unit Price', totalAmount: 'Total Amount', paymentMethod: 'Payment Method',
  customerName: 'Customer Name', discount: 'Discount', skip: 'Skip this column'
};

export default function SalesHistoryImport() {
  const { user } = useAuth();
  const { activeBusinessId, currency } = useBusiness();
  const { role } = useRole();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [colMap, setColMap] = useState({});
  const [conf, setConf] = useState({});
  const [defaults, setDefaults] = useState({ date: new Date().toISOString().split('T')[0], paymentMethod: 'cash' });
  const [dupMode, setDupMode] = useState('skip');
  const [dupCount, setDupCount] = useState(0);
  const [progress, setProgress] = useState({ c: 0, t: 0 });
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const inputCls = "w-full bg-gray-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-primary-500 transition-colors";

  // Step 1: Parse
  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError('File too large (max 10MB)'); return; }
    setFile(f);
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(f, { header: true, skipEmptyLines: true, complete: (r) => onParsed(r.data, r.meta.fields) });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        if (data.length > 0) onParsed(data, Object.keys(data[0]));
        else setError('Empty spreadsheet');
      };
      reader.readAsBinaryString(f);
    } else { setError('Invalid file type'); }
  };

  const onParsed = (data, cols) => {
    setRawRows(data); setColumns(cols);
    const mappings = detectSalesColumns(cols, data.slice(0, 5));
    const m = {}, c = {};
    mappings.forEach(x => { m[x.originalColumn] = x.mappedTo; c[x.originalColumn] = x.confidence; });
    setColMap(m); setConf(c); setStep(2);
  };

  const handleMapChange = (col, field) => {
    setColMap(prev => {
      const next = { ...prev };
      if (field !== 'skip') Object.keys(next).forEach(k => { if (next[k] === field) next[k] = 'skip'; });
      next[col] = field;
      return next;
    });
    setConf(prev => ({ ...prev, [col]: 'high' }));
  };

  // Column finders
  const getCol = useCallback((field) => Object.keys(colMap).find(k => colMap[k] === field), [colMap]);

  // Build summary for Step 5
  const buildSummary = useCallback(async () => {
    const dateCol = getCol('date'), nameCol = getCol('productName'), catCol = getCol('category');
    const qtyCol = getCol('quantity'), priceCol = getCol('unitPrice'), totalCol = getCol('totalAmount');
    const payCol = getCol('paymentMethod'), discCol = getCol('discount'), custCol = getCol('customerName');

    let totalRevenue = 0, cashCount = 0, creditCount = 0, missingCount = 0;
    const productSet = new Set(), dates = [];

    const records = rawRows.map((row, i) => {
      const product = nameCol ? (row[nameCol]?.toString().trim() || 'Imported Item') : 'Imported Item';
      const category = catCol ? (row[catCol]?.toString().trim() || 'uncategorized') : 'uncategorized';
      const qty = qtyCol ? cleanNumeric(row[qtyCol]) : 1;
      let price = priceCol ? cleanNumeric(row[priceCol]) : 0;
      let total = totalCol ? cleanNumeric(row[totalCol]) : 0;
      const disc = discCol ? cleanNumeric(row[discCol]) : 0;

      if (!total && price && qty) total = price * qty;
      if (!price && total && qty) price = total / qty;
      if (!total && !price) missingCount++;

      const rawDate = dateCol ? row[dateCol] : null;
      const parsedDate = rawDate ? parseFlexibleDate(rawDate) : null;
      const dateStr = parsedDate ? parsedDate.toISOString().split('T')[0] : defaults.date;
      if (parsedDate) dates.push(parsedDate);

      const rawPay = payCol ? row[payCol] : null;
      const payment = rawPay ? normalizePaymentMethod(rawPay) : defaults.paymentMethod;
      if (payment === 'cash') cashCount++; else creditCount++;

      const customer = custCol ? (row[custCol]?.toString().trim() || null) : null;
      productSet.add(product);

      totalRevenue += total;

      return { product, category, qty, price, total, disc, dateStr, payment, customer, parsedDate };
    });

    // Duplicate check
    let dups = 0;
    try {
      const billsSnap = await getDocs(query(collection(db, 'bills'), where('businessId', '==', activeBusinessId)));
      const existing = new Set();
      billsSnap.forEach(d => {
        const b = d.data();
        const bDate = b.date || '';
        (b.items || []).forEach(it => existing.add(`${bDate}|${it.productName}|${it.total}`));
      });
      records.forEach(r => { if (existing.has(`${r.dateStr}|${r.product}|${r.total}`)) dups++; });
    } catch (e) { console.error(e); }

    setDupCount(dups);
    dates.sort((a, b) => a - b);
    const dateRange = dates.length > 0
      ? `${dates[0].toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${dates[dates.length - 1].toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
      : 'N/A';

    const totalRecs = rawRows.length;
    const cashPct = totalRecs > 0 ? Math.round((cashCount / totalRecs) * 100) : 0;

    setSummary({
      records, total: totalRecs, products: productSet.size, revenue: totalRevenue,
      dateRange, cashPct, creditPct: 100 - cashPct, missing: missingCount, dups
    });
    setStep(5);
  }, [rawRows, colMap, defaults, activeBusinessId, getCol]);

  // Step 6: Import
  const executeImport = async () => {
    if (!summary) return;
    setStep(6);
    try {
      let batch = writeBatch(db), count = 0, total = 0;
      const toImport = dupMode === 'skip' && dupCount > 0
        ? await filterDuplicates(summary.records)
        : summary.records;

      setProgress({ c: 0, t: toImport.length });

      for (const rec of toImport) {
        const billRef = doc(collection(db, 'bills'));
        const dateTs = rec.parsedDate ? Timestamp.fromDate(rec.parsedDate) : Timestamp.fromDate(new Date(rec.dateStr));

        batch.set(billRef, {
          billId: billRef.id,
          businessId: activeBusinessId,
          date: rec.dateStr,
          items: [{
            productName: rec.product,
            category: rec.category,
            quantity: rec.qty,
            unitPrice: rec.price,
            total: rec.total
          }],
          subtotal: rec.total,
          discount: { type: 'flat', value: rec.disc },
          netTotal: Math.max(0, rec.total - rec.disc),
          paymentMethod: rec.payment,
          status: rec.payment === 'credit' ? 'unpaid' : 'paid',
          customerName: rec.customer,
          source: 'excel_import',
          importedAt: serverTimestamp(),
          createdAt: dateTs
        });

        count++; total++;
        if (count === 450) { await batch.commit(); batch = writeBatch(db); count = 0; }
        if (total % 20 === 0) setProgress({ c: total, t: toImport.length });
      }
      if (count > 0) await batch.commit();
      setProgress({ c: toImport.length, t: toImport.length });

      const dates = toImport.filter(r => r.parsedDate).map(r => r.parsedDate).sort((a, b) => a - b);
      const rangeStr = dates.length > 0
        ? `${dates[0].toLocaleDateString()} to ${dates[dates.length - 1].toLocaleDateString()}`
        : 'N/A';
      await writeAuditLog(user, role, 'Sales history imported', `${toImport.length} records, date range: ${rangeStr}`, 'System', activeBusinessId);
      setStep(7);
    } catch (err) {
      console.error(err);
      setError('Import failed. Check console.');
      setStep(5);
    }
  };

  const filterDuplicates = async (records) => {
    try {
      const billsSnap = await getDocs(query(collection(db, 'bills'), where('businessId', '==', activeBusinessId)));
      const existing = new Set();
      billsSnap.forEach(d => {
        const b = d.data();
        (b.items || []).forEach(it => existing.add(`${b.date}|${it.productName}|${it.total}`));
      });
      return records.filter(r => !existing.has(`${r.dateStr}|${r.product}|${r.total}`));
    } catch { return records; }
  };

  const reset = () => {
    setStep(1); setFile(null); setRawRows([]); setColumns([]); setColMap({}); setConf({});
    setSummary(null); setError(''); setDupCount(0); setDupMode('skip');
  };

  const needsDate = !getCol('date');
  const needsPayment = !getCol('paymentMethod');

  return (
    <div className="space-y-6 animate-fadeIn">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-red-500 shrink-0" size={18} />
          <span className="text-sm text-red-400">{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300 text-xs font-bold">✕</button>
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 1 && (
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[350px] border-dashed border-2 hover:bg-gray-800/50 transition-colors relative">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          <UploadCloud size={56} className="text-primary-500 mb-5" />
          <h3 className="text-lg font-bold text-white mb-2">Upload Sales History</h3>
          <p className="text-sm text-gray-400 mb-5 text-center max-w-md">Upload your historical sales data (.csv, .xlsx). We'll map columns, normalize dates and payments, then import into your bills collection.</p>
          <button className="px-6 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-primary-600/20">Browse Files</button>
        </div>
      )}

      {/* STEP 2: Column Mapping */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-400">Review Column Mapping</h4>
              <p className="text-xs text-amber-500/80 mt-0.5">Detected {rawRows.length} rows, {columns.length} columns. Map each to a sales field.</p>
            </div>
          </div>
          <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-950 border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr><th className="px-5 py-3 font-bold">Column</th><th className="px-5 py-3 font-bold">Sample</th><th className="px-5 py-3 font-bold">Map To</th><th className="px-5 py-3 font-bold">Confidence</th></tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {columns.map(col => {
                  const sample = rawRows.find(r => r[col])?.[col]?.toString().substring(0, 30) || '—';
                  const c = conf[col];
                  return (
                    <tr key={col} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-3 font-semibold text-white">{col}</td>
                      <td className="px-5 py-3 text-gray-400 font-mono text-xs">{sample}</td>
                      <td className="px-5 py-3">
                        <select value={colMap[col]} onChange={e => handleMapChange(col, e.target.value)} className="bg-gray-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 w-full">
                          {Object.entries(SALES_FIELDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        {c === 'high' ? <span className="flex items-center gap-1.5 text-xs font-bold text-green-400"><span className="w-2 h-2 rounded-full bg-green-500" />High</span> :
                         c === 'medium' ? <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500" />Medium</span> :
                         <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500"><span className="w-2 h-2 rounded-full bg-gray-600" />Low</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={reset} className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={() => setStep(3)} className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">Next <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {/* STEP 3: Missing Fields */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="bg-gray-900 border border-white/5 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Missing Fields</h3>
              <p className="text-sm text-gray-400">Fill in defaults for any unmapped columns.</p>
            </div>
            {needsDate && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Default Date (no date column found)</label>
                <input type="date" value={defaults.date} onChange={e => setDefaults(p => ({ ...p, date: e.target.value }))} className={inputCls} />
              </div>
            )}
            {needsPayment && (
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Default Payment Method</label>
                <select value={defaults.paymentMethod} onChange={e => setDefaults(p => ({ ...p, paymentMethod: e.target.value }))} className={inputCls}>
                  <option value="cash">Cash</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
            )}
            {!needsDate && !needsPayment && (
              <div className="flex items-center gap-3 text-green-400">
                <CheckCircle size={20} />
                <span className="text-sm font-bold">All required fields are mapped. No defaults needed.</span>
              </div>
            )}
            <div className="bg-gray-950 border border-white/5 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Auto-fill Rules</h4>
              <p className="text-xs text-gray-400">• No product column → items labeled "Imported Item"</p>
              <p className="text-xs text-gray-400">• No total but has price × qty → auto-calculated</p>
              <p className="text-xs text-gray-400">• No price but has total ÷ qty → auto-calculated</p>
              <p className="text-xs text-gray-400">• No category → assigned "Uncategorized"</p>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
            <button onClick={() => setStep(4)} className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">Next <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {/* STEP 4: Duplicate Detection */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="bg-gray-900 border border-white/5 rounded-2xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Duplicate Detection</h3>
              <p className="text-sm text-gray-400">Choose how to handle records that might already exist.</p>
            </div>
            <div className="space-y-3">
              <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer border transition-colors ${dupMode === 'skip' ? 'border-primary-500/50 bg-primary-600/5' : 'border-white/5 hover:bg-white/5'}`}>
                <input type="radio" name="dup" value="skip" checked={dupMode === 'skip'} onChange={() => setDupMode('skip')} className="accent-primary-600" />
                <div><span className="text-sm font-bold text-white">Skip duplicates</span><p className="text-xs text-gray-400 mt-0.5">Only import new records (recommended)</p></div>
              </label>
              <label className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer border transition-colors ${dupMode === 'all' ? 'border-primary-500/50 bg-primary-600/5' : 'border-white/5 hover:bg-white/5'}`}>
                <input type="radio" name="dup" value="all" checked={dupMode === 'all'} onChange={() => setDupMode('all')} className="accent-primary-600" />
                <div><span className="text-sm font-bold text-white">Import all</span><p className="text-xs text-gray-400 mt-0.5">Import everything including potential duplicates</p></div>
              </label>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
            <button onClick={buildSummary} className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">Build Summary <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {/* STEP 5: Confirmation */}
      {step === 5 && summary && (
        <div className="space-y-5">
          <div className="bg-gray-900 border border-white/5 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white font-heading mb-1">Import Summary</h3>
            <p className="text-sm text-gray-400 mb-6">Review before writing to the database.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                ['Total Records', summary.total, 'text-white'],
                ['Unique Products', summary.products, 'text-primary-400'],
                ['Total Revenue', `${currency}${summary.revenue.toFixed(2)}`, 'text-green-400'],
                ['Duplicates', dupMode === 'skip' ? `${summary.dups} skipped` : `${summary.dups} included`, summary.dups > 0 ? 'text-amber-400' : 'text-gray-400'],
              ].map(([label, val, color], i) => (
                <div key={i} className="bg-gray-950 border border-white/5 rounded-xl p-4 text-center">
                  <p className={`text-2xl font-bold ${color} mb-1`}>{val}</p>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <div className="bg-gray-950 border border-white/5 rounded-xl p-4">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Date Range</p>
                <p className="text-sm font-bold text-white">{summary.dateRange}</p>
              </div>
              <div className="bg-gray-950 border border-white/5 rounded-xl p-4">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Payment Split</p>
                <p className="text-sm font-bold text-white">Cash: {summary.cashPct}% | Credit: {summary.creditPct}%</p>
              </div>
              <div className="bg-gray-950 border border-white/5 rounded-xl p-4">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Missing Data</p>
                <p className="text-sm font-bold text-amber-400">{summary.missing} records (using defaults)</p>
              </div>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(4)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors flex items-center gap-2"><ArrowLeft size={16} /> Back</button>
            <button onClick={executeImport} className="px-8 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-xl shadow-primary-600/20">Confirm Import</button>
          </div>
        </div>
      )}

      {/* STEP 6: Importing */}
      {step === 6 && (
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-12 flex flex-col items-center text-center">
          <RefreshCw size={48} className="text-primary-500 mb-5 animate-spin" />
          <h3 className="text-xl font-bold text-white mb-2">Importing sales data...</h3>
          <p className="text-sm text-gray-400 mb-6">Don't close this tab.</p>
          <div className="w-full max-w-md bg-gray-950 rounded-full h-3 overflow-hidden border border-white/5">
            <div className="bg-primary-500 h-full transition-all duration-300 relative" style={{ width: `${Math.max(5, (progress.c / Math.max(progress.t, 1)) * 100)}%` }}>
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite]" />
            </div>
          </div>
          <p className="text-xs font-bold text-gray-500 mt-3">{progress.c} / {progress.t} records</p>
        </div>
      )}

      {/* STEP 7: Success */}
      {step === 7 && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-12 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-5">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-2">Sales Data Imported!</h3>
          <p className="text-sm text-green-500/80 mb-8 max-w-md">{summary?.total || 0} sales records have been imported. Analytics, Homepage stats, and Calendar will now reflect your historical data.</p>
          <div className="flex gap-4">
            <button onClick={reset} className="px-6 py-3 bg-gray-900 border border-white/10 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">Import Another</button>
            <button onClick={() => window.location.href = '/analytics'} className="px-6 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">
              <BarChart3 size={16} /> View Analytics
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
