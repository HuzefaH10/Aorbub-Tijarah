import { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { UploadCloud, FileSpreadsheet, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useEntries, useProducts } from '../../hooks/useFirestore';
import { motion, AnimatePresence } from 'framer-motion';

export default function DataImporter() {
  const [isOpen, setIsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [type, setType] = useState('sales'); // 'sales' or 'inventory'
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const { addEntry } = useEntries();
  const { addProduct } = useProducts();
  const fileRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
    }
  };

  const processData = async (data) => {
    let success = 0;
    let errors = 0;
    
    setLoading(true);
    try {
      if (type === 'sales') {
        const promises = data.map(async (row) => {
          if (!row.Product || !row.Date) { errors++; return; }
          const entry = {
            date: row.Date,
            product: row.Product,
            category: row.Category || 'Uncategorized',
            quantitySold: Number(row.Qty || row.Quantity || 0),
            revenue: Number(row.Revenue || 0),
            cost: Number(row.Cost || 0),
            stockAdded: Number(row['Stock Added'] || 0),
            stockRemaining: Number(row['Stock Remaining'] || 0),
          };
          await addEntry(entry);
          success++;
        });
        await Promise.all(promises);
      } else {
        const promises = data.map(async (row) => {
          if (!row.Name) { errors++; return; }
          const prod = {
            name: row.Name,
            category: row.Category || 'Uncategorized',
            unit: row.Unit || 'pcs',
            lowStockThreshold: Number(row.Threshold || 5)
          };
          await addProduct(prod);
          success++;
        });
        await Promise.all(promises);
      }
      setResult({ success, errors });
    } catch (err) {
      console.error(err);
      setResult({ error: 'Failed to process data. Check console.' });
    }
    setLoading(false);
  };

  const handleUpload = () => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processData(results.data)
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet);
        processData(json);
      };
      reader.readAsBinaryString(file);
    } else {
      setResult({ error: 'Unsupported file type. Use CSV or Excel.' });
    }
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
              className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white font-heading">Import Historical Data</h3>
                <button onClick={() => { setIsOpen(false); setFile(null); setResult(null); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {!result ? (
                  <>
                    <div className="flex gap-4">
                      <button onClick={() => setType('sales')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${type === 'sales' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400' : 'border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'}`}>Sales Records</button>
                      <button onClick={() => setType('inventory')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${type === 'inventory' ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 text-primary-600 dark:text-primary-400' : 'border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'}`}>Inventory Products</button>
                    </div>

                    <div
                      onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${dragActive ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/10' : 'border-gray-300 dark:border-gray-700 hover:border-primary-400 dark:hover:border-primary-600'}`}
                    >
                      <input type="file" ref={fileRef} onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setResult(null); } }} className="hidden" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
                      
                      {file ? (
                        <>
                          <FileSpreadsheet size={48} className="text-primary-500 mb-3" />
                          <p className="text-sm font-semibold text-gray-800 dark:text-white">{file.name}</p>
                          <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                        </>
                      ) : (
                        <>
                          <UploadCloud size={48} className="text-gray-400 dark:text-gray-600 mb-3" />
                          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Drag & drop your file here</p>
                          <p className="text-xs text-gray-400 mt-1">Supports .CSV and .XLSX</p>
                        </>
                      )}
                    </div>

                    {file && (
                      <button onClick={handleUpload} disabled={loading} className="w-full bg-primary-600 text-white py-3 rounded-xl font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50">
                        {loading ? 'Processing Data...' : `Import ${type === 'sales' ? 'Sales' : 'Inventory'} Data`}
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
                ) : (
                  <div className="py-8 text-center flex flex-col items-center">
                    {result.error ? (
                      <>
                        <X size={64} className="text-red-500 mb-4" />
                        <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Import Failed</h4>
                        <p className="text-sm text-gray-500">{result.error}</p>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={64} className="text-green-500 mb-4" />
                        <h4 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Import Successful!</h4>
                        <p className="text-sm text-gray-500 mb-6">Successfully imported {result.success} records.</p>
                        {result.errors > 0 && <p className="text-xs text-amber-500 mb-6">Skipped {result.errors} invalid rows.</p>}
                        <button onClick={() => { setIsOpen(false); setFile(null); setResult(null); }} className="px-6 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white rounded-xl font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                          Close Window
                        </button>
                      </>
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
