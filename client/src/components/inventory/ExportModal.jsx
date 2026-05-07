import React, { useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { X, Download, FileText, FileSpreadsheet, CheckSquare, Square, Calendar } from 'lucide-react';

export default function ExportModal({ onClose, computedData, stockLogs, toast }) {
  const [format, setFormat] = useState('csv');
  const [options, setOptions] = useState({
    allProducts: true,
    lowStock: false,
    outOfStock: false,
    stockHistory: false
  });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const toggleOption = (key) => {
    setOptions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // Mutual exclusion logic for UX
      if (key === 'allProducts' && next.allProducts) {
        next.lowStock = false;
        next.outOfStock = false;
      }
      if ((key === 'lowStock' || key === 'outOfStock') && next[key]) {
        next.allProducts = false;
      }
      return next;
    });
  };

  const handleExport = () => {
    const exportProducts = options.allProducts || options.lowStock || options.outOfStock;
    const exportHistory = options.stockHistory;

    if (!exportProducts && !exportHistory) {
      toast('Please select at least one data set to export', 'error');
      return;
    }

    // 1. Gather Products
    let productsData = [];
    if (exportProducts) {
      productsData = computedData.filter(p => {
        if (options.allProducts) return true;
        if (options.lowStock && p.status === 'low') return true;
        if (options.outOfStock && p.status === 'out') return true;
        return false;
      });
    }

    // 2. Gather Stock History
    let historyData = [];
    if (exportHistory) {
      historyData = stockLogs.filter(l => {
        const d = l.date || '';
        if (dateRange.from && d < dateRange.from) return false;
        if (dateRange.to && d > dateRange.to) return false;
        return true;
      });
    }

    const filename = `inventory-export-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') {
      const rows = [];
      if (productsData.length > 0) {
        if (exportHistory && historyData.length > 0) rows.push(['--- PRODUCTS ---']);
        rows.push(['Product', 'Category', 'Current Stock', 'Threshold', 'Status', 'Last Loaded', 'Unit', 'SKU']);
        productsData.forEach(p => rows.push([
          p.name, p.category, p.currentStock, p.lowStockThreshold, p.status, p.lastLoaded, p.unit, p.sku
        ]));
        if (exportHistory && historyData.length > 0) rows.push([]); // spacer
      }
      if (historyData.length > 0) {
        if (exportProducts && productsData.length > 0) rows.push(['--- STOCK HISTORY ---']);
        rows.push(['Date', 'Product', 'Category', 'Qty Loaded', 'Prev Stock', 'New Stock', 'Supplier', 'Batch Cost', 'Note']);
        historyData.forEach(l => rows.push([
          l.date, l.productName, l.category, l.quantityLoaded, l.previousStock, l.newStock, l.supplier, l.batchCost, l.note
        ]));
      }

      if (rows.length === 0) {
        toast('No data found for the selected options', 'error');
        return;
      }

      const csvContent = Papa.unparse(rows);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', `${filename}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } else {
      // Excel Export
      const wb = XLSX.utils.book_new();
      let hasData = false;

      if (productsData.length > 0) {
        hasData = true;
        const wsData = productsData.map(p => ({
          'Product Name': p.name,
          'Category': p.category,
          'Current Stock': p.currentStock,
          'Unit': p.unit,
          'Threshold': p.lowStockThreshold,
          'Status': p.status.toUpperCase(),
          'Last Loaded': p.lastLoaded,
          'SKU': p.sku
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Products');
      }

      if (historyData.length > 0) {
        hasData = true;
        const wsData = historyData.map(l => ({
          'Date': l.date,
          'Product': l.productName,
          'Category': l.category,
          'Qty Loaded': l.quantityLoaded,
          'Prev Stock': l.previousStock,
          'New Stock': l.newStock,
          'Supplier': l.supplier,
          'Batch Cost': l.batchCost,
          'Note': l.note
        }));
        const ws = XLSX.utils.json_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Stock History');
      }

      if (!hasData) {
        toast('No data found for the selected options', 'error');
        return;
      }

      XLSX.writeFile(wb, `${filename}.xlsx`);
    }

    toast(`Exported successfully as ${format.toUpperCase()}`);
    onClose();
  };

  const Checkbox = ({ label, checked, onChange }) => (
    <div className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-colors" onClick={onChange}>
      {checked ? <CheckSquare size={18} className="text-primary-500" /> : <Square size={18} className="text-gray-500" />}
      <span className="text-sm font-medium text-gray-200">{label}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn p-4">
      <div className="glass w-full max-w-md shadow-2xl scale-95 animate-[scaleIn_0.2s_ease-out_forwards] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-lg font-bold text-white font-heading">Export Data</h2>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Format Toggle */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Export Format</label>
            <div className="flex bg-gray-900 rounded-xl p-1 border border-white/5">
              <button onClick={() => setFormat('csv')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
                  format === 'csv' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
                }`}>
                <FileText size={16} className={format === 'csv' ? 'text-blue-400' : ''} /> CSV
              </button>
              <button onClick={() => setFormat('excel')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
                  format === 'excel' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
                }`}>
                <FileSpreadsheet size={16} className={format === 'excel' ? 'text-green-400' : ''} /> Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* Data to Export */}
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Data to Export</label>
            <div className="space-y-1 bg-gray-900/50 p-3 rounded-xl border border-white/5">
              <Checkbox label="All Products" checked={options.allProducts} onChange={() => toggleOption('allProducts')} />
              <Checkbox label="Low Stock Only" checked={options.lowStock} onChange={() => toggleOption('lowStock')} />
              <Checkbox label="Out of Stock Only" checked={options.outOfStock} onChange={() => toggleOption('outOfStock')} />
              <div className="h-px bg-white/5 my-2 mx-2"></div>
              <Checkbox label="Stock History Log" checked={options.stockHistory} onChange={() => toggleOption('stockHistory')} />
            </div>
          </div>

          {/* Date Range for Stock History */}
          {options.stockHistory && (
            <div className="animate-fadeIn">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">History Date Range (Optional)</label>
              <div className="flex items-center gap-2 bg-gray-900/50 p-3 rounded-xl border border-white/5">
                <Calendar size={16} className="text-gray-500 shrink-0" />
                <input type="date" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} className="w-full bg-transparent text-sm text-gray-300 outline-none" />
                <span className="text-gray-500 text-sm">to</span>
                <input type="date" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} className="w-full bg-transparent text-sm text-gray-300 outline-none" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button onClick={handleExport}
            className="flex-[2] flex items-center justify-center gap-2 py-2.5 bg-primary-600 rounded-xl text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20">
            <Download size={16} /> Export File
          </button>
        </div>
      </div>
    </div>
  );
}
