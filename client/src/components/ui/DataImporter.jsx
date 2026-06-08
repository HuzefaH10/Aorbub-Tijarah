import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { UploadCloud, FileSpreadsheet, X, CheckCircle, AlertTriangle, Loader2, Download } from 'lucide-react';
import { useEntries, useProducts } from '../../hooks/useFirestore';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../services/firebase';
import { writeBatch, collection, doc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { IMPORT_CONFIG } from '../../constants/importConfig';

// For files above 50MB in future: consider uploading raw file to Firebase Storage first,
// then processing server-side via a Cloud Function trigger.
// Current implementation handles files up to ~50MB client-side efficiently.

export default function DataImporter() {
  const [isOpen, setIsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [type, setType] = useState('sales'); // 'sales' or 'inventory'
  const [loading, setLoading] = useState(false);
  
  // Progress & State
  const [showWarning, setShowWarning] = useState(false);
  const [warningData, setWarningData] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  const [isCancelled, setIsCancelled] = useState(false);
  const [result, setResult] = useState(null);
  const [failedRows, setFailedRows] = useState([]);
  
  const { entries } = useEntries();
  const { products } = useProducts();
  const { activeBusinessId } = useBusiness();
  const { user } = useAuth();
  const fileRef = useRef(null);
  
  // Ref for cancellation
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = isCancelled;
  }, [isCancelled]);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (f) => {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (!IMPORT_CONFIG.supportedFormats.includes(ext)) {
      setResult({ error: 'Unsupported file format. Please upload a .csv, .xlsx, or .xls file.' });
      return;
    }
    if (IMPORT_CONFIG.maxFileSizeMB && f.size > IMPORT_CONFIG.maxFileSizeMB * 1024 * 1024) {
       setResult({ error: `File exceeds maximum size of ${IMPORT_CONFIG.maxFileSizeMB}MB.` });
       return;
    }
    setFile(f);
    setResult(null);
    setFailedRows([]);
    setProgress({ current: 0, total: 0, status: '' });
    setShowWarning(false);
    setIsCancelled(false);
    cancelRef.current = false;
  };

  const resetState = () => {
    setIsOpen(false);
    setFile(null);
    setResult(null);
    setFailedRows([]);
    setShowWarning(false);
    setIsCancelled(false);
    setProgress({ current: 0, total: 0, status: '' });
  };

  // 1. Build unique set for duplicate detection
  const buildDuplicateSet = () => {
    const set = new Set();
    if (type === 'sales') {
      entries.forEach(e => set.add(`${e.date}_${e.revenue}`));
    } else {
      products.forEach(p => set.add(p.name));
    }
    return set;
  };

  // 2. Commit a chunk via Batch
  const commitChunk = async (chunk, existingSet, stats) => {
    if (chunk.length === 0) return;
    const batch = writeBatch(db);
    const collectionName = type === 'sales' ? 'entries' : 'products';
    
    let processedInChunk = 0;

    for (const row of chunk) {
      // Validate mapping exactly as before
      if (type === 'sales') {
        if (!row.Product || !row.Date) {
          stats.errors++;
          stats.failedRows.push({ ...row, _error: 'Missing Product or Date' });
          continue;
        }
        const rev = Number(row.Revenue || 0);
        const uniqueKey = `${row.Date}_${rev}`;
        if (existingSet.has(uniqueKey)) {
          stats.duplicates++;
          continue;
        }
        existingSet.add(uniqueKey); // add to set so we don't insert dups within same file
        
        const entry = {
          date: row.Date,
          product: row.Product,
          category: row.Category || 'Uncategorized',
          quantitySold: Number(row.Qty || row.Quantity || 0),
          revenue: rev,
          cost: Number(row.Cost || 0),
          stockAdded: Number(row['Stock Added'] || 0),
          stockRemaining: Number(row['Stock Remaining'] || 0),
          businessId: activeBusinessId,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const ref = doc(collection(db, collectionName));
        batch.set(ref, entry);
        processedInChunk++;

      } else {
        if (!row.Name) {
          stats.errors++;
          stats.failedRows.push({ ...row, _error: 'Missing Name' });
          continue;
        }
        if (existingSet.has(row.Name)) {
          stats.duplicates++;
          continue;
        }
        existingSet.add(row.Name);
        
        const prod = {
          name: row.Name,
          category: row.Category || 'Uncategorized',
          unit: row.Unit || 'pcs',
          lowStockThreshold: Number(row.Threshold || 5),
          businessId: activeBusinessId,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const ref = doc(collection(db, collectionName));
        batch.set(ref, prod);
        processedInChunk++;
      }
    }

    if (processedInChunk > 0) {
      await batch.commit();
      stats.success += processedInChunk;
    }
  };

  // 3. Process array (Excel)
  const processArrayData = async (data) => {
    setLoading(true);
    setProgress({ current: 0, total: data.length, status: `Processing rows 0 of ${data.length}...` });

    const stats = { success: 0, errors: 0, duplicates: 0, failedRows: [] };
    const existingSet = buildDuplicateSet();

    try {
      for (let i = 0; i < data.length; i += IMPORT_CONFIG.chunkSize) {
        if (cancelRef.current) {
          setProgress(p => ({ ...p, status: `Import cancelled. ${stats.success} rows were imported before cancellation.` }));
          break;
        }
        const chunk = data.slice(i, i + IMPORT_CONFIG.chunkSize);
        await commitChunk(chunk, existingSet, stats);
        setProgress({ current: Math.min(i + IMPORT_CONFIG.chunkSize, data.length), total: data.length, status: `Processing rows ${Math.min(i + IMPORT_CONFIG.chunkSize, data.length)} of ${data.length}...` });
      }
      setResult({ ...stats, cancelled: cancelRef.current });
      setFailedRows(stats.failedRows);
    } catch (err) {
      console.error(err);
      setResult({ error: 'Failed to process data. Check console.' });
    }
    setLoading(false);
  };

  // 4. Process CSV (Streaming)
  const processCSVStream = () => {
    setLoading(true);
    setProgress({ current: 0, total: '?', status: 'Processed 0 rows so far...' });

    const stats = { success: 0, errors: 0, duplicates: 0, failedRows: [] };
    const existingSet = buildDuplicateSet();
    
    let chunk = [];
    let totalRowsProcessed = 0;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      step: async (results, parser) => {
        if (cancelRef.current) {
          parser.abort();
          return;
        }
        chunk.push(results.data);
        if (chunk.length >= IMPORT_CONFIG.chunkSize) {
          parser.pause(); // Wait for chunk commit
          const currentChunk = [...chunk];
          chunk = [];
          await commitChunk(currentChunk, existingSet, stats);
          totalRowsProcessed += currentChunk.length;
          setProgress({ current: totalRowsProcessed, total: '?', status: `Processed ${totalRowsProcessed} rows so far...` });
          parser.resume();
        }
      },
      complete: async () => {
        if (!cancelRef.current && chunk.length > 0) {
          await commitChunk(chunk, existingSet, stats);
          totalRowsProcessed += chunk.length;
          setProgress({ current: totalRowsProcessed, total: '?', status: `Processed ${totalRowsProcessed} rows so far...` });
        }
        setResult({ ...stats, cancelled: cancelRef.current, total: totalRowsProcessed });
        setFailedRows(stats.failedRows);
        setLoading(false);
      },
      error: (err) => {
        setResult({ error: `Parse error: ${err.message}` });
        setLoading(false);
      }
    });
  };

  const handleUpload = () => {
    if (!file) return;
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    
    if (ext === '.csv') {
      processCSVStream();
    } else {
      // Excel files
      setLoading(true);
      setProgress({ current: 0, total: 0, status: 'Reading Excel file...' });
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          
          if (json.length > IMPORT_CONFIG.maxRowsWarningThreshold && !showWarning) {
             setWarningData(json);
             setShowWarning(true);
             setLoading(false);
          } else {
             processArrayData(json);
          }
        } catch (err) {
          setResult({ error: 'Failed to read Excel file.' });
          setLoading(false);
        }
      };
      reader.readAsBinaryString(file);
    }
  };

  const downloadErrorReport = () => {
    if (failedRows.length === 0) return;
    const csv = Papa.unparse(failedRows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import_errors_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* Floating Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-primary-500 hover:bg-primary-600 text-white p-4 rounded-full shadow-2xl shadow-primary-500/40 flex items-center gap-2 group transition-colors"
      >
        <UploadCloud size={24} />
        <span className="hidden group-hover:block font-semibold text-sm pr-2 overflow-hidden whitespace-nowrap">Import Data</span>
      </motion.button>

      {/* Upload Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/10 shrink-0">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white font-heading">Import Historical Data</h3>
                <button disabled={loading && !isCancelled} onClick={resetState} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                {!result && !showWarning && !loading ? (
                  <>
                    <div className="flex gap-4">
                      <button onClick={() => setType('sales')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${type === 'sales' ? 'glass !bg-primary-900/20 border-primary-500 text-primary-400' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>Sales Records</button>
                      <button onClick={() => setType('inventory')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${type === 'inventory' ? 'glass !bg-primary-900/20 border-primary-500 text-primary-400' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>Inventory Products</button>
                    </div>

                    <div
                      onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${dragActive ? 'border-primary-500 bg-primary-900/10' : 'border-white/10 hover:border-primary-500 hover:bg-white/5'}`}
                    >
                      <input type="file" ref={fileRef} onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} className="hidden" accept=".csv, .xlsx, .xls" />
                      
                      {file ? (
                        <>
                          <FileSpreadsheet size={48} className="text-primary-500 mb-3" />
                          <p className="text-sm font-semibold text-gray-800 dark:text-white">{file.name}</p>
                          <p className="text-xs text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </>
                      ) : (
                        <>
                          <UploadCloud size={48} className="text-gray-400 dark:text-gray-600 mb-3" />
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Drag & drop your file here</p>
                          <p className="text-xs text-gray-400 mt-1">Supports .CSV, .XLSX, .XLS</p>
                        </>
                      )}
                    </div>

                    {file && (
                      <button onClick={handleUpload} className="w-full bg-primary-600 text-white py-3 rounded-xl font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">
                        Start Import
                      </button>
                    )}
                    
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 p-4 rounded-xl flex items-start gap-3 text-amber-800 dark:text-amber-400">
                      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <p className="font-semibold">Required Columns:</p>
                        {type === 'sales' ? (
                          <p>Date, Product, Category, Qty, Revenue, Cost</p>
                        ) : (
                          <p>Name, Category, Unit, Threshold</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : loading ? (
                  <div className="py-8 text-center flex flex-col items-center">
                    <Loader2 size={48} className="text-primary-500 mb-4 animate-spin" />
                    <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Importing Data...</h4>
                    <p className="text-sm text-gray-500 mb-4">{progress.status}</p>
                    
                    {progress.total !== '?' && progress.total > 0 && (
                       <div className="w-full bg-white/10 rounded-full h-2 mb-6 overflow-hidden">
                         <div className="bg-primary-500 h-2 rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
                       </div>
                    )}

                    {!isCancelled && (
                       <button onClick={() => setIsCancelled(true)} className="px-6 py-2.5 bg-red-500/10 text-red-500 rounded-xl font-semibold hover:bg-red-500/20 transition-colors">
                         Cancel Import
                       </button>
                    )}
                  </div>
                ) : showWarning ? (
                  <div className="py-6 text-center flex flex-col items-center">
                     <AlertTriangle size={48} className="text-amber-500 mb-4" />
                     <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Large File Warning</h4>
                     <p className="text-sm text-gray-400 mb-6 max-w-sm">This file contains {warningData?.length} rows. Import may take a few minutes. Do not close this tab during import.</p>
                     <div className="flex gap-4 w-full">
                       <button onClick={resetState} className="flex-1 px-4 py-2.5 glass text-gray-400 hover:text-white rounded-xl font-bold transition-all">Cancel</button>
                       <button onClick={() => { setShowWarning(false); processArrayData(warningData); }} className="flex-1 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 transition-colors">Proceed</button>
                     </div>
                  </div>
                ) : (
                  <div className="py-6 flex flex-col">
                    <div className="text-center mb-6">
                      {result.error ? (
                        <X size={48} className="text-red-500 mx-auto mb-3" />
                      ) : (
                        <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                      )}
                      <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-1">
                        {result.error ? 'Import Failed' : result.cancelled ? 'Import Cancelled' : 'Import Complete'}
                      </h4>
                      {result.error && <p className="text-sm text-gray-500">{result.error}</p>}
                    </div>

                    {!result.error && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                           <div className="glass p-3 text-center rounded-xl border border-green-500/20 bg-green-500/5">
                             <div className="text-xl font-bold text-green-400 font-heading">{result.success}</div>
                             <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mt-1">Imported</div>
                           </div>
                           <div className="glass p-3 text-center rounded-xl border border-amber-500/20 bg-amber-500/5">
                             <div className="text-xl font-bold text-amber-400 font-heading">{result.duplicates}</div>
                             <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mt-1">Skipped (Dup)</div>
                           </div>
                           <div className="glass p-3 text-center rounded-xl border border-red-500/20 bg-red-500/5">
                             <div className="text-xl font-bold text-red-400 font-heading">{result.errors}</div>
                             <div className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mt-1">Failed</div>
                           </div>
                        </div>

                        {result.errors > 0 && (
                          <div className="mt-4 border border-red-500/20 rounded-xl overflow-hidden">
                            <div className="bg-red-500/10 px-4 py-2 flex items-center justify-between">
                              <span className="text-xs font-bold text-red-400">Failed Rows (First 10)</span>
                              <button onClick={downloadErrorReport} className="text-[10px] flex items-center gap-1 font-bold text-red-400 hover:text-red-300">
                                <Download size={12} /> Download Report
                              </button>
                            </div>
                            <div className="max-h-[150px] overflow-y-auto custom-scrollbar p-3 space-y-2 bg-gray-950">
                              {failedRows.slice(0, 10).map((r, i) => (
                                <div key={i} className="text-[10px] text-gray-400 border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                  <span className="text-red-400 font-bold mr-2">Row error: {r._error}</span>
                                  {JSON.stringify(r)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <button onClick={resetState} className="w-full mt-4 px-6 py-3 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          Close Window
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
