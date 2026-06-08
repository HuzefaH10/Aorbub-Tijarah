/**
 * Forecasting Engine
 * Pure math implementation for business data forecasting and anomaly detection.
 */

// --- Helpers ---

function getVal(item, isExpense = false) {
  if (typeof item === 'number') return item;
  if (isExpense) return Number(item.total || item.expenses || item.amount || 0);
  return Number(item.revenue || item.totalRevenue || item.amount || 0);
}

function calculateMean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function calculateStdDev(values, mean) {
  if (values.length <= 1) return 0;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// --- Main Functions ---

export function detectAnomalies(dataByDay, isExpense = false) {
  if (!Array.isArray(dataByDay) || dataByDay.length < 3) {
    return { anomalies: [] };
  }

  const values = dataByDay.map(d => getVal(d, isExpense));
  const mean = calculateMean(values);
  const stdDev = calculateStdDev(values, mean);

  if (stdDev === 0) return { anomalies: [] };

  const anomalies = [];
  dataByDay.forEach(item => {
    const val = getVal(item, isExpense);
    const zScore = (val - mean) / stdDev;
    
    if (Math.abs(zScore) > 2) {
      anomalies.push({
        date: item.date,
        value: val, // use generic 'value' or map to 'revenue'/'total' in caller if needed
        revenue: val, // alias for backwards compatibility
        total: val,
        zScore: Number(zScore.toFixed(2)),
        type: zScore > 0 ? 'spike' : 'drop',
        severity: Math.abs(zScore) > 3 ? 'high' : 'medium'
      });
    }
  });

  return { anomalies };
}

export function calculateGrowthRate(dataByDay, isExpense = false) {
  if (!Array.isArray(dataByDay) || dataByDay.length < 2) {
    return { weekOverWeek: 0, monthOverMonth: 0, projectedMonthlyRevenue: 0, rSquared: 0 };
  }

  const values = dataByDay.map(d => getVal(d, isExpense));
  const n = values.length;
  const meanY = calculateMean(values);
  
  // x = day index (0 to n-1)
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += (i * values[i]);
    sumX2 += (i * i);
  }

  const denominator = (n * sumX2) - (sumX * sumX);
  const slope = denominator === 0 ? 0 : ((n * sumXY) - (sumX * sumY)) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += Math.pow(values[i] - meanY, 2);
    const predictedY = slope * i + intercept;
    ssRes += Math.pow(values[i] - predictedY, 2);
  }
  const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

  // Growth rates
  const baseValue = meanY === 0 ? 1 : meanY; // prevent division by zero
  const dailyGrowthPercent = (slope / baseValue);
  
  const weekOverWeek = dailyGrowthPercent * 7 * 100;
  const monthOverMonth = dailyGrowthPercent * 30 * 100;

  // Project next 30 days based on linear regression
  let projectedMonthlyTotal = 0;
  for (let i = 1; i <= 30; i++) {
    let projectedDay = slope * (n - 1 + i) + intercept;
    if (projectedDay < 0) projectedDay = 0;
    projectedMonthlyTotal += projectedDay;
  }

  return {
    weekOverWeek: Number(weekOverWeek.toFixed(2)),
    monthOverMonth: Number(monthOverMonth.toFixed(2)),
    projectedMonthlyRevenue: Number(projectedMonthlyTotal.toFixed(2)),
    projectedMonthlyTotal: Number(projectedMonthlyTotal.toFixed(2)), // alias
    rSquared: Math.max(0, Number(rSquared.toFixed(4)))
  };
}

function buildForecast(dataByDay, daysAhead, isExpense = false) {
  if (!Array.isArray(dataByDay) || dataByDay.length < 7) {
    return { insufficient_data: true };
  }

  const values = dataByDay.map(d => getVal(d, isExpense));
  const mean = calculateMean(values);
  const stdDev = calculateStdDev(values, mean);
  const cv = mean === 0 ? 0 : stdDev / mean;

  // Confidence calculation
  let confidence = 'low';
  if (dataByDay.length >= 21 && cv < 0.3) confidence = 'high';
  else if (dataByDay.length >= 14 || cv >= 0.3) confidence = 'medium';
  if (dataByDay.length < 14) confidence = 'low';

  // All zeros edge case
  if (mean === 0) {
    const zeroForecast = [];
    let lastDate = dataByDay[dataByDay.length - 1].date;
    for (let i = 1; i <= daysAhead; i++) {
      lastDate = addDays(lastDate, 1);
      zeroForecast.push({
        date: lastDate,
        predictedRevenue: 0,
        predictedExpenses: 0,
        predictedTotal: 0,
        lowerBound: 0,
        predictedUpperBound: 0
      });
    }
    return {
      forecast: zeroForecast,
      confidence: 'low',
      trend: 'stable',
      weeklyPattern: []
    };
  }

  // Trend calculation
  const growth = calculateGrowthRate(dataByDay, isExpense);
  const trend = growth.weekOverWeek > 2 ? 'upward' : (growth.weekOverWeek < -2 ? 'downward' : 'stable');

  // Seasonality calculation
  const weekdaySums = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
  const weekdayCounts = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };

  dataByDay.forEach(item => {
    const val = getVal(item, isExpense);
    const day = getDayOfWeek(item.date);
    weekdaySums[day] += val;
    weekdayCounts[day] += 1;
  });

  const seasonality = {};
  const weeklyPattern = [];
  Object.keys(weekdaySums).forEach(day => {
    const dayAvg = weekdayCounts[day] > 0 ? weekdaySums[day] / weekdayCounts[day] : mean;
    const index = mean > 0 ? dayAvg / mean : 1;
    seasonality[day] = index;
    weeklyPattern.push({ weekday: day, indexVsAverage: Number(index.toFixed(2)) });
  });

  // WMA calculation (14 days max)
  const wmaWindow = 14;
  const recentData = dataByDay.slice(-wmaWindow);
  
  // Exclude single outliers (z-score > 3) for WMA baseline
  const cleanedHistory = recentData.map(item => {
    const val = getVal(item, isExpense);
    const zScore = stdDev === 0 ? 0 : (val - mean) / stdDev;
    return Math.abs(zScore) > 3 ? mean : val;
  });

  // Recursive WMA for forecasting
  const forecast = [];
  let currentHistory = [...cleanedHistory];
  let lastDate = dataByDay[dataByDay.length - 1].date;

  const cvFactor = mean === 0 ? 0 : (stdDev / mean);
  
  for (let i = 1; i <= daysAhead; i++) {
    lastDate = addDays(lastDate, 1);
    const dayOfWeek = getDayOfWeek(lastDate);
    
    // Calculate WMA
    let sumWeights = 0;
    let sumValues = 0;
    const actualWindow = currentHistory.slice(-wmaWindow);
    const n = actualWindow.length;
    
    for (let j = 0; j < n; j++) {
      const weight = j + 1; // linear decay: oldest=1, newest=n
      sumWeights += weight;
      sumValues += (actualWindow[j] * weight);
    }
    
    const baseWMA = sumWeights === 0 ? mean : sumValues / sumWeights;
    
    // Apply seasonality
    let predictedVal = baseWMA * (seasonality[dayOfWeek] || 1);
    if (predictedVal < 0) predictedVal = 0;

    // Confidence intervals (1.5 std devs relative to mean variation)
    let lowerBound = predictedVal * (1 - cvFactor * 1.5);
    let upperBound = predictedVal * (1 + cvFactor * 1.5);
    if (lowerBound < 0) lowerBound = 0;

    // Store generic forecast
    const forecastItem = {
      date: lastDate,
      lowerBound: Number(lowerBound.toFixed(2)),
      predictedUpperBound: Number(upperBound.toFixed(2))
    };
    
    // Alias fields for backwards compatibility with the requested signature
    if (isExpense) {
      forecastItem.predictedExpenses = Number(predictedVal.toFixed(2));
    } else {
      forecastItem.predictedRevenue = Number(predictedVal.toFixed(2));
    }

    forecast.push(forecastItem);

    // Feed the deseasonalized base WMA back into history to keep trend smooth
    currentHistory.push(baseWMA);
  }

  return {
    forecast,
    confidence,
    trend,
    weeklyPattern
  };
}

export function forecastRevenue(revenueByDay, daysAhead = 30) {
  return buildForecast(revenueByDay, daysAhead, false);
}

export function forecastExpenses(expensesByDay, daysAhead = 30) {
  return buildForecast(expensesByDay, daysAhead, true);
}

export function forecastNetProfit(revenueForecastObj, expenseForecastObj) {
  if (revenueForecastObj.insufficient_data || expenseForecastObj.insufficient_data) {
    return { insufficient_data: true };
  }

  const rForecast = revenueForecastObj.forecast || [];
  const eForecast = expenseForecastObj.forecast || [];
  
  const combinedForecast = [];
  let totalRev = 0;
  let totalExp = 0;

  const length = Math.min(rForecast.length, eForecast.length);
  for (let i = 0; i < length; i++) {
    const rev = rForecast[i].predictedRevenue || 0;
    const exp = eForecast[i].predictedExpenses || 0;
    const profit = rev - exp;
    
    totalRev += rev;
    totalExp += exp;

    combinedForecast.push({
      date: rForecast[i].date,
      predictedRevenue: rev,
      predictedExpenses: exp,
      predictedProfit: Number(profit.toFixed(2))
    });
  }

  const netProfit = totalRev - totalExp;
  const margin = totalRev > 0 ? (netProfit / totalRev) * 100 : 0;

  return {
    forecast: combinedForecast,
    forecastedTotalRevenue: Number(totalRev.toFixed(2)),
    forecastedTotalExpenses: Number(totalExp.toFixed(2)),
    forecastedNetProfit: Number(netProfit.toFixed(2)),
    forecastedMargin: Number(margin.toFixed(2))
  };
}
