import React, { useState, useRef, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, FileSpreadsheet, RefreshCw, Merge, AlertTriangle, 
  CheckCircle, ArrowRight, ChevronDown, Check, Info, X, Search, Trash2
} from 'lucide-react';
import Toast, { useToast } from '../ui/Toast';
import { db } from '../../services/firebase';
import { collection, getDocs, query, where, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { writeAuditLog } from '../../hooks/useAuditLog';
import { useRole } from '../../hooks/useRole';
import { detectColumns, normalizeUnit, groupByNameSimilarity, validateImportData } from '../../utils/importDetector';
import SalesHistoryImport from './SalesHistoryImport';

const STEPS = {
  UPLOAD: 1,
  MAPPING: 2,
  CATEGORIES: 3,
  UNITS: 4,
  REVIEW: 5,
  CONFIRM: 6,
  IMPORTING: 7,
  SUCCESS: 8
};

const UNIT_OPTIONS = ['pcs','kg','g','litre','ml','box','dozen','pack','bag','carton','Other'];

const FIELD_LABELS = {
  productName: 'Product Name',
  category: 'Category',
  unit: 'Unit',
  price: 'Price',
  quantity: 'Quantity',
  threshold: 'Low Stock Threshold',
  skip: 'Skip this column'
};

export default function TabDataImport() {
  const { user } = useAuth();
  const { activeBusinessId } = useBusiness();
  const { role } = useRole();
  const { toast, showToast, hideToast } = useToast();
  
  const [importTab, setImportTab] = useState('products'); // 'products' | 'sales'
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [columns, setColumns] = useState([]);
  
  // Mode selection modal
  const [showModeModal, setShowModeModal] = useState(false);
  const [mode, setMode] = useState(null); // 'merge' or 'replace'
  
  // Mapping state
  const [columnMap, setColumnMap] = useState({}); // { colName: fieldKey }
  const [confidence, setConfidence] = useState({}); // { colName: 'high' | 'medium' | 'none' }
  
  // Category state
  const [categoryAssignments, setCategoryAssignments] = useState({}); // { rowIndex: category }
  
  // Unit state
  const [unitAssignments, setUnitAssignments] = useState({}); // { rawUnit: normalizedUnit }
  
  // Review state
  const [reviewProducts, setReviewProducts] = useState([]);
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewSelected, setReviewSelected] = useState(new Set());
  const [bulkThreshold, setBulkThreshold] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Import state
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState(null);

  // --- Step 1: Parsing ---
  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    
    const ext = f.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processParsedData(results.data, results.meta.fields)
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (data.length > 0) {
          processParsedData(data, Object.keys(data[0]));
        } else {
          showToast('Spreadsheet is empty', 'error');
        }
      };
      reader.readAsBinaryString(f);
    } else {
      showToast('Invalid file type. Please upload CSV or Excel.', 'error');
    }
  };

  // processParsedData receives the data directly — avoids stale state closure
  const processParsedData = (data, cols) => {
    setRawRows(data);
    setColumns(cols);
    autoDetectColumns(cols, data); // pass data directly, don't read from state
    setShowModeModal(true);
  };

  // Accept sampleRows directly to avoid the React stale-state closure problem
  // (rawRows state won't be updated yet when this function runs)
  const autoDetectColumns = (cols, sampleRows) => {
    const map = {};
    const conf = {};
    
    const mappings = detectColumns(cols, (sampleRows || []).slice(0, 5));
    mappings.forEach(m => {
      map[m.originalColumn] = m.mappedTo;
      conf[m.originalColumn] = m.confidence;
    });
    
    setColumnMap(map);
    setConfidence(conf);
  };

  const confirmMode = (selectedMode) => {
    setMode(selectedMode);
    setShowModeModal(false);
    setStep(STEPS.MAPPING);
  };

  // --- Step 2: Mapping Review ---
  const handleMapChange = (col, field) => {
    setColumnMap(prev => {
      const next = { ...prev };
      // If field is already mapped elsewhere, unmap the old one
      if (field !== 'skip') {
        Object.keys(next).forEach(k => {
          if (next[k] === field) next[k] = 'skip';
        });
      }
      next[col] = field;
      return next;
    });
    setConfidence(prev => ({ ...prev, [col]: 'high' }));
  };

  const proceedFromMapping = () => {
    const mappedValues = Object.values(columnMap);
    const missingFields = [];
    
    console.log('[DataImport] Proceeding from mapping. columnMap:', columnMap);
    
    if (!mappedValues.includes('productName')) {
      missingFields.push('Product Name');
    }
    
    if (missingFields.length > 0) {
      showToast(`Please map the required fields: ${missingFields.join(', ')}`, 'error');
      return;
    }
    
    console.log('[DataImport] Validation passed. Advancing to CATEGORIES step.');
    setStep(STEPS.CATEGORIES);
  };

  // --- Step 3: Categories ---
  const missingCategories = useMemo(() => {
    if (step !== STEPS.CATEGORIES) return [];
    const catCol = Object.keys(columnMap).find(k => columnMap[k] === 'category');
    const nameCol = Object.keys(columnMap).find(k => columnMap[k] === 'productName');
    
    const missing = [];
    rawRows.forEach((row, i) => {
      const cat = catCol ? row[catCol] : null;
      if (!cat || !cat.toString().trim()) {
        const pName = row[nameCol];
        if (pName && pName.toString().trim()) {
          missing.push({ index: i, name: pName.toString().trim() });
        }
      }
    });
    return missing;
  }, [rawRows, columnMap, step]);

  const [bulkCatSelect, setBulkCatSelect] = useState(new Set());
  const [newCatInput, setNewCatInput] = useState('');

  const handleBulkAssignCat = (category) => {
    if (bulkCatSelect.size === 0) return;
    setCategoryAssignments(prev => {
      const next = { ...prev };
      bulkCatSelect.forEach(idx => { next[idx] = category; });
      return next;
    });
    setBulkCatSelect(new Set());
    setNewCatInput('');
  };

  const toggleBulkCat = (idx) => {
    setBulkCatSelect(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleAutoGroup = () => {
    const unassignedProducts = missingCategories
      .filter(m => !categoryAssignments[m.index])
      .map(m => m.name);
      
    if (unassignedProducts.length === 0) return;
    
    const groups = groupByNameSimilarity(unassignedProducts);
    
    if (groups.length === 0) {
      showToast('Could not find obvious similarities to auto-group.', 'info');
      return;
    }
    
    setCategoryAssignments(prev => {
      const next = { ...prev };
      groups.forEach(g => {
        g.products.forEach(pName => {
          const match = missingCategories.find(m => m.name === pName);
          if (match) next[match.index] = g.suggestedCategory;
        });
      });
      return next;
    });
    showToast(`Auto-grouped items into ${groups.length} categories!`, 'success');
  };

  const proceedFromCategories = () => {
    const unassignedCount = missingCategories.filter(m => !categoryAssignments[m.index]).length;
    if (unassignedCount > 0) {
      showToast(`Please assign categories to the remaining ${unassignedCount} products`, 'error');
      return;
    }
    setStep(STEPS.UNITS);
  };

  // --- Step 4: Units ---
  const unrecognizedUnits = useMemo(() => {
    if (step !== STEPS.UNITS) return [];
    const unitCol = Object.keys(columnMap).find(k => columnMap[k] === 'unit');
    if (!unitCol) return [];

    const unknowns = new Set();
    rawRows.forEach(row => {
      const rawU = row[unitCol];
      if (rawU && rawU.toString().trim()) {
        const u = rawU.toString().toLowerCase().trim();
        if (normalizeUnit(u) === null) {
          unknowns.add(rawU.toString().trim());
        }
      }
    });
    return Array.from(unknowns);
  }, [rawRows, columnMap, step]);

  const proceedFromUnits = () => {
    const unassignedCount = unrecognizedUnits.filter(u => !unitAssignments[u]).length;
    if (unassignedCount > 0) {
      showToast(`Please map all unrecognized units`, 'error');
      return;
    }
    const nameCol = Object.keys(columnMap).find(k => columnMap[k] === 'productName');
    const catCol = Object.keys(columnMap).find(k => columnMap[k] === 'category');
    const unitCol = Object.keys(columnMap).find(k => columnMap[k] === 'unit');
    const priceCol = Object.keys(columnMap).find(k => columnMap[k] === 'price');
    const qtyCol = Object.keys(columnMap).find(k => columnMap[k] === 'quantity');
    const threshCol = Object.keys(columnMap).find(k => columnMap[k] === 'threshold');

    const products = [];
    rawRows.forEach((row, i) => {
      const name = nameCol ? row[nameCol]?.toString().trim() : '';
      if (!name) return;
      let cat = catCol && row[catCol] ? row[catCol].toString().trim() : categoryAssignments[i] || 'Uncategorized';
      let unit = 'pcs';
      if (unitCol && row[unitCol]) {
        const rawU = row[unitCol].toString().trim();
        unit = unitAssignments[rawU] || normalizeUnit(rawU) || rawU;
      }
      const price = priceCol ? parseFloat(row[priceCol]) : 0;
      const qty = qtyCol ? parseFloat(row[qtyCol]) : 0;
      const thresh = threshCol ? parseInt(row[threshCol]) : 5;
      products.push({ _id: i, name, category: cat, unit, price: isNaN(price) ? 0 : price, qty: isNaN(qty) ? 0 : qty, threshold: isNaN(thresh) ? 5 : thresh });
    });
    setReviewProducts(products);
    setReviewSearch('');
    setReviewSelected(new Set());
    setStep(STEPS.REVIEW);
  };

  const proceedFromReview = () => {
    if (reviewProducts.length === 0) { showToast('No products to import', 'error'); return; }
    const cats = new Set(reviewProducts.map(p => p.category).filter(Boolean));
    const noPrice = reviewProducts.filter(p => !p.price || p.price <= 0).length;
    const skipped = columns.filter(c => columnMap[c] === 'skip');
    const validation = validateImportData(rawRows, columnMap);
    setImportSummary({
      toAdd: reviewProducts.length, categories: Array.from(cats),
      withPrice: reviewProducts.length - noPrice, noPrice, noThresh: 0, skipped,
      warnings: validation.warnings || []
    });
    setStep(STEPS.CONFIRM);
  };

  // --- Execute Import (uses reviewProducts) ---
  const executeImport = async () => {
    setStep(STEPS.IMPORTING);
    try {
      let existingProducts = [];
      if (mode === 'merge') {
        const qs = await getDocs(query(collection(db, 'products'), where('businessId', '==', activeBusinessId)));
        existingProducts = qs.docs.map(d => d.data().name.toLowerCase());
      } else if (mode === 'replace') {
        const pq = await getDocs(query(collection(db, 'products'), where('businessId', '==', activeBusinessId)));
        const cq = await getDocs(query(collection(db, 'categories'), where('businessId', '==', activeBusinessId)));
        let delBatch = writeBatch(db); let dCount = 0;
        for (const d of [...pq.docs, ...cq.docs]) {
          delBatch.delete(d.ref); dCount++;
          if (dCount === 500) { await delBatch.commit(); delBatch = writeBatch(db); dCount = 0; }
        }
        if (dCount > 0) await delBatch.commit();
      }

      const newProducts = reviewProducts
        .filter(p => !(mode === 'merge' && existingProducts.includes(p.name.toLowerCase())))
        .map(p => ({
          businessId: activeBusinessId, name: p.name, category: p.category || 'Uncategorized',
          defaults: { unit: p.unit, price: p.price, threshold: p.threshold },
          unit: p.unit, lowStockThreshold: p.threshold,
          currentStock: p.qty, status: p.qty <= 0 ? 'out' : p.qty <= p.threshold ? 'low' : 'healthy',
          importedAt: serverTimestamp(), source: 'csv_import'
        }));
      const newCategories = new Set(importSummary.categories);
      setProgress({ current: 0, total: newProducts.length + newCategories.size });

      let wb = writeBatch(db); let wc = 0, tp = 0;
      for (const catName of newCategories) {
        const cRef = doc(collection(db, 'categories'));
        wb.set(cRef, { categoryId: cRef.id, businessId: activeBusinessId, name: catName, createdAt: serverTimestamp(), source: 'csv_import' });
        wc++; tp++;
        if (wc === 500) { await wb.commit(); wb = writeBatch(db); wc = 0; }
      }
      for (const p of newProducts) {
        const pRef = doc(collection(db, 'products'));
        wb.set(pRef, { productId: pRef.id, ...p });
        wc++; tp++;
        if (tp % 25 === 0) setProgress({ current: tp, total: newProducts.length + newCategories.size });
        if (wc === 500) { await wb.commit(); wb = writeBatch(db); wc = 0; }
      }
      if (wc > 0) { await wb.commit(); setProgress({ current: newProducts.length + newCategories.size, total: newProducts.length + newCategories.size }); }

      await writeAuditLog(user, role, `Bulk Import (${mode})`, `Imported ${newProducts.length} products and ${newCategories.size} categories.`, 'System', activeBusinessId);
      setStep(STEPS.SUCCESS);
    } catch (err) {
      console.error('[DataImport] Import failed:', err);
      const errorMsg = err?.message || 'Unknown error';
      showToast(`Import failed: ${errorMsg}`, 'error');
      setStep(STEPS.CONFIRM);
    }
  };

  const resetAll = () => {
    setStep(STEPS.UPLOAD); setFile(null); setRawRows([]); setColumns([]);
    setColumnMap({}); setConfidence({}); setCategoryAssignments({}); setUnitAssignments({});
    setImportSummary(null); setReviewProducts([]); setReviewSearch(''); setReviewSelected(new Set());
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 animate-fadeIn">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}
      {/* HEADER */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white font-heading">Data Import</h2>
        <p className="text-sm text-gray-400 mt-1">Import products, inventory, or historical sales data.</p>
      </div>

      {/* TAB SWITCHER */}
      <div className="flex gap-1 p-1 bg-gray-900 border border-white/5 rounded-xl mb-8 max-w-md">
        {[['products', 'Product & Inventory'], ['sales', 'Sales History']].map(([key, label]) => (
          <button key={key} onClick={() => setImportTab(key)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${importTab === key ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
            {label}
          </button>
        ))}
      </div>

      {importTab === 'sales' ? <SalesHistoryImport /> : (<>

      {/* STEP 1: UPLOAD */}
      {step === STEPS.UPLOAD && (
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px] border-dashed border-2 hover:bg-gray-800/50 transition-colors relative">
          <input 
            type="file" 
            accept=".csv, .xlsx, .xls"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <UploadCloud size={64} className="text-primary-500 mb-6" />
          <h3 className="text-xl font-bold text-white mb-2">Drag & drop your file here</h3>
          <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
            Upload your existing product list (.csv, .xlsx, .xls). No size limit.
          </p>
          <button className="px-6 py-2.5 bg-primary-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-primary-600/20">
            Browse Files
          </button>
        </div>
      )}

      {/* MODE SELECTION MODAL */}
      {showModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-[slideUp_0.2s_ease-out]">
            <div className="p-6 border-b border-white/10">
              <h3 className="text-lg font-bold text-white font-heading">How should we handle existing data?</h3>
              <p className="text-sm text-gray-400">Detected {rawRows.length} rows across {columns.length} columns.</p>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => confirmMode('merge')} className="flex flex-col text-left bg-gray-950 border border-white/5 p-5 rounded-xl hover:border-primary-500 hover:bg-primary-500/5 transition-colors group">
                <Merge size={24} className="text-primary-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-white mb-1">Merge with existing</span>
                <span className="text-xs text-gray-400 leading-relaxed">New products are added alongside existing ones. Nothing gets deleted or overwritten.</span>
              </button>
              <button onClick={() => confirmMode('replace')} className="flex flex-col text-left bg-gray-950 border border-white/5 p-5 rounded-xl hover:border-red-500 hover:bg-red-500/5 transition-colors group">
                <RefreshCw size={24} className="text-red-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="font-bold text-white mb-1 flex items-center gap-2">Replace existing <span className="text-[9px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Destructive</span></span>
                <span className="text-xs text-gray-400 leading-relaxed">All current products and categories will be deleted and replaced with the imported data.</span>
              </button>
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end">
              <button onClick={resetAll} className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: MAPPING */}
      {step === STEPS.MAPPING && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex gap-3">
            <AlertTriangle className="text-amber-500 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-500">Review Column Mapping</h4>
              <p className="text-xs text-amber-500/80 mt-0.5">We've auto-detected your columns. Please review and correct any mistakes. "Product Name" is required.</p>
            </div>
          </div>

          <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-950 border-b border-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-bold">Your Column</th>
                  <th className="px-6 py-4 font-bold">Sample Data</th>
                  <th className="px-6 py-4 font-bold">Mapped To</th>
                  <th className="px-6 py-4 font-bold">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {columns.map(col => {
                  const mappedTo = columnMap[col];
                  const conf = confidence[col];
                  const sample = rawRows.find(r => r[col])?.[col]?.toString().substring(0, 30) || '—';
                  
                  return (
                    <tr key={col} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-4 font-semibold text-white">{col}</td>
                      <td className="px-6 py-4 text-gray-400 font-mono text-xs">{sample}</td>
                      <td className="px-6 py-4">
                        <select 
                          value={mappedTo}
                          onChange={(e) => handleMapChange(col, e.target.value)}
                          className="bg-gray-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 w-full"
                        >
                          {Object.entries(FIELD_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        {conf === 'high' ? <span className="flex items-center gap-1.5 text-xs font-bold text-green-400"><span className="w-2 h-2 rounded-full bg-green-500" /> High</span> :
                         conf === 'medium' ? <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500" /> Medium</span> :
                         <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500"><span className="w-2 h-2 rounded-full bg-gray-500" /> None</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={resetAll} className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={proceedFromMapping} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">
              Next Step <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CATEGORY ASSIGNMENT */}
      {step === STEPS.CATEGORIES && (
        <div className="space-y-6 animate-fadeIn">
          {missingCategories.length === 0 ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-8 text-center flex flex-col items-center">
              <CheckCircle size={48} className="text-green-500 mb-4" />
              <h4 className="text-lg font-bold text-green-400 mb-2">All Products Categorized!</h4>
              <p className="text-sm text-green-500/80 mb-6">Every product in your file already has a category assigned.</p>
              <button onClick={proceedFromCategories} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">
                Continue to Next Step
              </button>
            </div>
          ) : (
            <>
              <div className="bg-gray-900 border border-white/5 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-1">Assign Categories</h3>
                <p className="text-sm text-gray-400 mb-6">We found {missingCategories.length} products without a category. Select them to assign in bulk.</p>
                
                <div className="flex flex-col md:flex-row gap-6">
                  {/* List */}
                  <div className="flex-1 bg-gray-950 border border-white/5 rounded-xl max-h-[400px] overflow-y-auto p-2">
                    {missingCategories.map(m => {
                      const isAssigned = !!categoryAssignments[m.index];
                      if (isAssigned) return null; // hide once assigned
                      const isSelected = bulkCatSelect.has(m.index);
                      return (
                        <div key={m.index} onClick={() => toggleBulkCat(m.index)} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary-600/10 border border-primary-500/30' : 'hover:bg-white/5 border border-transparent'}`}>
                          <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-primary-600" />
                          <span className="text-sm text-gray-200 font-medium truncate">{m.name}</span>
                        </div>
                      );
                    })}
                    {missingCategories.filter(m => !categoryAssignments[m.index]).length === 0 && (
                      <div className="text-center py-10 text-gray-500 text-sm">All items assigned!</div>
                    )}
                  </div>

                  {/* Assignment Controls */}
                  <div className="w-full md:w-72 space-y-4">
                    <div className="bg-gray-950 border border-white/5 rounded-xl p-4">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-3">{bulkCatSelect.size} items selected</p>
                      <input 
                        type="text" 
                        value={newCatInput} 
                        onChange={e => setNewCatInput(e.target.value)}
                        placeholder="Type category name..." 
                        className="w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 mb-3"
                      />
                      <button 
                        onClick={() => handleBulkAssignCat(newCatInput)}
                        disabled={bulkCatSelect.size === 0 || !newCatInput.trim()}
                        className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 mb-4"
                      >
                        Assign to Category
                      </button>
                      <button 
                        onClick={handleAutoGroup}
                        className="w-full py-2 border border-primary-500/30 hover:bg-primary-500/10 text-primary-400 rounded-lg text-sm font-bold transition-colors"
                      >
                        Auto-group by similarity
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setStep(STEPS.MAPPING)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">Back</button>
                <button onClick={proceedFromCategories} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">
                  Next Step <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 4: UNITS */}
      {step === STEPS.UNITS && (
        <div className="space-y-6 animate-fadeIn">
          {unrecognizedUnits.length === 0 ? (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-8 text-center flex flex-col items-center">
              <CheckCircle size={48} className="text-green-500 mb-4" />
              <h4 className="text-lg font-bold text-green-400 mb-2">All Units Normalized!</h4>
              <p className="text-sm text-green-500/80 mb-6">Every unit in your file matches our standard formats.</p>
              <button onClick={proceedFromUnits} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">
                Review Import
              </button>
            </div>
          ) : (
            <>
              <div className="bg-gray-900 border border-white/5 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-1">Normalize Units</h3>
                <p className="text-sm text-gray-400 mb-6">We found {unrecognizedUnits.length} unrecognized unit formats. Please map them to standard units.</p>
                
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {unrecognizedUnits.map(u => (
                    <div key={u} className="flex items-center justify-between bg-gray-950 border border-white/5 p-4 rounded-xl">
                      <span className="font-mono text-sm text-amber-400">"{u}"</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 font-bold uppercase">maps to</span>
                        <select 
                          value={unitAssignments[u] || ''}
                          onChange={(e) => setUnitAssignments(prev => ({ ...prev, [u]: e.target.value }))}
                          className="bg-gray-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-primary-500 w-40"
                        >
                          <option value="" disabled>Select...</option>
                          {['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'dozen', 'pack', 'bag', 'carton'].map(std => <option key={std} value={std}>{std}</option>)}
                          <option value={u}>Keep as Custom "{u}"</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setStep(STEPS.CATEGORIES)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">Back</button>
                <button onClick={proceedFromUnits} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">
                  Review Import <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 5: REVIEW & EDIT */}
      {step === STEPS.REVIEW && (() => {
        const allCats = [...new Set(reviewProducts.map(p => p.category).filter(Boolean))];
        const noPriceCount = reviewProducts.filter(p => !p.price || p.price <= 0).length;
        const noCatCount = reviewProducts.filter(p => !p.category || p.category === 'Uncategorized').length;
        const filtered = reviewSearch
          ? reviewProducts.filter(p => p.name.toLowerCase().includes(reviewSearch.toLowerCase()))
          : reviewProducts;
        const updateP = (id, patch) => setReviewProducts(prev => prev.map(p => p._id === id ? { ...p, ...patch } : p));
        const removeP = (id) => { setReviewProducts(prev => prev.filter(p => p._id !== id)); setDeleteConfirm(null); };
        const toggleSel = (id) => setReviewSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        const selAll = () => { if (reviewSelected.size === filtered.length) setReviewSelected(new Set()); else setReviewSelected(new Set(filtered.map(p => p._id))); };

        return (
          <div className="space-y-5 animate-fadeIn">
            <div>
              <h3 className="text-xl font-bold text-white font-heading mb-1">Review Your Products</h3>
              <p className="text-sm text-gray-400">Edit any details before importing. All changes here are final.</p>
            </div>

            {/* Bulk actions */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <input type="text" value={reviewSearch} onChange={e => setReviewSearch(e.target.value)} placeholder="Search products..." className="bg-gray-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-primary-500 w-56" />
                <Search size={16} className="text-gray-500 -ml-8" />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <input type="number" min="0" value={bulkThreshold} onChange={e => setBulkThreshold(e.target.value)} placeholder="Threshold" className="bg-gray-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none w-24" />
                <button onClick={() => { if (!bulkThreshold) return; setReviewProducts(prev => prev.map(p => ({ ...p, threshold: Number(bulkThreshold) }))); showToast(`Set threshold to ${bulkThreshold} for all`); }} className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors">Apply to All</button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-950 border-b border-white/5 text-gray-400 text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3 w-10"><input type="checkbox" checked={reviewSelected.size > 0 && reviewSelected.size === filtered.length} onChange={selAll} className="w-3.5 h-3.5 accent-primary-600 rounded" /></th>
                      <th className="px-3 py-3 w-8">#</th>
                      <th className="px-3 py-3">Product Name</th>
                      <th className="px-3 py-3">Category</th>
                      <th className="px-3 py-3 w-24">Unit</th>
                      <th className="px-3 py-3 w-24">Price</th>
                      <th className="px-3 py-3 w-20">Threshold</th>
                      <th className="px-3 py-3 w-20">Stock</th>
                      <th className="px-3 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map((p, idx) => {
                      const noPrice = !p.price || p.price <= 0;
                      const noCat = !p.category || p.category === 'Uncategorized';
                      return (
                        <tr key={p._id} className={`hover:bg-white/[0.02] ${noPrice ? 'border-l-2 border-l-amber-500' : noCat ? 'border-l-2 border-l-blue-500' : ''}`}>
                          <td className="px-3 py-2"><input type="checkbox" checked={reviewSelected.has(p._id)} onChange={() => toggleSel(p._id)} className="w-3.5 h-3.5 accent-primary-600 rounded" /></td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <input value={p.name} onChange={e => updateP(p._id, { name: e.target.value })} className="bg-transparent text-white text-sm font-medium outline-none w-full hover:bg-white/5 focus:bg-gray-950 rounded px-1 py-0.5 transition-colors" />
                          </td>
                          <td className="px-3 py-2">
                            <select value={p.category} onChange={e => updateP(p._id, { category: e.target.value })} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none w-full">
                              {allCats.map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="Uncategorized">Uncategorized</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <select value={p.unit} onChange={e => updateP(p._id, { unit: e.target.value })} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none w-full">
                              {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" step="0.01" value={p.price} onChange={e => updateP(p._id, { price: parseFloat(e.target.value) || 0 })} className={`bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none w-full ${noPrice ? 'text-amber-400 border-amber-500/30' : 'text-white'}`} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" value={p.threshold} onChange={e => updateP(p._id, { threshold: parseInt(e.target.value) || 0 })} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none w-full" />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min="0" value={p.qty} onChange={e => updateP(p._id, { qty: parseFloat(e.target.value) || 0 })} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none w-full" />
                          </td>
                          <td className="px-3 py-2">
                            {deleteConfirm === p._id ? (
                              <div className="flex gap-1">
                                <button onClick={() => removeP(p._id)} className="text-[10px] text-red-400 font-bold hover:text-red-300">Yes</button>
                                <button onClick={() => setDeleteConfirm(null)} className="text-[10px] text-gray-500 font-bold hover:text-white">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(p._id)} className="p-1 text-gray-500 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-900 border border-white/5 rounded-xl text-xs">
              <span className="font-bold text-green-400">{reviewProducts.length} products ready</span>
              {noPriceCount > 0 && <span className="font-bold text-amber-400 flex items-center gap-1"><AlertTriangle size={12} /> {noPriceCount} need price</span>}
              {noCatCount > 0 && <span className="font-bold text-blue-400">{noCatCount} uncategorized</span>}
              {noPriceCount > 0 && <span className="text-amber-500/70 ml-auto">{noPriceCount} products have no price — they will import with $0.00</span>}
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(STEPS.UNITS)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">← Back</button>
              <button onClick={proceedFromReview} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 flex items-center gap-2">
                Confirm & Import <ArrowRight size={16} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* STEP 6: CONFIRM */}
      {step === STEPS.CONFIRM && importSummary && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-gray-900 border border-white/5 rounded-2xl p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-2xl font-bold text-white font-heading">Ready to Import</h3>
                <p className="text-sm text-gray-400 mt-1">Review the summary before we write to the database.</p>
              </div>
              <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${mode === 'replace' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-primary-500/20 text-primary-400 border border-primary-500/30'}`}>
                Mode: {mode}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-950 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white mb-1">{importSummary.toAdd}</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Products to Add</p>
              </div>
              <div className="bg-gray-950 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white mb-1">{importSummary.categories.length}</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Categories</p>
              </div>
              <div className="bg-gray-950 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white mb-1">{importSummary.noPrice}</p>
                <p className="text-xs text-amber-500 font-bold uppercase tracking-wider">Missing Price</p>
              </div>
              <div className="bg-gray-950 border border-white/5 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white mb-1">{importSummary.skipped.length}</p>
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Skipped Cols</p>
              </div>
            </div>

            {importSummary.warnings?.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-2 mb-6">
                <div className="flex gap-3">
                  <AlertTriangle className="text-amber-500 shrink-0" />
                  <h4 className="text-sm font-bold text-amber-500">Import Warnings</h4>
                </div>
                <ul className="list-disc pl-10 text-xs text-amber-500/80 space-y-1">
                  {importSummary.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {mode === 'replace' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3 mb-6">
                <AlertTriangle className="text-red-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-red-500">Destructive Action Warning</h4>
                  <p className="text-xs text-red-500/80 mt-0.5">Continuing will immediately delete all your existing products and categories. This cannot be undone.</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setStep(STEPS.REVIEW)} className="px-6 py-3 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">Back to Editing</button>
            <button onClick={executeImport} className="px-8 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-xl shadow-primary-600/20">
              Confirm & Start Import
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: IMPORTING */}
      {step === STEPS.IMPORTING && (
        <div className="bg-gray-900 border border-white/5 rounded-2xl p-12 flex flex-col items-center justify-center text-center animate-fadeIn">
          <RefreshCw size={48} className="text-primary-500 mb-6 animate-spin" />
          <h3 className="text-xl font-bold text-white mb-2">Importing your data...</h3>
          <p className="text-sm text-gray-400 mb-8">Please don't close this tab while we write to the database.</p>
          
          <div className="w-full max-w-md bg-gray-950 rounded-full h-3 overflow-hidden border border-white/5">
            <div 
              className="bg-primary-500 h-full transition-all duration-300 relative overflow-hidden"
              style={{ width: `${Math.max(5, (progress.current / progress.total) * 100)}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite]" />
            </div>
          </div>
          <p className="text-xs font-bold text-gray-500 mt-3">{progress.current} / {progress.total} processed</p>
        </div>
      )}

      {/* STEP 7: SUCCESS */}
      {step === STEPS.SUCCESS && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-12 flex flex-col items-center justify-center text-center animate-fadeIn">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <h3 className="text-2xl font-bold text-green-400 mb-2">Import Complete!</h3>
          <p className="text-sm text-green-500/80 mb-8 max-w-md">Your data has been successfully imported and mapped. You can now view and manage your inventory.</p>
          
          <div className="flex gap-4">
            <button onClick={resetAll} className="px-6 py-3 bg-gray-900 border border-white/10 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">
              Import Another File
            </button>
            <button onClick={() => window.location.href = '/inventory'} className="px-6 py-3 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">
              Go to Inventory
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
