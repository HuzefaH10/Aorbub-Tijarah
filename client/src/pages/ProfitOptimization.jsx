import React, { useState, useMemo } from 'react';
import { useEntries } from '../hooks/useFirestore';
import ReactApexChart from 'react-apexcharts';
import { Download, TrendingUp, TrendingDown, DollarSign, Percent, AlertCircle, Lightbulb, Activity, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Toast, { useToast } from '../components/ui/Toast';

// --- DATA HELPERS ---
const groupBy = (array, key) => {
  return array.reduce((acc, obj) => {
    const property = obj[key] || 'Uncategorized';
    if (!acc[property]) {
      acc[property] = [];
    }
    acc[property].push(obj);
    return acc;
  }, {});
};

// --- AI LOGIC (Rule-based) ---
function computeHealthScore(entries) {
  if (!entries || entries.length === 0) return 0;

  const totalRev = entries.reduce((s, e) => s + e.revenue, 0);
  const totalCost = entries.reduce((s, e) => s + e.cost, 0);
  const totalProfit = totalRev - totalCost;

  let score = 0;

  // Factor 1: Profit margin (max 35 points)
  const margin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
  if (margin >= 30) score += 35;
  else if (margin >= 20) score += 25;
  else if (margin >= 10) score += 15;
  else if (margin >= 0) score += 5;

  // Factor 2: Revenue trend (max 25 points)
  const today = new Date();
  const startOfThisWeek = new Date(today);
  startOfThisWeek.setDate(today.getDate() - today.getDay());
  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

  const thisWeekEntries = entries.filter(e => new Date(e.date) >= startOfThisWeek);
  const lastWeekEntries = entries.filter(e => new Date(e.date) >= startOfLastWeek && new Date(e.date) < startOfThisWeek);
  
  const thisWeekRev = thisWeekEntries.reduce((s, e) => s + e.revenue, 0);
  const lastWeekRev = lastWeekEntries.reduce((s, e) => s + e.revenue, 0);

  if (thisWeekRev > lastWeekRev) score += 25;
  else if (thisWeekRev === lastWeekRev && thisWeekRev > 0) score += 15;
  else score += 5;

  // Factor 3: Cost ratio (max 25 points)
  const costRatio = totalRev > 0 ? totalCost / totalRev : 1;
  if (costRatio < 0.4) score += 25;
  else if (costRatio < 0.6) score += 18;
  else if (costRatio < 0.75) score += 10;
  else score += 2;

  // Factor 4: Consistency (max 15 points)
  const last14Days = new Date();
  last14Days.setDate(today.getDate() - 14);
  const uniqueDates = new Set(entries.filter(e => new Date(e.date) >= last14Days).map(e => e.date));
  const activeDays = uniqueDates.size;

  if (activeDays >= 10) score += 15;
  else if (activeDays >= 7) score += 10;
  else if (activeDays >= 3) score += 5;

  return Math.min(100, Math.round(score));
}

function generateSuggestions(entries, byProduct) {
  if (!entries || entries.length === 0) return [];
  const suggs = [];

  const totalRev = entries.reduce((s, e) => s + e.revenue, 0);
  const totalCost = entries.reduce((s, e) => s + e.cost, 0);
  const totalProfit = totalRev - totalCost;
  const overallMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
  const costRatio = totalRev > 0 ? (totalCost / totalRev * 100) : 100;

  // --- CRITICAL ---
  if (totalProfit < 0) {
    suggs.push({ priority: 'critical', title: 'Business at a loss', text: `Your business is currently at a loss. Total loss: $${Math.abs(totalProfit).toLocaleString()}. Immediate cost review recommended.`, action: 'Review costs', link: '/analytics' });
  }
  if (costRatio > 80 && totalRev > 0) {
    suggs.push({ priority: 'critical', title: 'High Cost Ratio', text: `Your costs consume ${costRatio.toFixed(1)}% of revenue. This leaves very little room for profit. Target: below 60%.`, action: 'Analyze expenses', link: '/analytics' });
  }

  // --- WARNING ---
  if (overallMargin > 0 && overallMargin < 15) {
    suggs.push({ priority: 'warning', title: 'Low Overall Margin', text: `Your overall margin of ${overallMargin.toFixed(1)}% is below the healthy threshold of 15%. Look for cost reduction opportunities.`, action: 'Optimize pricing', link: null });
  }
  
  const today = new Date();
  const last7Days = new Date(today); last7Days.setDate(today.getDate() - 7);
  const hasRecent = entries.some(e => new Date(e.date) >= last7Days);
  if (!hasRecent) {
    suggs.push({ priority: 'warning', title: 'Data Stale', text: `No activity logged in the past week. Keep your data up to date for accurate insights.`, action: 'Log entries', link: '/data-entry' });
  }

  // Product specific logic
  let highestMarginProd = null;
  let highestMarginVal = -1;

  Object.keys(byProduct).forEach(pName => {
    const pEntries = byProduct[pName];
    const pRev = pEntries.reduce((s, e) => s + e.revenue, 0);
    const pCost = pEntries.reduce((s, e) => s + e.cost, 0);
    const pMargin = pRev > 0 ? ((pRev - pCost) / pRev * 100) : 0;
    const pQty = pEntries.reduce((s, e) => s + e.quantitySold, 0);
    const losses = pEntries.filter(e => e.revenue < e.cost).length;

    if (pMargin < 0 && losses >= 3) {
      suggs.push({ priority: 'critical', title: 'Consistent Loss Maker', text: `Product "${pName}" is consistently loss-making across ${losses} entries. Consider removing it or repricing.`, action: 'Edit Product', link: '/inventory' });
    }

    if (pMargin > highestMarginVal && pQty > 0) {
      highestMarginVal = pMargin;
      highestMarginProd = { name: pName, margin: pMargin, qty: pQty };
    }
  });

  // --- OPPORTUNITY ---
  if (highestMarginProd && highestMarginProd.qty < 50) {
    suggs.push({ priority: 'opportunity', title: 'Hidden Gem Product', text: `"${highestMarginProd.name}" has your highest margin (${highestMarginProd.margin.toFixed(1)}%) but low sales volume. Promoting it could significantly boost profit.`, action: 'Boost visibility', link: null });
  }
  if (overallMargin > 25) {
    suggs.push({ priority: 'opportunity', title: 'Healthy Operations', text: `Your business is performing well. Consider reinvesting a percentage of profit into inventory expansion.`, action: 'View Stock', link: '/inventory' });
  }

  // Deduplicate and limit
  const deduped = [];
  const seen = new Set();
  for (const s of suggs) {
    if (!seen.has(s.title)) {
      seen.add(s.title);
      deduped.push(s);
    }
  }

  const crit = deduped.filter(s => s.priority === 'critical').slice(0, 3);
  const warn = deduped.filter(s => s.priority === 'warning').slice(0, 4);
  const opp = deduped.filter(s => s.priority === 'opportunity').slice(0, 4);

  return [...crit, ...warn, ...opp];
}


// --- MAIN COMPONENT ---
export default function ProfitOptimization() {
  const { entries } = useEntries();
  const navigate = useNavigate();
  const { toast, showToast, hideToast } = useToast();

  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [activeSeries, setActiveSeries] = useState({ revenue: true, cost: true, profit: true, margin: true });

  // Sliders for Scenario Simulator
  const [scenario, setScenario] = useState({ revGrowth: 0, costRed: 0, priceInc: 0, volInc: 0 });

  // Filtering
  const filteredEntries = useMemo(() => {
    let list = [...entries];
    if (dateRange.from) list = list.filter(e => e.date >= dateRange.from);
    if (dateRange.to) list = list.filter(e => e.date <= dateRange.to);
    return list;
  }, [entries, dateRange]);

  // Base Computations
  const computed = useMemo(() => {
    const totalRev = filteredEntries.reduce((s, e) => s + e.revenue, 0);
    const totalCost = filteredEntries.reduce((s, e) => s + e.cost, 0);
    const totalProfit = totalRev - totalCost;
    const overallMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;

    const byDateObj = groupBy(filteredEntries, 'date');
    const sortedDates = Object.keys(byDateObj).sort();
    
    const chartData = {
      dates: sortedDates,
      revenue: [],
      cost: [],
      profit: [],
      margin: [],
      annotations: []
    };

    let peakRev = { val: 0, date: null };

    sortedDates.forEach(d => {
      const dayEntries = byDateObj[d];
      const dRev = dayEntries.reduce((s, e) => s + e.revenue, 0);
      const dCost = dayEntries.reduce((s, e) => s + e.cost, 0);
      const dProf = dRev - dCost;
      const dMarg = dRev > 0 ? (dProf / dRev * 100) : 0;
      
      chartData.revenue.push(dRev);
      chartData.cost.push(dCost);
      chartData.profit.push(dProf);
      chartData.margin.push(dMarg);

      if (dProf < 0) chartData.annotations.push({ x: d, label: 'Loss day', color: '#e05c5c' });
      if (dRev > peakRev.val) { peakRev = { val: dRev, date: d }; }
    });

    if (peakRev.date) {
      chartData.annotations.push({ x: peakRev.date, label: 'Peak revenue', color: '#c9a84c' });
    }

    const byProductObj = groupBy(filteredEntries, 'product');
    const marginTableData = Object.keys(byProductObj).map(pName => {
      const pEntries = byProductObj[pName];
      const rev = pEntries.reduce((s, e) => s + e.revenue, 0);
      const cost = pEntries.reduce((s, e) => s + e.cost, 0);
      const prof = rev - cost;
      const marg = rev > 0 ? (prof / rev * 100) : 0;
      
      // Sparkline (last 7 entries)
      const recent = pEntries.sort((a,b) => a.date.localeCompare(b.date)).slice(-7).map(e => e.revenue);
      
      return { product: pName, category: pEntries[0].category, rev, cost, prof, marg, recent };
    }).sort((a, b) => a.marg - b.marg); // Default sort: worst margin first

    const byCatObj = groupBy(filteredEntries, 'category');
    const costDonut = Object.keys(byCatObj).map(cName => ({
      name: cName,
      val: byCatObj[cName].reduce((s, e) => s + e.cost, 0)
    })).filter(x => x.val > 0).sort((a,b) => b.val - a.val);

    const health = computeHealthScore(filteredEntries);
    const suggs = generateSuggestions(filteredEntries, byProductObj);

    return { totalRev, totalCost, totalProfit, overallMargin, chartData, marginTableData, costDonut, health, suggs };
  }, [filteredEntries]);

  // Scenario Math
  const projectedRev = computed.totalRev * (1 + scenario.revGrowth/100) * (1 + scenario.priceInc/100) * (1 + scenario.volInc/100);
  const projectedCost = computed.totalCost * (1 - scenario.costRed/100);
  const projectedProfit = projectedRev - projectedCost;
  const projectedMargin = projectedRev > 0 ? (projectedProfit / projectedRev * 100) : 0;
  const projDiff = projectedProfit - computed.totalProfit;

  // Export
  const handleExport = () => {
    if (filteredEntries.length === 0) return showToast('No data to export', 'error');
    const headers = ['Date', 'Product', 'Category', 'Qty Sold', 'Revenue', 'Cost', 'Profit', 'Margin %'];
    const rows = filteredEntries.map(e => {
      const p = e.revenue - e.cost;
      const m = e.revenue > 0 ? (p / e.revenue * 100).toFixed(1) : '0.0';
      return [e.date, `"${e.product}"`, `"${e.category}"`, e.quantitySold, e.revenue, e.cost, p, m];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit_analysis_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export downloaded successfully');
  };



  // Chart Options
  const healthColor = computed.health >= 75 ? '#4caf7d' : computed.health >= 50 ? '#c9a84c' : computed.health >= 25 ? '#e8944a' : '#e05c5c';
  const healthLabel = computed.health >= 75 ? 'Excellent' : computed.health >= 50 ? 'Good' : computed.health >= 25 ? 'Needs Attention' : 'Critical';
  
  const healthOpts = {
    chart: { type: 'radialBar', background: 'transparent', animations: { enabled: true, easing: 'easeinout', speed: 800 } },
    plotOptions: {
      radialBar: {
        hollow: { size: '70%' },
        track: { background: 'rgba(255,255,255,0.05)' },
        dataLabels: {
          name: { show: false },
          value: { fontSize: '48px', fontFamily: 'Cormorant Garamond', fontWeight: 'bold', color: healthColor, offsetY: 15 }
        }
      }
    },
    colors: [healthColor],
    stroke: { lineCap: 'round' }
  };

  const mainSeries = [];
  if (activeSeries.revenue) mainSeries.push({ name: 'Revenue', type: 'area', data: computed.chartData.revenue });
  if (activeSeries.profit) mainSeries.push({ name: 'Profit', type: 'area', data: computed.chartData.profit });
  if (activeSeries.cost) mainSeries.push({ name: 'Cost', type: 'line', data: computed.chartData.cost });
  if (activeSeries.margin) mainSeries.push({ name: 'Margin %', type: 'line', data: computed.chartData.margin });

  const mainColors = [];
  if (activeSeries.revenue) mainColors.push('#c9a84c');
  if (activeSeries.profit) mainColors.push('#4caf7d');
  if (activeSeries.cost) mainColors.push('#e05c5c');
  if (activeSeries.margin) mainColors.push('#5b8dee');

  const mainOpts = {
    chart: { background: 'transparent', foreColor: '#9a9080', toolbar: { show: true, tools: { zoom: true, pan: true, reset: true } } },
    colors: mainColors,
    stroke: { curve: 'smooth', width: 2, dashArray: mainSeries.map(s => s.name === 'Cost' ? 4 : 0) },
    fill: { type: mainSeries.map(s => s.type === 'area' ? 'gradient' : 'solid'), gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
    dataLabels: { enabled: false },
    grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
    xaxis: { categories: computed.chartData.dates, tooltip: { enabled: false } },
    yaxis: [
      { title: { text: 'Amount ($)', style: { color: '#9a9080' } }, labels: { formatter: v => `$${v.toLocaleString()}` } },
      ...(activeSeries.margin ? [{ opposite: true, title: { text: 'Margin (%)', style: { color: '#5b8dee' } }, labels: { formatter: v => `${v.toFixed(0)}%` }, min: -50, max: 100 }] : [])
    ],
    annotations: {
      xaxis: computed.chartData.annotations.map(a => ({
        x: a.x, strokeDashArray: 4, borderColor: a.color,
        label: { borderColor: a.color, style: { color: '#fff', background: a.color, fontSize: '10px' }, text: a.label }
      }))
    },
    tooltip: { theme: 'dark', style: { fontSize: '12px', fontFamily: 'DM Sans' } },
    legend: { show: false }
  };

  const donutOpts = {
    chart: { background: 'transparent' },
    labels: computed.costDonut.map(d => d.name),
    colors: ['#c9a84c', '#d4b76a', '#e0c78a', '#5b8dee', '#7aa4f0', '#9ac0f4', '#4caf7d', '#e05c5c'],
    stroke: { show: false },
    dataLabels: { enabled: false },
    plotOptions: { pie: { donut: { size: '75%', labels: { show: true, name: { color: '#9a9080', fontSize: '12px' }, value: { color: '#fff', fontSize: '20px', fontWeight: 'bold', formatter: v => `$${Number(v).toLocaleString()}` }, total: { show: true, label: 'Total Cost', color: '#9a9080', formatter: w => `$${w.globals.seriesTotals.reduce((a, b) => a + b, 0).toLocaleString()}` } } } } },
    legend: { position: 'bottom', labels: { colors: '#9a9080' } },
    tooltip: { theme: 'dark', y: { formatter: v => `$${v.toLocaleString()}` } }
  };

  const SeriesToggle = ({ id, label, color }) => (
    <button onClick={() => setActiveSeries(p => ({...p, [id]: !p[id]}))} 
      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${activeSeries[id] ? `bg-[${color}] border-transparent text-white` : `border-white/20 text-gray-400 hover:border-white/40`}`}
      style={activeSeries[id] ? { backgroundColor: color } : {}}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      {toast && <Toast message={toast.message} type={toast.type} onClose={hideToast} />}

      {/* TOPBAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 glass p-5 shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-primary-400 font-heading">Profit Optimization</h1>
          <p className="text-sm text-gray-500 flex items-center gap-2"><Lightbulb size={14} className="text-primary-500" /> Powered by business intelligence — AI model coming soon</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-gray-900 p-2 rounded-xl border border-white/5">
          <div className="flex items-center gap-2">
            <input type="date" value={dateRange.from} onChange={e => setDateRange({...dateRange, from: e.target.value})} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" />
            <span className="text-gray-500">to</span>
            <input type="date" value={dateRange.to} onChange={e => setDateRange({...dateRange, to: e.target.value})} className="bg-gray-950 border border-white/10 rounded-lg px-2 py-1 text-xs text-white outline-none" />
          </div>
          <button onClick={() => setDateRange({from: '', to: ''})} className="text-xs text-gray-400 hover:text-white transition-colors">Reset</button>
          <div className="w-px h-6 bg-white/10 mx-2 hidden sm:block" />
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-lg text-xs font-bold text-gray-300 hover:bg-white/5 transition-colors">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* HERO: HEALTH SCORE */}
      <div className="glass p-6 lg:p-8 shadow-xl flex flex-col md:flex-row items-center gap-8 group hover:border-primary-500/30 transition-colors">
        <div className="w-[250px] shrink-0">
          <ReactApexChart options={healthOpts} series={[computed.health]} type="radialBar" height="250" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Profit Health Score</h2>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-heading font-bold" style={{ color: healthColor }}>{computed.health}</span>
              <span className="text-xl font-bold" style={{ color: healthColor }}>{healthLabel}</span>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 max-w-lg mt-4">
            <HealthFactor label="Profit Margin" val={computed.overallMargin.toFixed(0)} target="30%" />
            <HealthFactor label="Cost Efficiency" val={((computed.totalCost / computed.totalRev)*100).toFixed(0)} target="< 60%" inverted />
          </div>
          
          <details className="mt-4 group/details">
            <summary className="text-xs font-bold text-gray-400 cursor-pointer hover:text-white transition-colors list-none flex items-center gap-2">
              <span className="group-open/details:rotate-90 transition-transform">▶</span> What affects this score?
            </summary>
            <p className="mt-2 text-xs text-gray-500 leading-relaxed max-w-2xl bg-gray-900 p-3 rounded-lg">
              This score evaluates four key pillars of your business health based on the current filtered data: <strong className="text-gray-300">Profit Margin</strong> (how much you keep per dollar earned), <strong className="text-gray-300">Revenue Trend</strong> (growth compared to last week), <strong className="text-gray-300">Cost Ratio</strong> (operational efficiency), and <strong className="text-gray-300">Consistency</strong> (frequency of business activity).
            </p>
          </details>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Revenue" value={`$${computed.totalRev.toLocaleString()}`} icon={DollarSign} color="text-white" />
        <KpiCard label="Total Cost" value={`$${computed.totalCost.toLocaleString()}`} icon={TrendingDown} color="text-gray-400" />
        <KpiCard label="Total Profit" value={`$${computed.totalProfit.toLocaleString()}`} icon={TrendingUp} color={computed.totalProfit >= 0 ? "text-green-500" : "text-red-500"} />
        <KpiCard label="Overall Margin %" value={`${computed.overallMargin.toFixed(1)}%`} icon={Percent} color={computed.overallMargin >= 20 ? "text-green-500" : computed.overallMargin >= 10 ? "text-amber-500" : "text-red-500"} sub="Industry avg: ~20-40%" />
      </div>

      {/* MAIN CHART */}
      <div className="glass p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h3 className="text-lg font-bold text-white font-heading">Financial Trends</h3>
          <div className="flex flex-wrap gap-2">
            <SeriesToggle id="revenue" label="Revenue" color="#c9a84c" />
            <SeriesToggle id="cost" label="Cost" color="#e05c5c" />
            <SeriesToggle id="profit" label="Profit" color="#4caf7d" />
            <SeriesToggle id="margin" label="Margin %" color="#5b8dee" />
          </div>
        </div>
        <div className="h-[350px]">
          {mainSeries.length > 0 ? (
            <ReactApexChart options={mainOpts} series={mainSeries} type="line" height="100%" />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">Select at least one metric to display</div>
          )}
        </div>
      </div>

      {/* ROW: DONUT & SIMULATOR */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 glass p-6 shadow-xl flex flex-col">
          <h3 className="text-sm font-bold text-white font-heading mb-6">Cost Breakdown</h3>
          <div className="flex-1 flex items-center justify-center min-h-[250px]">
            {computed.costDonut.length === 0 ? (
              <p className="text-gray-500 text-sm">No cost data available</p>
            ) : (
              <ReactApexChart options={donutOpts} series={computed.costDonut.map(d => d.val)} type="donut" height="300" />
            )}
          </div>
          {computed.costDonut.length > 0 && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <p className="text-xs text-red-400 font-bold mb-1">Cost Insight</p>
              <p className="text-xs text-gray-300">🔴 <strong className="text-white">{computed.costDonut[0].name}</strong> makes up {((computed.costDonut[0].val / computed.totalCost)*100).toFixed(0)}% of your total costs. Consider negotiating supplier rates or looking for alternatives to boost margins.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 glass p-6 shadow-xl flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-bold text-white font-heading">Profit Scenario Simulator</h3>
              <p className="text-xs text-gray-500 mt-1">See how small changes affect your bottom line.</p>
            </div>
            <button onClick={() => setScenario({ revGrowth: 0, costRed: 0, priceInc: 0, volInc: 0 })} className="text-xs font-bold text-gray-400 hover:text-white underline">Reset</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
            <div className="space-y-6">
              <SimSlider label="Revenue Growth" val={scenario.revGrowth} set={(v) => setScenario(p => ({...p, revGrowth: v}))} />
              <SimSlider label="Cost Reduction" val={scenario.costRed} set={(v) => setScenario(p => ({...p, costRed: v}))} invert />
              <SimSlider label="Price Increase" val={scenario.priceInc} set={(v) => setScenario(p => ({...p, priceInc: v}))} />
              <SimSlider label="Volume Increase" val={scenario.volInc} set={(v) => setScenario(p => ({...p, volInc: v}))} />
            </div>
            
            <div className="bg-gray-900 border border-white/5 rounded-2xl p-6 flex flex-col justify-center items-center text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl" />
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Projected Profit</p>
              
              <div className="flex flex-col items-center gap-2 mb-6">
                <span className={`text-4xl font-bold font-heading transition-colors ${projectedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${projectedProfit.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                <div className={`flex items-center gap-1 text-sm font-bold ${projDiff > 0 ? 'text-green-500' : projDiff < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  {projDiff > 0 ? '+' : ''}{projDiff.toLocaleString(undefined, {maximumFractionDigits: 0})} difference
                </div>
              </div>

              <div className="w-full flex justify-between items-center text-sm p-3 bg-black/30 rounded-xl">
                <span className="text-gray-400">Proj. Margin</span>
                <span className={`font-bold ${projectedMargin >= 20 ? 'text-green-400' : projectedMargin >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{projectedMargin.toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 text-center mt-6">This is a simulation. Results are estimates based on filtered data.</p>
        </div>
      </div>

      {/* SUGGESTIONS & TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass p-6 shadow-xl overflow-x-auto">
          <h3 className="text-sm font-bold text-white font-heading mb-4">Product Margin Breakdown</h3>
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                <th className="pb-3 font-bold">Product</th>
                <th className="pb-3 font-bold text-right">Revenue</th>
                <th className="pb-3 font-bold text-right">Profit</th>
                <th className="pb-3 font-bold text-right">Margin %</th>
                <th className="pb-3 font-bold text-center pl-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {computed.marginTableData.slice(0, 10).map((row, i) => { // show top 10 for performance
                let statObj = { l: 'High Margin', c: 'text-green-400 bg-green-400/10 border-green-400/20' };
                if (row.marg < 0) statObj = { l: 'Loss Making', c: 'text-red-400 bg-red-400/10 border-red-400/20' };
                else if (row.marg < 5) statObj = { l: 'Break Even', c: 'text-orange-400 bg-orange-400/10 border-orange-400/20' };
                else if (row.marg < 15) statObj = { l: 'Low Margin', c: 'text-amber-400 bg-amber-400/10 border-amber-400/20' };
                else if (row.marg < 30) statObj = { l: 'Healthy', c: 'text-blue-400 bg-blue-400/10 border-blue-400/20' };

                return (
                  <tr key={row.product} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${row.marg < 0 ? 'bg-red-500/[0.02]' : ''}`}>
                    <td className="py-3 font-bold text-gray-200">{row.product}</td>
                    <td className="py-3 text-right text-gray-400">${row.rev.toLocaleString()}</td>
                    <td className={`py-3 text-right font-bold ${row.prof >= 0 ? 'text-green-500' : 'text-red-500'}`}>${row.prof.toLocaleString()}</td>
                    <td className="py-3 text-right text-gray-300 font-mono">{row.marg.toFixed(1)}%</td>
                    <td className="py-3 text-center pl-4">
                      <span className={`text-[10px] font-bold px-2 py-1 border rounded-full uppercase tracking-wider ${statObj.c}`}>{statObj.l}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-500 mt-4 text-center">Showing {Math.min(10, computed.marginTableData.length)} products sorted by lowest margin.</p>
        </div>

        {/* AI SUGGESTIONS */}
        <div className="lg:col-span-1 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4 px-2">
            <div>
              <h3 className="text-xl font-bold text-primary-400 font-heading flex items-center gap-2">AI Suggestions <span className="text-[9px] border border-primary-500 text-primary-500 px-1.5 py-0.5 rounded-full">BETA</span></h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Rule-based analysis</p>
            </div>
            <button className="p-2 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10 rounded-full transition-colors" title="Refresh">↻</button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2 pb-4">
            {computed.suggs.length === 0 ? (
              <div className="text-center p-6 glass">
                <p className="text-sm text-gray-400">Add more diverse business entries to unlock actionable suggestions.</p>
              </div>
            ) : (
              computed.suggs.map((s, i) => {
                const isCrit = s.priority === 'critical';
                const isWarn = s.priority === 'warning';
                const color = isCrit ? 'red' : isWarn ? 'amber' : 'blue';
                const IconObj = isCrit ? AlertCircle : isWarn ? AlertCircle : Lightbulb;
                
                return (
                  <div key={i} className={`glass !border-l-[2px] border-l-${color}-500 p-4 shadow-lg hover:-translate-y-1 transition-transform relative group`} style={{ animation: `fadeIn 0.3s ease-out ${i * 0.05}s both` }}>
                    <div className="flex items-start gap-3">
                      <IconObj size={16} className={`text-${color}-500 mt-0.5 shrink-0`} />
                      <div>
                        <h4 className="font-bold text-white text-sm mb-1 pr-6">{s.title}</h4>
                        <p className="text-xs text-gray-400 leading-relaxed mb-3">{s.text}</p>
                        {s.link ? (
                          <button onClick={() => navigate(s.link)} className={`text-[10px] font-bold text-${color}-400 hover:underline uppercase tracking-wider flex items-center gap-1`}>{s.action} <ArrowRight size={10} /></button>
                        ) : (
                          <span className={`text-[10px] font-bold text-${color}-400/50 uppercase tracking-wider`}>{s.action}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            
            <div className="mt-8 p-3 border border-white/5 border-dashed rounded-xl bg-gray-900/50 text-center">
              <p className="text-[10px] text-gray-500 leading-relaxed">🤖 Advanced AI model in development. Suggestions will become significantly more accurate and personalized once trained on your business data.</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function HealthFactor({ label, val, target, inverted }) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-white/5">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">{label}</p>
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-bold text-white">{val}</span>
        <span className="text-[10px] text-gray-600">Target: {target}</span>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="glass p-5 flex flex-col justify-between hover:border-primary-500/30 transition-colors group">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
        <Icon size={16} className="text-gray-600 group-hover:text-primary-500 transition-colors" />
      </div>
      <div className={`text-2xl lg:text-3xl font-bold font-heading mb-1 ${color}`}>{value}</div>
      {sub && <div className="text-[9px] text-gray-600 font-bold">{sub}</div>}
    </div>
  );
}

function SimSlider({ label, val, set, invert }) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <label className="text-xs font-bold text-gray-400">{label}</label>
        <span className={`text-xs font-bold ${val > 0 ? (invert ? 'text-red-400' : 'text-green-400') : val < 0 ? (invert ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}`}>{val > 0 ? '+' : ''}{val}%</span>
      </div>
      <input type="range" min="-50" max="100" step="1" value={val} onChange={e => set(Number(e.target.value))} className="w-full accent-primary-500 h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer" />
    </div>
  );
}
