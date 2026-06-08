import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Percent, AlertCircle, ChevronDown, ChevronUp, Zap, Target, ShoppingCart, CreditCard, BarChart3, Lightbulb } from 'lucide-react';

const fmt = (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PRIORITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#6b7280' };
const CATEGORY_ICONS = { revenue: BarChart3, inventory: ShoppingCart, expenses: DollarSign, credits: CreditCard, forecast: TrendingUp };

// --- Animated Score Circle ---
export function HealthScoreCard({ score, scoreLabel, summary }) {
  const [animScore, setAnimScore] = useState(0);
  useEffect(() => {
    let frame; let current = 0;
    const step = () => { current += Math.max(1, Math.floor((score - current) / 8)); if (current >= score) { setAnimScore(score); return; } setAnimScore(current); frame = requestAnimationFrame(step); };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const color = score >= 85 ? '#4caf7d' : score >= 70 ? 'var(--accent-primary)' : score >= 50 ? '#eab308' : '#ef4444';
  const radius = 80; const circumference = 2 * Math.PI * radius; const offset = circumference - (animScore / 100) * circumference;

  return (
    <div className="glass p-6 lg:p-8 shadow-xl flex flex-col md:flex-row items-center gap-8">
      <div className="shrink-0 relative" style={{ width: 200, height: 200 }}>
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
          <circle cx="100" cy="100" r={radius} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 100 100)" style={{ transition: 'stroke-dashoffset 0.8s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-heading font-bold" style={{ color }}>{animScore}</span>
          <span className="text-xs font-bold uppercase tracking-widest mt-1" style={{ color }}>{scoreLabel}</span>
        </div>
      </div>
      <div className="flex-1 space-y-3">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Business Health Score</h2>
        <p className="text-sm text-gray-400 leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}

// --- Key Metrics Row ---
export function MetricsRow({ sales, expenses, profitLoss, comparisons, topProduct }) {
  const cards = [
    { label: 'Total Revenue', value: `AED ${fmt(sales?.totalRevenue)}`, icon: DollarSign, color: 'text-white' },
    { label: 'Total Expenses', value: `AED ${fmt(expenses?.totalExpenses)}`, icon: TrendingDown, color: 'text-gray-400' },
    { label: 'Net Profit', value: `AED ${fmt(profitLoss?.netProfit)}`, icon: TrendingUp, color: profitLoss?.netProfit >= 0 ? 'text-green-500' : 'text-red-500' },
    { label: 'Net Margin', value: `${profitLoss?.netMargin?.toFixed(1) || 0}%`, icon: Percent, color: profitLoss?.netMargin >= 20 ? 'text-green-500' : profitLoss?.netMargin >= 0 ? 'text-amber-500' : 'text-red-500' },
    { label: 'vs Last Period', value: `${comparisons?.vsLastPeriod?.revenueChange >= 0 ? '+' : ''}${comparisons?.vsLastPeriod?.revenueChange?.toFixed(1) || 0}%`, icon: BarChart3, color: comparisons?.vsLastPeriod?.revenueChange >= 0 ? 'text-green-500' : 'text-red-500' },
    { label: 'Top Product', value: topProduct?.name || '—', icon: Target, color: 'text-primary-400', sub: topProduct ? `AED ${fmt(topProduct.revenue)}` : '' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c, i) => (
        <div key={i} className="glass p-4 hover:border-primary-500/30 transition-colors group">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{c.label}</span>
            <c.icon size={14} className="text-gray-600 group-hover:text-primary-500 transition-colors" />
          </div>
          <div className={`text-lg lg:text-xl font-bold font-heading ${c.color} truncate`}>{c.value}</div>
          {c.sub && <div className="text-[9px] text-gray-600 font-bold mt-1">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// --- Warnings Strip ---
export function WarningsStrip({ warnings }) {
  const [open, setOpen] = useState(warnings.length >= 3);
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="glass !border-red-500/30 shadow-xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center gap-3">
          <AlertCircle size={18} className="text-red-400" />
          <span className="text-sm font-bold text-red-400">⚠️ {warnings.length} Issue{warnings.length > 1 ? 's' : ''} Need Attention</span>
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {warnings.map((w, i) => (
            <div key={w.id || i} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/10 rounded-xl">
              <div>
                <span className="text-sm font-bold text-white">{w.title}</span>
                <p className="text-xs text-gray-400 mt-0.5">{w.description}</p>
              </div>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-500/10 text-red-400 shrink-0 ml-4">{w.metric?.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Quick Wins ---
export function QuickWinsSection({ quickWins }) {
  if (!quickWins || quickWins.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><Zap size={14} className="text-amber-400" /> Quick Wins — Highest Impact, Easiest to Do</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quickWins.map((qw, i) => <QuickWinCard key={qw.id || i} insight={qw} />)}
      </div>
    </div>
  );
}

function QuickWinCard({ insight }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[insight.category] || Lightbulb;
  const borderColor = PRIORITY_COLORS[insight.priority] || PRIORITY_COLORS.low;
  return (
    <div className="glass p-5 shadow-lg flex flex-col justify-between" style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <Icon size={16} className="text-gray-500" />
          <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ color: borderColor, backgroundColor: `${borderColor}15` }}>{insight.priority}</span>
        </div>
        <h4 className="font-bold text-white text-sm mb-1">{insight.title}</h4>
        <p className="text-xs text-gray-400 leading-relaxed mb-3">{insight.description}</p>
        <div className="text-lg font-bold font-heading text-primary-400 mb-3">{insight.metric?.value}</div>
      </div>
      <button onClick={() => setExpanded(!expanded)} className="text-[10px] font-bold text-primary-400 hover:text-primary-300 transition-colors text-left">
        {expanded ? '▼ Hide action' : '▶ How to act'}
      </button>
      {expanded && <p className="text-xs text-gray-300 mt-2 p-2 bg-gray-900 rounded-lg">{insight.action}</p>}
    </div>
  );
}

// --- Insights List ---
export function InsightsList({ insights }) {
  const [activeTab, setActiveTab] = useState('all');
  const tabs = ['all', 'revenue', 'inventory', 'expenses', 'credits', 'forecast'];
  const filtered = activeTab === 'all' ? insights : insights.filter(i => i.category === activeTab);

  return (
    <div className="glass p-6 shadow-xl">
      <h3 className="text-lg font-bold text-white font-heading mb-4">All Insights</h3>
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${activeTab === tab ? 'bg-primary-500/20 border-primary-500/40 text-primary-400' : 'border-white/10 text-gray-400 hover:border-white/20'}`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No {activeTab === 'all' ? '' : activeTab + ' '}insights for this period.</p>
        ) : (
          filtered.map((ins, i) => <InsightCard key={ins.id || i} insight={ins} />)
        )}
      </div>
    </div>
  );
}

function InsightCard({ insight }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[insight.category] || Lightbulb;
  const borderColor = PRIORITY_COLORS[insight.priority] || PRIORITY_COLORS.low;
  const impactColors = { high: 'text-red-400 bg-red-400/10', medium: 'text-amber-400 bg-amber-400/10', low: 'text-gray-400 bg-gray-400/10' };
  const effortColors = { easy: 'text-green-400 bg-green-400/10', medium: 'text-amber-400 bg-amber-400/10', hard: 'text-red-400 bg-red-400/10' };

  return (
    <div onClick={() => setExpanded(!expanded)} className="flex gap-3 p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer group"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}>
      <Icon size={16} className="text-gray-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-white text-sm">{insight.title}</h4>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{insight.description}</p>
        {expanded && <p className="text-xs text-gray-300 mt-2 p-2 bg-gray-900 rounded-lg">💡 {insight.action}</p>}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400">{insight.metric?.label}: {insight.metric?.value}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${impactColors[insight.impact] || ''}`}>Impact: {insight.impact}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${effortColors[insight.effort] || ''}`}>Effort: {insight.effort}</span>
        </div>
      </div>
    </div>
  );
}

// --- Skeleton Loader ---
export function SkeletonLoader({ progress }) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="glass p-6 shadow-xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-32 h-4 bg-white/5 rounded" />
          {progress > 0 && <span className="text-xs text-gray-500">{progress}% loaded</span>}
        </div>
        <div className="w-full bg-white/5 rounded-full h-1.5"><div className="bg-primary-500/40 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="glass p-8 shadow-xl flex items-center gap-8">
        <div className="w-[200px] h-[200px] rounded-full bg-white/5 shrink-0" />
        <div className="flex-1 space-y-3"><div className="w-48 h-4 bg-white/5 rounded" /><div className="w-full h-3 bg-white/5 rounded" /><div className="w-3/4 h-3 bg-white/5 rounded" /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => <div key={i} className="glass p-4"><div className="w-16 h-3 bg-white/5 rounded mb-3" /><div className="w-24 h-5 bg-white/5 rounded" /></div>)}
      </div>
      <div className="glass p-6 shadow-xl"><div className="w-full h-[300px] bg-white/5 rounded-xl" /></div>
    </div>
  );
}
