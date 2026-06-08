import { db } from './firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

// In-memory cache: key -> { data, timestamp }
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Aggregates business data for the Profit Optimization page.
 * 
 * @param {string} businessId - The business ID
 * @param {string} branchId - (Optional) The branch ID
 * @param {object} dateRange - { from: Date, to: Date }
 * @param {function} onProgress - Callback for progress (0-100)
 * @returns {object} Structured aggregation data
 */
export async function aggregateBusinessData(businessId, branchId, dateRange, onProgress = () => {}) {
  if (!businessId) throw new Error('businessId is required');

  // Default to last 30 days if no dateRange provided
  const toDate = dateRange?.to || new Date();
  const fromDate = dateRange?.from || new Date(toDate.getTime() - (30 * 24 * 60 * 60 * 1000));
  
  // Ensure we have start of day and end of day
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(toDate);
  to.setHours(23, 59, 59, 999);

  const totalDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));

  // Previous period for comparison
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - (totalDays * 24 * 60 * 60 * 1000) + 1);
  prevFrom.setHours(0, 0, 0, 0);

  // Check cache
  const cacheKey = `${businessId}_${branchId || 'all'}_${from.getTime()}_${to.getTime()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    onProgress(100);
    return cached.data;
  }

  const warnings = [];
  const missingCostPrice = [];
  onProgress(10);

  // Helper to safely execute a query and handle failures
  const safeGetDocs = async (q, collectionName) => {
    try {
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error(`Failed to fetch ${collectionName}:`, err);
      warnings.push(collectionName);
      return [];
    }
  };

  // Queries (Note: 'bills' collection is used for sales in this codebase)
  const salesQueryBase = [where('businessId', '==', businessId)];
  if (branchId) salesQueryBase.push(where('branchId', '==', branchId));

  const expensesQueryBase = [where('businessId', '==', businessId)];
  if (branchId) expensesQueryBase.push(where('branchId', '==', branchId));

  const productsQueryBase = [where('businessId', '==', businessId)];
  if (branchId) productsQueryBase.push(where('branchId', '==', branchId));

  const creditsQueryBase = [where('businessId', '==', businessId)];
  if (branchId) creditsQueryBase.push(where('branchId', '==', branchId));

  // Date filtering logic: 
  // Dates in Firestore might be stored as strings ('YYYY-MM-DD') or Timestamps. 
  // We fetch all for the business/branch and filter in memory to handle both safely 
  // and efficiently since we need them for aggregations anyway.
  
  // Fetch all promises in parallel
  const fetchPromises = [
    safeGetDocs(query(collection(db, 'bills'), ...salesQueryBase), 'sales'),
    safeGetDocs(query(collection(db, 'products'), ...productsQueryBase), 'products'),
    safeGetDocs(query(collection(db, 'expenses'), ...expensesQueryBase), 'expenses'),
    safeGetDocs(query(collection(db, 'credits'), ...creditsQueryBase), 'credits') // 'credits' collection if it exists, else we'll fallback to bills
  ];

  const [allSales, allProducts, allExpenses, rawCredits] = await Promise.all(fetchPromises);
  onProgress(50);

  // Fallback: If 'credits' collection is empty, maybe they are in 'bills' with paymentMethod='credit'
  const allCredits = rawCredits.length > 0 
    ? rawCredits 
    : allSales.filter(s => s.paymentMethod === 'credit' || s.paymentMethod === 'due');

  // --- Date Filtering Function ---
  const filterByDateRange = (items, start, end) => {
    return items.filter(item => {
      let itemDate;
      if (item.date && item.date.toDate) itemDate = item.date.toDate();
      else if (item.createdAt && item.createdAt.toDate) itemDate = item.createdAt.toDate();
      else if (item.date) itemDate = new Date(item.date);
      else return false;
      return itemDate >= start && itemDate <= end;
    });
  };

  // Current Period Data
  const currentSales = filterByDateRange(allSales, from, to);
  const currentExpenses = filterByDateRange(allExpenses, from, to);

  // Previous Period Data
  const prevSales = filterByDateRange(allSales, prevFrom, prevTo);
  const prevExpenses = filterByDateRange(allExpenses, prevFrom, prevTo);

  onProgress(70);

  // ==========================================
  // AGGREGATIONS
  // ==========================================

  // --- PRODUCTS / INVENTORY ---
  let totalStockValue = 0;
  let totalRetailValue = 0;
  let totalStockUnits = 0;
  const lowStockItems = [];
  const outOfStockItems = [];
  const margins = [];

  allProducts.forEach(p => {
    const stock = Number(p.currentStock || p.stockRemaining || 0);
    const sellingPrice = Number(p.sellingPrice || p.price || 0);
    const costPrice = Number(p.costPrice !== undefined ? p.costPrice : null);
    const threshold = Number(p.lowStockThreshold || 5);

    totalStockUnits += stock;
    totalRetailValue += (stock * sellingPrice);
    
    if (costPrice !== null) {
      totalStockValue += (stock * costPrice);
      if (sellingPrice > 0) {
        const margin = sellingPrice - costPrice;
        const marginPercent = (margin / sellingPrice) * 100;
        margins.push({ productId: p.id, name: p.name, margin, marginPercent });
      }
    } else {
      missingCostPrice.push(p.id);
    }

    if (stock <= 0) {
      outOfStockItems.push({ productId: p.id, name: p.name, daysSinceOutOfStock: 0 }); // Approximation
    } else if (stock <= threshold) {
      lowStockItems.push({ productId: p.id, name: p.name, currentStock: stock, threshold });
    }
  });

  const potentialProfit = totalRetailValue - totalStockValue;
  
  margins.sort((a, b) => b.marginPercent - a.marginPercent);
  const topMarginProducts = margins.slice(0, 10);
  const lowMarginProducts = margins.slice(-10).reverse();

  // --- SALES ---
  let currentRevenue = 0;
  const revenueByDayMap = new Map();
  const revenueByWeekdayMap = new Map();
  const revenueByPaymentMethodMap = new Map();
  const productSalesMap = new Map();
  const hourlyMap = new Map();
  let totalUnitsSold = 0;

  // Initialize weekdays
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].forEach(day => {
    revenueByWeekdayMap.set(day, { totalRevenue: 0, count: 0 });
  });

  currentSales.forEach(sale => {
    const amount = Number(sale.totalAmount || sale.netTotal || sale.subtotal || 0);
    currentRevenue += amount;

    let saleDate = new Date();
    if (sale.date && sale.date.toDate) saleDate = sale.date.toDate();
    else if (sale.createdAt && sale.createdAt.toDate) saleDate = sale.createdAt.toDate();
    else if (sale.date) saleDate = new Date(sale.date);

    const dateStr = saleDate.toISOString().split('T')[0];
    const weekday = saleDate.toLocaleDateString('en-US', { weekday: 'long' });
    const hour = saleDate.getHours();

    // Day aggregation
    if (!revenueByDayMap.has(dateStr)) revenueByDayMap.set(dateStr, { revenue: 0, transactions: 0 });
    const dayStats = revenueByDayMap.get(dateStr);
    dayStats.revenue += amount;
    dayStats.transactions += 1;

    // Weekday aggregation
    const weekdayStats = revenueByWeekdayMap.get(weekday);
    weekdayStats.totalRevenue += amount;
    weekdayStats.count += 1;

    // Hourly aggregation
    if (sale.createdAt || sale.date?.toDate) { // Only if timestamp exists
      if (!hourlyMap.has(hour)) hourlyMap.set(hour, { count: 0, revenue: 0 });
      const hourStats = hourlyMap.get(hour);
      hourStats.count += 1;
      hourStats.revenue += amount;
    }

    // Payment method aggregation
    const pm = sale.paymentMethod || 'unknown';
    if (!revenueByPaymentMethodMap.has(pm)) revenueByPaymentMethodMap.set(pm, { total: 0, count: 0 });
    const pmStats = revenueByPaymentMethodMap.get(pm);
    pmStats.total += amount;
    pmStats.count += 1;

    // Product aggregation
    if (Array.isArray(sale.items)) {
      sale.items.forEach(item => {
        const pId = item.productId || item.id;
        const qty = Number(item.quantity || item.qty || 0);
        const itemRev = Number(item.total || (qty * (item.unitPrice || item.price || 0)));
        totalUnitsSold += qty;

        if (!productSalesMap.has(pId)) {
          productSalesMap.set(pId, { productId: pId, name: item.productName || item.name || 'Unknown', unitsSold: 0, revenue: 0 });
        }
        const pStats = productSalesMap.get(pId);
        pStats.unitsSold += qty;
        pStats.revenue += itemRev;
      });
    }
  });

  const revenueByDay = Array.from(revenueByDayMap.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const revenueByWeekday = Array.from(revenueByWeekdayMap.entries()).map(([weekday, stats]) => ({
    weekday,
    totalRevenue: stats.totalRevenue,
    count: stats.count,
    avgRevenue: stats.count > 0 ? stats.totalRevenue / stats.count : 0
  }));

  const revenueByPaymentMethod = Array.from(revenueByPaymentMethodMap.entries()).map(([method, stats]) => ({
    method,
    total: stats.total,
    count: stats.count,
    percentage: currentRevenue > 0 ? (stats.total / currentRevenue) * 100 : 0
  }));

  const hourlyDistribution = Array.from(hourlyMap.entries())
    .map(([hour, stats]) => ({ hour, ...stats }))
    .sort((a, b) => a.hour - b.hour);

  const productSalesArr = Array.from(productSalesMap.values());
  productSalesArr.sort((a, b) => b.unitsSold - a.unitsSold);
  const topSellingProducts = productSalesArr.slice(0, 10).map(p => ({ ...p, avgPrice: p.unitsSold > 0 ? p.revenue / p.unitsSold : 0 }));
  const slowMovingProducts = productSalesArr.slice(-10).reverse(); // Very basic approximation

  // Identify dead stock (in inventory but not sold recently)
  const deadStockItems = [];
  allProducts.forEach(p => {
    if (Number(p.currentStock || p.stockRemaining || 0) > 0 && !productSalesMap.has(p.id)) {
      deadStockItems.push({ productId: p.id, name: p.name, currentStock: Number(p.currentStock || p.stockRemaining || 0), daysSinceLastSale: totalDays });
    }
  });

  // --- EXPENSES ---
  let totalExpenses = 0;
  const expensesByCategoryMap = new Map();
  const expensesByDayMap = new Map();
  let largestExpense = { amount: 0, category: '', date: '', description: '' };

  currentExpenses.forEach(exp => {
    const amount = Number(exp.amount || 0);
    totalExpenses += amount;

    let expDate = new Date();
    if (exp.date && exp.date.toDate) expDate = exp.date.toDate();
    else if (exp.date) expDate = new Date(exp.date);
    const dateStr = expDate.toISOString().split('T')[0];

    // Day
    if (!expensesByDayMap.has(dateStr)) expensesByDayMap.set(dateStr, 0);
    expensesByDayMap.set(dateStr, expensesByDayMap.get(dateStr) + amount);

    // Category
    const cat = exp.category || 'Uncategorized';
    if (!expensesByCategoryMap.has(cat)) expensesByCategoryMap.set(cat, { total: 0, count: 0 });
    const catStats = expensesByCategoryMap.get(cat);
    catStats.total += amount;
    catStats.count += 1;

    // Largest
    if (amount > largestExpense.amount) {
      largestExpense = { amount, category: cat, date: dateStr, description: exp.description || '' };
    }
  });

  const expensesByCategory = Array.from(expensesByCategoryMap.entries()).map(([category, stats]) => ({
    category,
    total: stats.total,
    count: stats.count,
    percentage: totalExpenses > 0 ? (stats.total / totalExpenses) * 100 : 0
  })).sort((a, b) => b.total - a.total);

  const expensesByDay = Array.from(expensesByDayMap.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- PROFIT & LOSS ---
  const netProfit = currentRevenue - totalExpenses;
  const netMargin = currentRevenue > 0 ? (netProfit / currentRevenue) * 100 : 0;

  const profitByDay = [];
  let bestProfitDay = { date: '', netProfit: -Infinity };
  let worstProfitDay = { date: '', netProfit: Infinity };

  // Generate continuous timeline
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const rev = revenueByDayMap.get(dateStr)?.revenue || 0;
    const exp = expensesByDayMap.get(dateStr) || 0;
    const profit = rev - exp;
    
    profitByDay.push({ date: dateStr, revenue: rev, expenses: exp, netProfit: profit });

    if (profit > bestProfitDay.netProfit) bestProfitDay = { date: dateStr, netProfit: profit };
    if (profit < worstProfitDay.netProfit) worstProfitDay = { date: dateStr, netProfit: profit };
  }

  // --- CREDITS ---
  let totalOutstanding = 0;
  let totalOwed = 0;
  const overdueCredits = [];
  let largestCredit = { personName: '', amount: 0, daysOutstanding: 0 };

  allCredits.forEach(c => {
    // Determine type from collection or field
    const type = c.type || (c.paymentMethod === 'credit' ? 'credit' : 'due');
    const amount = Number(c.amount || c.netTotal || c.totalAmount || 0);
    const status = c.status || 'unpaid';

    if (status !== 'unpaid') return; // Only count active

    let dateObj = new Date();
    if (c.date && c.date.toDate) dateObj = c.date.toDate();
    else if (c.date) dateObj = new Date(c.date);
    
    const daysOutstanding = Math.floor((new Date() - dateObj) / (1000 * 60 * 60 * 24));

    if (type === 'credit') {
      totalOutstanding += amount;
      if (amount > largestCredit.amount) {
        largestCredit = { personName: c.personName || c.customerName || c.name || 'Unknown', amount, daysOutstanding };
      }
    } else {
      totalOwed += amount;
    }

    if (c.dueDate) {
      const due = new Date(c.dueDate);
      if (new Date() > due && status === 'unpaid') {
        const daysOverdue = Math.floor((new Date() - due) / (1000 * 60 * 60 * 24));
        overdueCredits.push({
          personName: c.personName || c.customerName || c.name || 'Unknown',
          amount,
          dueDate: c.dueDate,
          daysOverdue
        });
      }
    }
  });

  // --- COMPARISONS ---
  let prevRevenue = 0;
  let prevTransactions = 0;
  prevSales.forEach(s => {
    prevRevenue += Number(s.totalAmount || s.netTotal || s.subtotal || 0);
    prevTransactions += 1;
  });

  let prevTotalExpenses = 0;
  prevExpenses.forEach(e => {
    prevTotalExpenses += Number(e.amount || 0);
  });

  const prevProfit = prevRevenue - prevTotalExpenses;

  const calcChange = (curr, prev) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / Math.abs(prev)) * 100;
  };

  const comparisons = {
    vsLastPeriod: {
      revenueChange: calcChange(currentRevenue, prevRevenue),
      expenseChange: calcChange(totalExpenses, prevTotalExpenses),
      profitChange: calcChange(netProfit, prevProfit),
      transactionChange: calcChange(currentSales.length, prevTransactions),
    }
  };

  if (totalDays < 7) {
    comparisons.vsLastPeriod.insufficient_data = true;
  }

  // Rounding Helpers
  const round2 = (num) => Math.round(num * 100) / 100;
  const round1 = (num) => Math.round(num * 10) / 10;

  // Compile final result
  const result = {
    period: { from, to, totalDays },
    sales: {
      totalRevenue: round2(currentRevenue),
      totalTransactions: currentSales.length,
      averageTransactionValue: currentSales.length > 0 ? round2(currentRevenue / currentSales.length) : 0,
      revenueByDay: revenueByDay.map(d => ({ ...d, revenue: round2(d.revenue) })),
      revenueByWeekday: revenueByWeekday.map(d => ({ ...d, avgRevenue: round2(d.avgRevenue), totalRevenue: round2(d.totalRevenue) })),
      revenueByPaymentMethod: revenueByPaymentMethod.map(d => ({ ...d, total: round2(d.total), percentage: round1(d.percentage) })),
      topSellingProducts: topSellingProducts.map(p => ({ ...p, revenue: round2(p.revenue), avgPrice: round2(p.avgPrice) })),
      slowMovingProducts,
      hourlyDistribution: hourlyDistribution.map(h => ({ ...h, revenue: round2(h.revenue) })),
    },
    inventory: {
      totalProducts: allProducts.length,
      totalStockValue: round2(totalStockValue),
      totalRetailValue: round2(totalRetailValue),
      potentialProfit: round2(potentialProfit),
      lowStockItems,
      outOfStockItems,
      deadStockItems,
      topMarginProducts: topMarginProducts.map(p => ({ ...p, margin: round2(p.margin), marginPercent: round1(p.marginPercent) })),
      lowMarginProducts: lowMarginProducts.map(p => ({ ...p, margin: round2(p.margin), marginPercent: round1(p.marginPercent) })),
      stockTurnoverRate: totalStockUnits > 0 ? round2(totalUnitsSold / totalStockUnits) : 0, // Very simplified turnover rate
    },
    expenses: {
      totalExpenses: round2(totalExpenses),
      expensesByCategory: expensesByCategory.map(e => ({ ...e, total: round2(e.total), percentage: round1(e.percentage) })),
      expensesByDay: expensesByDay.map(e => ({ ...e, total: round2(e.total) })),
      largestExpense: { ...largestExpense, amount: round2(largestExpense.amount) },
      avgDailyExpense: totalDays > 0 ? round2(totalExpenses / totalDays) : 0,
    },
    profitLoss: {
      grossRevenue: round2(currentRevenue),
      totalExpenses: round2(totalExpenses),
      netProfit: round2(netProfit),
      netMargin: round1(netMargin),
      profitByDay: profitByDay.map(p => ({ ...p, revenue: round2(p.revenue), expenses: round2(p.expenses), netProfit: round2(p.netProfit) })),
      bestProfitDay: { ...bestProfitDay, netProfit: round2(bestProfitDay.netProfit) },
      worstProfitDay: { ...worstProfitDay, netProfit: round2(worstProfitDay.netProfit) },
      profitTrend: (currentRevenue - prevRevenue) > 0 ? 'improving' : ((currentRevenue - prevRevenue) < 0 ? 'declining' : 'stable'),
    },
    credits: {
      totalOutstanding: round2(totalOutstanding),
      totalOwed: round2(totalOwed),
      netCreditsPosition: round2(totalOutstanding - totalOwed),
      overdueCredits: overdueCredits.map(c => ({ ...c, amount: round2(c.amount) })),
      largestCredit: { ...largestCredit, amount: round2(largestCredit.amount) },
    },
    comparisons: {
      vsLastPeriod: {
        revenueChange: round1(comparisons.vsLastPeriod.revenueChange),
        expenseChange: round1(comparisons.vsLastPeriod.expenseChange),
        profitChange: round1(comparisons.vsLastPeriod.profitChange),
        transactionChange: round1(comparisons.vsLastPeriod.transactionChange),
        insufficient_data: comparisons.vsLastPeriod.insufficient_data
      }
    },
    warnings,
    missingCostPrice
  };

  onProgress(100);
  
  // Save to cache
  cache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}
