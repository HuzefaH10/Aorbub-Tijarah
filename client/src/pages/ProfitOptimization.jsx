import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactApexChart from 'react-apexcharts';
import { Download, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Toast, { useToast } from '../components/ui/Toast';
import { usePageGuard } from '../hooks/usePageGuard';
import { useBusiness } from '../context/BusinessContext';
import { aggregateBusinessData } from '../utils/profitDataAggregator';
import { forecastRevenue, forecastExpenses, forecastNetProfit, detectAnomalies, calculateGrowthRate } from '../utils/forecastingEngine';
import { generateInsights } from '../utils/insightsEngine';
import { HealthScoreCard, MetricsRow, WarningsStrip, QuickWinsSection, InsightsList, SkeletonLoader } from '../components/profit/ProfitComponents';

const DATE_RANGES = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Custom', days: 0 },
];

export default function ProfitOptimization() {
  usePageGuard('profit_optimization');
  const { activeBusinessId } = useBusiness();
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [rangePreset, setRangePreset] = useState(1); // default Last 30 days
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Data state
  const [aggData, setAggData] = useState(null);
  const [revForecast, setRevForecast] = useState(null);
  const [expForecast, setExpForecast] = useState(null);
  const [profitForecast, setProfitForecast] = useState(null);
  const [insightsResult, setInsightsResult] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [error, setError] = useState(null);
  const runId = useRef(0);

  // Compute date range
  const dateRange = useMemo(() => {
    const preset = DATE_RANGES[rangePreset];
    if (preset.days === 0 && customFrom && customTo) {
      return { from: new Date(customFrom), to: new Date(customTo) };
    }
    const to = new Date();
    const from = new Date(to.getTime() - (preset.days || 30) * 24 * 60 * 60 * 1000);
    return { from, to };
  }, [rangePreset, customFrom, customTo]);

  // Main aggregation runner
  const runAggregation = useCallback(async () => {
    if (!activeBusinessId) return;
    const id = ++runId.current;
    setLoading(true); setProgress(0); setError(null);

    try {
      const data = await aggregateBusinessData(activeBusinessId, null, dateRange, (p) => { if (id === runId.current) setProgress(p); });
      if (id !== runId.current) return; // stale

      setAggData(data);

      // Run engines
      const rf = forecastRevenue(data.sales.revenueByDay, 14);
      const ef = forecastExpenses(data.expenses.expensesByDay, 14);
      setRevForecast(rf);
      setExpForecast(ef);
      setProfitForecast(!rf.insufficient_data && !ef.insufficient_data ? forecastNetProfit(rf, ef) : null);
      setAnomalies(detectAnomalies(data.sales.revenueByDay));
      setGrowth(calculateGrowthRate(data.sales.revenueByDay));
      setInsightsResult(generateInsights(data, rf));
      setLastUpdated(new Date());

      if (data.warnings && data.warnings.length > 0) {
        setError({ partial: true, collections: data.warnings });
      }
    } catch (err) {
      console.error('[ProfitOptimization] Aggregation failed:', err);
      if (id === runId.current) setError({ fatal: true, message: err.message });
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }, [activeBusinessId, dateRange]);

  useEffect(() => { runAggregation(); }, [runAggregation]);

  // Insufficient data check
  const insufficientData = aggData && aggData.sales.revenueByDay.length < 3;

  // Top product
  const topProduct = aggData?.sales?.topSellingProducts?.[0] || null;

  // --- Forecast Chart Data ---
  const forecastChartOpts = useMemo(() => {
    if (!aggData || !revForecast || revForecast.insufficient_data) return null;

    const historical = aggData.sales.revenueByDay;
    const forecast = revForecast.forecast || [];
    const allDates = [...historical.map(d => d.date), ...forecast.map(d => d.date)];
    const actualData = historical.map(d => d.revenue);
    const forecastData = [...new Array(historical.length).fill(null), ...forecast.map(d => d.predictedRevenue)];
    const lowerData = [...new Array(historical.length).fill(null), ...forecast.map(d => d.lowerBound)];
    const upperData = [...new Array(historical.length).fill(null), ...forecast.map(d => d.predictedUpperBound)];

    const series = [
      { name: 'Actual Revenue', data: actualData, type: 'area' },
      { name: 'Forecast', data: forecastData, type: 'line' },
      { name: 'Upper Bound', data: upperData, type: 'line' },
      { name: 'Lower Bound', data: lowerData, type: 'line' },
    ];

    const options = {
      chart: { background: 'transparent', foreColor: '#9a9080', toolbar: { show: true, tools: { zoom: true, pan: true, reset: true } }, animations: { enabled: true } },
      colors: ['var(--accent-primary, #c9a84c)', 'var(--accent-secondary, #e0ab2a)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.15)'],
      stroke: { curve: 'smooth', width: [2, 2, 1, 1], dashArray: [0, 6, 4, 4] },
      fill: {
        type: ['gradient', 'solid', 'solid', 'solid'],
        gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05, stops: [0, 100] },
      },
      dataLabels: { enabled: false },
      grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
      xaxis: { categories: allDates, labels: { rotate: -45, style: { fontSize: '10px' }, formatter: (v) => v ? v.slice(5) : '' }, tooltip: { enabled: false } },
      yaxis: { title: { text: 'AED Revenue', style: { color: '#9a9080' } }, labels: { formatter: v => `${Math.round(v).toLocaleString()}` } },
      tooltip: { theme: 'dark', style: { fontSize: '12px', fontFamily: 'DM Sans' }, shared: true },
      legend: { show: true, labels: { colors: '#9a9080' } },
      annotations: {
        xaxis: historical.length > 0 ? [{
          x: historical[historical.length - 1].date,
          strokeDashArray: 4, borderColor: 'rgba(255,255,255,0.2)',
          label: { text: 'Forecast starts', style: { color: '#fff', background: 'rgba(255,255,255,0.1)', fontSize: '10px' } }
        }] : []
      }
    };

    return { series, options };
  }, [aggData, revForecast]);

  // --- Render ---
  if (loading) return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="glass p-5 shadow-xl"><h1 className="text-2xl font-bold text-primary-400 font-heading">Profit Optimization</h1><p className="text-sm text-gray-500 mt-1">Loading your business intelligence...</p></div>
      <SkeletonLoader progress={progress} />
    </div>
  );

  if (error?.fatal) return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="glass p-5 shadow-xl"><h1 className="text-2xl font-bold text-primary-400 font-heading">Profit Optimization</h1></div>
      <div className="glass p-8 text-center"><AlertTriangle size={32} className="text-red-400 mx-auto mb-3" /><p className="text-red-400 font-bold">Failed to load data</p><p className="text-xs text-gray-500 mt-1">{error.message}</p><button onClick={runAggregation} className="mt-4 px-4 py-2 bg-primary-500/20 text-primary-400 rounded-lg text-sm font-bold hover:bg-primary-500/30 transition-colors">Retry</button></div>
    </div>
  );

  if (insufficientData) return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="glass p-5 shadow-xl"><h1 className="text-2xl font-bold text-primary-400 font-heading">Profit Optimization</h1></div>
      <div className="glass p-12 text-center"><Lightbulb size={40} className="text-primary-500 mx-auto mb-4 opacity-50" /><h2 className="text-xl font-bold text-white font-heading mb-2">Not Enough Data Yet</h2><p className="text-sm text-gray-400 max-w-md mx-auto">You need at least 3 days of sales data to generate insights. Keep recording your sales and check back soon.</p><button onClick={() => navigate('/data-entry')} className="mt-6 px-5 py-2.5 bg-primary-500/20 text-primary-400 rounded-xl text-sm font-bold hover:bg-primary-500/30 transition-colors">Record a Sale →</button></div>
    </div>
  );

  const trendIcon = revForecast?.trend === 'upward' ? <TrendingUp size={14} /> : revForecast?.trend === 'downward' ? <TrendingDown size={14} /> : <Minus size={14} />;
  const trendColor = revForecast?.trend === 'upward' ? 'text-green-400 bg-green-400/10' : revForecast?.trend === 'downward' ? 'text-red-400 bg-red-400/10' : 'text-gray-400 bg-gray-400/10';
  const confColor = revForecast?.confidence === 'high' ? 'text-green-400 bg-green-400/10' : revForecast?.confidence === 'medium' ? 'text-amber-400 bg-amber-400/10' : 'text-gray-400 bg-gray-400/10';

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 glass p-5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 font-heading">Profit Optimization</h1>
          <p className="text-sm text-gray-500 mt-1">Insights and forecasts based on your business data</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {DATE_RANGES.map((r, i) => (
              <button key={i} onClick={() => setRangePreset(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${rangePreset === i ? 'bg-primary-500/20 border-primary-500/40 text-primary-400' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
                {r.label}
              </button>
            ))}
          </div>
          {rangePreset === 3 && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" />
              <span className="text-gray-500 text-xs">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={runAggregation} className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:bg-white/5 transition-colors">
              <RefreshCw size={14} /> Refresh
            </button>
            {lastUpdated && <span className="text-[9px] text-gray-600">Updated {lastUpdated.toLocaleTimeString()}</span>}
          </div>
        </div>
      </div>

      {/* PARTIAL ERROR BANNER */}
      {error?.partial && (
        <div className="glass !border-amber-500/30 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-400 font-bold">Some data could not be loaded. Insights may be incomplete.</p>
            <p className="text-xs text-gray-500 mt-1">Failed: {error.collections.join(', ')}</p>
          </div>
        </div>
      )}

      {/* HEALTH SCORE */}
      {insightsResult && <HealthScoreCard score={insightsResult.score} scoreLabel={insightsResult.scoreLabel} summary={insightsResult.summary} />}

      {/* KEY METRICS */}
      {aggData && <MetricsRow sales={aggData.sales} expenses={aggData.expenses} profitLoss={aggData.profitLoss} comparisons={aggData.comparisons} topProduct={topProduct} />}

      {/* WARNINGS */}
      {insightsResult && <WarningsStrip warnings={insightsResult.warnings} />}

      {/* QUICK WINS */}
      {insightsResult && <QuickWinsSection quickWins={insightsResult.quickWins} />}

      {/* FORECAST CHART */}
      <div className="glass p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-lg font-bold text-white font-heading">Revenue Forecast (Next 14 Days)</h3>
          {revForecast && !revForecast.insufficient_data && (
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${trendColor}`}>{trendIcon} {revForecast.trend}</span>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${confColor}`}>Confidence: {revForecast.confidence}</span>
            </div>
          )}
        </div>
        {forecastChartOpts ? (
          <div className="h-[350px] overflow-x-auto">
            <ReactApexChart options={forecastChartOpts.options} series={forecastChartOpts.series} type="line" height="100%" />
          </div>
        ) : (
          <div className="h-[300px] flex flex-col items-center justify-center text-center">
            <TrendingUp size={32} className="text-gray-700 mb-3" />
            <p className="text-sm text-gray-500">Not enough data for forecasting.</p>
            <p className="text-xs text-gray-600 mt-1">Keep recording sales to unlock forecasts.</p>
          </div>
        )}
        {growth && growth.rSquared > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 rounded-lg p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Week/Week</p>
              <span className={`text-sm font-bold ${growth.weekOverWeek >= 0 ? 'text-green-400' : 'text-red-400'}`}>{growth.weekOverWeek >= 0 ? '+' : ''}{growth.weekOverWeek}%</span>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Month/Month</p>
              <span className={`text-sm font-bold ${growth.monthOverMonth >= 0 ? 'text-green-400' : 'text-red-400'}`}>{growth.monthOverMonth >= 0 ? '+' : ''}{growth.monthOverMonth}%</span>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Projected 30d Rev</p>
              <span className="text-sm font-bold text-white">AED {growth.projectedMonthlyRevenue?.toLocaleString()}</span>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Trend Fit (R²)</p>
              <span className="text-sm font-bold text-white">{growth.rSquared?.toFixed(3)}</span>
            </div>
          </div>
        )}
      </div>

      {/* INSIGHTS LIST */}
      {insightsResult && <InsightsList insights={insightsResult.insights} />}
    </div>
  );
}
