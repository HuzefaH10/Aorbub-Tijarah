import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

const chartTypes = [
  { id: 'area', name: 'Area Chart', dataset: 'revenueByDate', w: 12, h: 4 },
  { id: 'bar-h', name: 'Horizontal Bar', dataset: 'salesByProduct', w: 6, h: 4 },
  { id: 'donut', name: 'Donut Chart', dataset: 'categorySplit', w: 4, h: 4 },
  { id: 'bar-v', name: 'Column Chart', dataset: 'dailyOrderVolume', w: 6, h: 4 },
  { id: 'grouped', name: 'Grouped Bar', dataset: 'revenueVsCostVsProfit', w: 12, h: 4 },
  { id: 'radial', name: 'Radial Bar', dataset: 'topProductPerformance', w: 4, h: 4 },
  { id: 'scatter', name: 'Scatter Plot', dataset: 'revenueVsQuantity', w: 6, h: 4 },
  { id: 'heatmap', name: 'Weekly Heatmap', dataset: 'weeklyHeatmap', w: 12, h: 4 },
  { id: 'dual-line', name: 'Profit & Margin Trend', dataset: 'profitMarginTrend', w: 12, h: 4 }
];

const tableTypes = [
  { id: 'top-products', name: 'Top Products Table', dataset: 'topProductsTable', w: 12, h: 3 },
  { id: 'period-comp', name: 'Period Comparison', dataset: 'periodComparisonTable', w: 6, h: 3 },
  { id: 'velocity', name: 'Sales Velocity Table', dataset: 'salesVelocityTable', w: 6, h: 3 },
  { id: 'insights', name: 'Auto Insights Panel', dataset: 'insightsPanel', w: 12, h: 3 }
];

export default function Pickers({ type, onClose, onAdd }) {
  const [selectedType, setSelectedType] = useState(null);
  const [customName, setCustomName] = useState('');

  const typesList = type === 'chart' ? chartTypes : tableTypes;

  const handleSelect = (t) => {
    setSelectedType(t);
    setCustomName(t.name);
  };

  const handleAdd = () => {
    if (!selectedType) return;
    onAdd({
      id: `widget_${Date.now()}`,
      type: selectedType.id,
      name: customName || selectedType.name,
      dataset: selectedType.dataset,
      isChart: type === 'chart',
      enabled: true,
      w: selectedType.w,
      h: selectedType.h
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white font-heading">Add a {type === 'chart' ? 'Chart' : 'Table'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-xl text-gray-400 transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {typesList.map((t) => {
              const isSelected = selectedType?.id === t.id;
              return (
                <div 
                  key={t.id} 
                  onClick={() => handleSelect(t)}
                  className={`cursor-pointer rounded-2xl p-4 border-2 transition-all flex flex-col items-center justify-center text-center gap-3 ${isSelected ? 'border-primary-500 bg-primary-900/20' : 'border-gray-800 bg-gray-800/50 hover:border-gray-700 hover:bg-gray-800'}`}
                >
                  <div className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center border border-gray-800">
                    <span className="text-2xl">{type === 'chart' ? '📊' : '📋'}</span>
                  </div>
                  <p className={`font-semibold text-sm ${isSelected ? 'text-primary-400' : 'text-gray-300'}`}>{t.name}</p>
                </div>
              );
            })}
          </div>
        </div>

        {selectedType && (
          <div className="p-6 border-t border-gray-800 bg-gray-950 flex flex-col md:flex-row items-end gap-4 animate-fadeIn">
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Widget Name</label>
              <input 
                value={customName} 
                onChange={e => setCustomName(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-primary-500 transition-all"
              />
            </div>
            <button 
              onClick={handleAdd}
              className="w-full md:w-auto bg-primary-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-primary-700 transition-colors shadow-lg shadow-primary-600/20 whitespace-nowrap"
            >
              Add to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
