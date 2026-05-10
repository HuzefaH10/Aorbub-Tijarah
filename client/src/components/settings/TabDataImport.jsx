import React, { useState, useRef, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  UploadCloud, FileSpreadsheet, RefreshCw, Merge, AlertTriangle, 
  CheckCircle, ArrowRight, ChevronDown, Check, Info, X
} from 'lucide-react';
import Toast, { useToast } from '../ui/Toast';
import { db } from '../../services/firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
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
  CONFIRM: 5,
  IMPORTING: 6,
  SUCCESS: 7
};

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
  const { toast } = useToast();
  
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
  
  // Import state
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState(null);

  // --- Step 1: Parsing ---
  const handleFileUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast('File is too large. Max 10MB.', 'error');
      return;
    }
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
          toast('Spreadsheet is empty', 'error');
        }
      };
      reader.readAsBinaryString(f);
    } else {
      toast('Invalid file type. Please upload CSV or Excel.', 'error');
    }
  };

  const processParsedData = (data, cols) => {
    setRawRows(data);
    setColumns(cols);
    autoDetectColumns(cols);
    setShowModeModal(true);
  };

  const autoDetectColumns = (cols) => {
    const map = {};
    const conf = {};
    
    const mappings = detectColumns(cols, rawRows.slice(0, 5));
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
    if (!Object.values(columnMap).includes('productName')) {
      toast('Product Name is required. Please map a column to it.', 'error');
      return;
    }
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
      toast('Could not find obvious similarities to auto-group.', 'info');
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
    toast(`Auto-grouped items into ${groups.length} categories!`, 'success');
  };

  const proceedFromCategories = () => {
    const unassignedCount = missingCategories.filter(m => !categoryAssignments[m.index]).length;
    if (unassignedCount > 0) {
      toast(`Please assign categories to the remaining ${unassignedCount} products`, 'error');
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
      toast(`Please map all unrecognized units`, 'error');
      return;
    }
    
    // Build summary
    const nameCol = Object.keys(columnMap).find(k => columnMap[k] === 'productName');
    const catCol = Object.keys(columnMap).find(k => columnMap[k] === 'category');
    const priceCol = Object.keys(columnMap).find(k => columnMap[k] === 'price');
    const qtyCol = Object.keys(columnMap).find(k => columnMap[k] === 'quantity');
    const threshCol = Object.keys(columnMap).find(k => columnMap[k] === 'threshold');
    
    let toAdd = 0, withPrice = 0, noPrice = 0, noThresh = 0;
    const catsToCreate = new Set();
    
    rawRows.forEach((row, i) => {
      if (!row[nameCol] || !row[nameCol].toString().trim()) return;
      toAdd++;
      
      const price = priceCol ? parseFloat(row[priceCol]) : NaN;
      if (!isNaN(price) && price > 0) withPrice++; else noPrice++;
      
      const thresh = threshCol ? parseInt(row[threshCol]) : NaN;
      if (isNaN(thresh)) noThresh++;
      
      let cat = catCol && row[catCol] ? row[catCol].toString().trim() : categoryAssignments[i];
      if (cat) catsToCreate.add(cat);
    });

    const skipped = columns.filter(c => columnMap[c] === 'skip');

    const validation = validateImportData(rawRows, columnMap);
    if (!validation.valid) {
      validation.errors.forEach(e => toast(e, 'error'));
      return;
    }

    setImportSummary({
      toAdd,
      categories: Array.from(catsToCreate),
      withPrice, noPrice, noThresh, skipped,
      warnings: validation.warnings
    });
    setStep(STEPS.CONFIRM);
  };

  // --- Step 5: Execute Import ---
  const executeImport = async () => {
    setStep(STEPS.IMPORTING);
    try {
      const nameCol = Object.keys(columnMap).find(k => columnMap[k] === 'productName');
      const catCol = Object.keys(columnMap).find(k => columnMap[k] === 'category');
      const unitCol = Object.keys(columnMap).find(k => columnMap[k] === 'unit');
      const priceCol = Object.keys(columnMap).find(k => columnMap[k] === 'price');
      const qtyCol = Object.keys(columnMap).find(k => columnMap[k] === 'quantity');
      const threshCol = Object.keys(columnMap).find(k => columnMap[k] === 'threshold');

      // Fetch existing if merge
      let existingProducts = [];
      if (mode === 'merge') {
        const qs = await getDocs(query(collection(db, 'products'), where('businessId', '==', activeBusinessId)));
        existingProducts = qs.docs.map(d => d.data().name.toLowerCase());
      } else if (mode === 'replace') {
        // Delete all products and categories
        const pq = await getDocs(query(collection(db, 'products'), where('businessId', '==', activeBusinessId)));
        const cq = await getDocs(query(collection(db, 'categories'), where('businessId', '==', activeBusinessId)));
        
        // chunk deletes into 500 batches
        let delBatch = writeBatch(db);
        let dCount = 0;
        for (const doc of [...pq.docs, ...cq.docs]) {
          delBatch.delete(doc.ref);
          dCount++;
          if (dCount === 500) {
            await delBatch.commit();
            delBatch = writeBatch(db);
            dCount = 0;
          }
        }
        if (dCount > 0) await delBatch.commit();
      }

      // Build valid docs
      const newProducts = [];
      const newCategories = new Set(importSummary.categories);

      rawRows.forEach((row, i) => {
        const name = row[nameCol]?.toString().trim();
        if (!name) return;
        
        if (mode === 'merge' && existingProducts.includes(name.toLowerCase())) return; // skip duplicate

        let cat = catCol && row[catCol] ? row[catCol].toString().trim() : categoryAssignments[i];
        if (!cat) cat = 'Uncategorized';
        
        let unit = 'pcs';
        if (unitCol && row[unitCol]) {
          const rawU = row[unitCol].toString().trim();
          unit = unitAssignments[rawU] || normalizeUnit(rawU) || rawU; 
        }

        const price = priceCol ? parseFloat(row[priceCol]) : 0;
        const qty = qtyCol ? parseFloat(row[qtyCol]) : 0;
        const thresh = threshCol ? parseInt(row[threshCol]) : 5;

        newProducts.push({
          businessId: activeBusinessId,
          name,
          category: cat,
          defaults: {
            unit,
            price: isNaN(price) ? 0 : price,
            threshold: isNaN(thresh) ? 5 : thresh,
          },
          currentStock: isNaN(qty) ? 0 : qty,
          status: (isNaN(qty) ? 0 : qty) <= 0 ? 'out' : (isNaN(qty) ? 0 : qty) <= (isNaN(thresh) ? 5 : thresh) ? 'low' : 'healthy',
          importedAt: serverTimestamp(),
          source: 'csv_import'
        });
      });

      setProgress({ current: 0, total: newProducts.length + newCategories.size });

      // Write batches
      let writeBatchObj = writeBatch(db);
      let wCount = 0;
      let totalProcessed = 0;

      // Categories
      for (const catName of newCategories) {
        const cRef = doc(collection(db, 'categories'));
        writeBatchObj.set(cRef, {
          categoryId: cRef.id,
          businessId: activeBusinessId,
          name: catName,
          createdAt: serverTimestamp(),
          source: 'csv_import'
        });
        wCount++; totalProcessed++;
        if (wCount === 500) { await writeBatchObj.commit(); writeBatchObj = writeBatch(db); wCount = 0; }
      }

      // Products
      for (const p of newProducts) {
        const pRef = doc(collection(db, 'products'));
        writeBatchObj.set(pRef, { productId: pRef.id, ...p });
        wCount++; totalProcessed++;
        if (totalProcessed % 25 === 0) setProgress({ current: totalProcessed, total: newProducts.length + newCategories.size });
        if (wCount === 500) { await writeBatchObj.commit(); writeBatchObj = writeBatch(db); wCount = 0; }
      }

      if (wCount > 0) {
        await writeBatchObj.commit();
        setProgress({ current: newProducts.length + newCategories.size, total: newProducts.length + newCategories.size });
      }

      await writeAuditLog(user, role, `Bulk Import (${mode})`, `Imported ${newProducts.length} products and ${newCategories.size} categories.`, 'System', activeBusinessId);
      
      setStep(STEPS.SUCCESS);
    } catch (err) {
      console.error(err);
      toast('An error occurred during import. Check console.', 'error');
      setStep(STEPS.CONFIRM);
    }
  };

  const resetAll = () => {
    setStep(STEPS.UPLOAD);
    setFile(null);
    setRawRows([]);
    setColumns([]);
    setColumnMap({});
    setConfidence({});
    setCategoryAssignments({});
    setUnitAssignments({});
    setImportSummary(null);
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-6 animate-fadeIn">
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
            Upload your existing product list (.csv, .xlsx, .xls) and we'll automatically map your fields. Max file size 10MB.
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

      {/* STEP 5: CONFIRM */}
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
            <button onClick={() => setStep(STEPS.UNITS)} className="px-6 py-3 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">Back to Editing</button>
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
