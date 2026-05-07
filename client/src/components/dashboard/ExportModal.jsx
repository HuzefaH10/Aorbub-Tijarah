import React, { useState, useRef } from 'react';
import { X, FileDown, FileText, CheckSquare, Square, Download, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import JSZip from 'jszip';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import ChartWidget from './ChartWidget';
import TableWidget from './TableWidget';
import { useSettings } from '../../hooks/useFirestore';

export default function ExportModal({ widgets, computedData, dateFilter, onClose, toast }) {
  const { settings } = useSettings();
  const [format, setFormat] = useState('pdf');
  const [selectedIds, setSelectedIds] = useState(widgets.filter(w => w.enabled).map(w => w.id));
  const [isExporting, setIsExporting] = useState(false);
  const pdfContainerRef = useRef(null);

  const activeWidgets = widgets.filter(w => w.enabled);

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getWidgetDataForCsv = (w) => {
    if (w.isCSV && w.csvData) {
      return w.csvData.raw || [];
    }
    
    // Derived datasets mapping
    if (w.dataset === 'revenueByDate') {
      const labels = computedData.revenueByDate?.labels || [];
      const values = computedData.revenueByDate?.values || [];
      return labels.map((l, i) => ({ Date: l, Revenue: values[i] }));
    }
    if (w.dataset === 'salesByProduct') {
      const labels = computedData.revenueByProduct?.labels || [];
      const values = computedData.revenueByProduct?.values || [];
      return labels.map((l, i) => ({ Product: l, Quantity_Sold: values[i] }));
    }
    if (w.dataset === 'categorySplit') {
      const labels = computedData.categorySplit?.labels || [];
      const values = computedData.categorySplit?.values || [];
      return labels.map((l, i) => ({ Category: l, Value: values[i] }));
    }
    if (w.dataset === 'topProductsTable') {
      return computedData.topProductsList || [];
    }
    
    // Other generic datasets 
    if (computedData[w.dataset]) {
       const labels = computedData[w.dataset].labels || [];
       const values = computedData[w.dataset].values || [];
       if (labels.length > 0) {
           return labels.map((l, i) => ({ Label: l, Value: values[i] }));
       }
    }
    return [];
  };

  const handleExportCSV = async () => {
    const selectedWidgets = activeWidgets.filter(w => selectedIds.includes(w.id));
    if (selectedWidgets.length === 0) return toast('Select at least one widget', 'error');

    const dateRangeStr = `${dateFilter.from || 'start'}_to_${dateFilter.to || 'end'}`;

    if (selectedWidgets.length === 1) {
      const w = selectedWidgets[0];
      const data = getWidgetDataForCsv(w);
      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${w.name.replace(/\s+/g, '_')}-${dateRangeStr}.csv`;
      link.click();
    } else {
      const zip = new JSZip();
      selectedWidgets.forEach(w => {
        const data = getWidgetDataForCsv(w);
        const csv = Papa.unparse(data);
        zip.file(`${w.name.replace(/\s+/g, '_')}-${dateRangeStr}.csv`, csv);
      });
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `Analytics_Export_${dateRangeStr}.zip`;
      link.click();
    }
    toast('Export successful');
    onClose();
  };

  const handleExportPDF = async () => {
    const selectedWidgets = activeWidgets.filter(w => selectedIds.includes(w.id));
    if (selectedWidgets.length === 0) return toast('Select at least one widget', 'error');
    
    setIsExporting(true);
    
    try {
      // Need a tiny delay to ensure React renders the hidden container first
      await new Promise(res => setTimeout(res, 300));
      
      const container = pdfContainerRef.current;
      if (!container) throw new Error("No container");

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0a0a0a' // dark background
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      const dateRangeStr = `${dateFilter.from || 'start'}_to_${dateFilter.to || 'end'}`;
      pdf.save(`Sales_Analytics_${dateRangeStr}.pdf`);
      
      toast('PDF Export successful');
      onClose();
    } catch (e) {
      console.error(e);
      toast('Error generating PDF', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = () => {
    if (format === 'csv') handleExportCSV();
    else handleExportPDF();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
        <div className="glass w-full max-w-md shadow-2xl scale-95 animate-[scaleIn_0.2s_ease-out_forwards] overflow-hidden flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-gray-900/50">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-600/20 text-primary-400 rounded-lg">
                <FileDown size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-white font-heading">Export Analytics</h2>
                <p className="text-xs text-gray-500">Download your dashboard data</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={isExporting} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"><X size={18} /></button>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            
            {/* Format Toggle */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Export Format</label>
              <div className="flex gap-2">
                <button onClick={() => setFormat('pdf')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${format === 'pdf' ? 'border-primary-500 bg-primary-600/10 text-primary-400' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                  <FileText size={16} /> <span className="font-bold text-sm">PDF Report</span>
                </button>
                <button onClick={() => setFormat('csv')} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${format === 'csv' ? 'border-primary-500 bg-primary-600/10 text-primary-400' : 'border-white/10 text-gray-400 hover:bg-white/5'}`}>
                  <FileSpreadsheet size={16} /> <span className="font-bold text-sm">CSV Data</span>
                </button>
              </div>
            </div>

            {/* Date Range Summary */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Applied Date Range</label>
              <div className="bg-gray-950 border border-white/5 p-3 rounded-xl flex items-center justify-between text-sm">
                <span className="text-gray-300">{dateFilter.from || 'Start'}</span>
                <span className="text-gray-600">→</span>
                <span className="text-gray-300">{dateFilter.to || 'Today'}</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5">Change this directly on the main dashboard if needed.</p>
            </div>

            {/* Widgets Selection */}
            <div>
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Include Widgets</label>
              <div className="bg-gray-950 border border-white/5 rounded-xl p-2 space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar">
                {activeWidgets.length === 0 ? (
                  <p className="text-xs text-gray-500 p-2">No active widgets to export.</p>
                ) : activeWidgets.map(w => (
                  <button key={w.id} onClick={() => toggleSelection(w.id)} className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors text-left">
                    {selectedIds.includes(w.id) ? <CheckSquare size={16} className="text-primary-500" /> : <Square size={16} className="text-gray-600" />}
                    <span className="text-sm font-medium text-gray-300 truncate">{w.name}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 flex gap-3 shrink-0 bg-gray-950/50">
            <button type="button" onClick={onClose} disabled={isExporting} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-bold text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50">Cancel</button>
            <button onClick={handleExport} disabled={isExporting || selectedIds.length === 0} className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-600/20 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {isExporting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Download size={16} />}
              {isExporting ? 'Generating...' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Container for PDF generation */}
      {isExporting && format === 'pdf' && (
        <div className="fixed top-0 left-0 w-[1000px] bg-[#0a0a0a] p-8 -z-50 opacity-0 pointer-events-none" ref={pdfContainerRef}>
          {/* Header */}
          <div className="mb-8 border-b border-white/10 pb-6">
            <h1 className="text-3xl font-bold text-white font-heading mb-2">Sales Analytics — {settings?.businessName || 'Business'}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <p>Date Range: {dateFilter.from || 'All time'} to {dateFilter.to || 'Present'}</p>
              <p>•</p>
              <p>Exported on: {new Date().toLocaleDateString()}</p>
            </div>
          </div>
          
          {/* Widgets */}
          <div className="space-y-8">
            {activeWidgets.filter(w => selectedIds.includes(w.id)).map((w, idx) => (
              <div key={w.id} className="border border-white/10 rounded-xl bg-gray-900 overflow-hidden" style={{ pageBreakInside: 'avoid' }}>
                <div className="px-5 py-3 border-b border-white/10 bg-black/20">
                  <h3 className="text-lg font-bold text-white font-heading">{w.name}</h3>
                </div>
                <div className="p-4" style={{ minHeight: '300px' }}>
                  {w.isChart ? <ChartWidget widget={w} data={computedData} /> : <TableWidget widget={w} data={computedData} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
