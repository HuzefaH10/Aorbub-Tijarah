/**
 * Rule-based Insights Engine
 * Analyzes aggregated business data and generates human-readable, actionable insights.
 */

// Helper to format currency
const formatCurrency = (val) => Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generateInsights(aggregatedData, forecastData = {}) {
  const insights = [];
  
  if (!aggregatedData || !aggregatedData.period) {
    return {
      summary: 'Insufficient data to generate insights.',
      score: 0,
      scoreLabel: 'Needs Attention',
      insights: [],
      quickWins: [],
      warnings: [],
      opportunities: []
    };
  }

  const { sales, inventory, expenses, profitLoss, credits, comparisons } = aggregatedData;
  const isSufficientData = !comparisons?.vsLastPeriod?.insufficient_data;

  // ==========================================
  // REVENUE RULES
  // ==========================================
  
  // 1. Weakest weekday
  if (sales.revenueByWeekday && sales.revenueByWeekday.length > 0) {
    let bestDay = sales.revenueByWeekday[0];
    sales.revenueByWeekday.forEach(day => {
      if (day.avgRevenue > bestDay.avgRevenue) bestDay = day;
    });
    
    if (bestDay.avgRevenue > 0) {
      sales.revenueByWeekday.forEach(day => {
        if (day.count > 0 && day.avgRevenue < bestDay.avgRevenue * 0.6) {
          const percentBelow = Math.round((1 - (day.avgRevenue / bestDay.avgRevenue)) * 100);
          insights.push({
            id: `rev_weak_${day.weekday}`,
            category: 'revenue',
            priority: 'medium',
            title: `Weak ${day.weekday} Sales`,
            description: `Your ${day.weekday} revenue is ${percentBelow}% below your best day (${bestDay.weekday}).`,
            action: `Consider a ${day.weekday} promotion or flash sale to boost traffic.`,
            impact: 'medium',
            effort: 'easy',
            isPositive: false,
            metric: { label: 'Avg Revenue', value: `AED ${formatCurrency(day.avgRevenue)}` }
          });
        }
      });
    }
  }

  // 2. Profit trend (improving/declining)
  if (profitLoss.profitTrend === 'declining') {
    insights.push({
      id: 'rev_trend_down',
      category: 'revenue',
      priority: 'critical',
      title: 'Declining Revenue Trend',
      description: `Revenue has trended downwards in the second half of this period vs the first half.`,
      action: 'Review recent changes in traffic or pricing that may have caused this.',
      impact: 'high',
      effort: 'medium',
      isPositive: false,
      metric: { label: 'Trend', value: 'Declining' }
    });
  } else if (profitLoss.profitTrend === 'improving') {
    insights.push({
      id: 'rev_trend_up',
      category: 'revenue',
      priority: 'low', // Positive insights get positive points regardless of priority
      title: 'Improving Revenue Trend',
      description: `Revenue improved in the second half of this period.`,
      action: 'Identify what drove this improvement and double down on it.',
      impact: 'high',
      effort: 'easy',
      isPositive: true,
      metric: { label: 'Trend', value: 'Improving' }
    });
  }

  // 3. vsLastPeriod Revenue Change
  if (isSufficientData) {
    const revChange = comparisons.vsLastPeriod.revenueChange;
    if (revChange < -20) {
      insights.push({
        id: 'rev_drop_20',
        category: 'revenue',
        priority: 'critical',
        title: 'Significant Revenue Drop',
        description: `Revenue dropped ${Math.abs(revChange).toFixed(1)}% vs the previous period.`,
        action: 'Urgently review customer churn, competitor actions, or stock availability.',
        impact: 'high',
        effort: 'hard',
        isPositive: false,
        metric: { label: 'Revenue Change', value: `${revChange.toFixed(1)}%` }
      });
    } else if (revChange > 20) {
      insights.push({
        id: 'rev_grow_20',
        category: 'revenue',
        priority: 'low',
        title: 'Strong Revenue Growth',
        description: `Revenue grew ${revChange.toFixed(1)}% vs the previous period.`,
        action: 'Ensure your inventory and staffing can support this growth rate.',
        impact: 'high',
        effort: 'easy',
        isPositive: true,
        metric: { label: 'Revenue Change', value: `+${revChange.toFixed(1)}%` }
      });
    }

    // 4. Average Transaction Value (ATV) drop
    const txChange = comparisons.vsLastPeriod.transactionChange;
    // Calculate inferred prev ATV using ratios
    if (txChange !== -100) {
      const currATV = sales.averageTransactionValue;
      const prevATV = currATV * (1 + txChange/100) / (1 + revChange/100);
      if (currATV < prevATV * 0.95 && prevATV > 0) { // 5% meaningful drop
        insights.push({
          id: 'rev_atv_drop',
          category: 'revenue',
          priority: 'medium',
          title: 'Lower Average Sale Value',
          description: `Average sale value dropped from AED ${formatCurrency(prevATV)} to AED ${formatCurrency(currATV)}.`,
          action: 'Consider upselling, cross-selling, or creating product bundles.',
          impact: 'medium',
          effort: 'medium',
          isPositive: false,
          metric: { label: 'Current ATV', value: `AED ${formatCurrency(currATV)}` }
        });
      }
    }
  }

  // 5. Payment method concentration
  if (sales.revenueByPaymentMethod && sales.revenueByPaymentMethod.length > 0) {
    const topMethod = sales.revenueByPaymentMethod[0];
    if (topMethod.percentage > 80 && sales.revenueByPaymentMethod.length <= 2) {
      insights.push({
        id: 'rev_pmt_method',
        category: 'revenue',
        priority: 'low',
        title: 'Payment Method Concentration',
        description: `Over 80% of sales are via ${topMethod.method}.`,
        action: 'Offering more payment options could increase conversions.',
        impact: 'low',
        effort: 'medium',
        isPositive: false,
        metric: { label: `${topMethod.method} usage`, value: `${topMethod.percentage.toFixed(1)}%` }
      });
    }
  }

  // ==========================================
  // INVENTORY RULES
  // ==========================================

  // 6. Dead stock
  if (inventory.deadStockItems && inventory.deadStockItems.length > 0) {
    // Only flag top 3 to avoid spam
    inventory.deadStockItems.slice(0, 3).forEach(item => {
      insights.push({
        id: `inv_dead_${item.productId}`,
        category: 'inventory',
        priority: 'medium',
        title: 'Dead Stock Identified',
        description: `'${item.name}' has ${item.currentStock} units with no sales in 30+ days.`,
        action: 'Consider a discount or bundle deal to clear space and recover cash.',
        impact: 'medium',
        effort: 'easy',
        isPositive: false,
        metric: { label: 'Stock', value: `${item.currentStock} units` }
      });
    });
  }

  // 7. Low margin products
  if (inventory.lowMarginProducts && inventory.lowMarginProducts.length > 0) {
    inventory.lowMarginProducts.forEach(item => {
      if (item.marginPercent < 10 && item.marginPercent >= 0) {
        insights.push({
          id: `inv_low_margin_${item.productId}`,
          category: 'inventory',
          priority: 'high',
          title: 'Thin Margins Detected',
          description: `'${item.name}' has only a ${item.marginPercent.toFixed(1)}% margin.`,
          action: 'Review your pricing strategy or renegotiate supplier costs.',
          impact: 'high',
          effort: 'hard',
          isPositive: false,
          metric: { label: 'Margin', value: `${item.marginPercent.toFixed(1)}%` }
        });
      }
    });
  }

  // 8. Out of stock
  if (inventory.outOfStockItems && inventory.outOfStockItems.length > 0) {
    const oosCount = inventory.outOfStockItems.length;
    // Estimate lost revenue based on average product velocity if available, otherwise fallback to standard text
    insights.push({
      id: 'inv_oos',
      category: 'inventory',
      priority: 'critical',
      title: 'Products Out of Stock',
      description: `${oosCount} product(s) are currently out of stock.`,
      action: 'Restock immediately to prevent further lost revenue.',
      impact: 'high',
      effort: 'medium',
      isPositive: false,
      metric: { label: 'OOS Items', value: `${oosCount}` }
    });
  }

  // 9. Stock turnover
  if (inventory.stockTurnoverRate > 0 && inventory.stockTurnoverRate < 2 && aggregatedData.period.totalDays >= 30) {
    insights.push({
      id: 'inv_turnover',
      category: 'inventory',
      priority: 'medium',
      title: 'Slow Stock Turnover',
      description: `Low stock turnover rate (${inventory.stockTurnoverRate.toFixed(2)}). Your inventory is moving slowly.`,
      action: 'Consider promotions on slow items to improve cash flow.',
      impact: 'medium',
      effort: 'medium',
      isPositive: false,
      metric: { label: 'Turnover Rate', value: `${inventory.stockTurnoverRate.toFixed(2)}` }
    });
  }

  // 10. Top margin products (Opportunity)
  if (inventory.topMarginProducts && inventory.topMarginProducts.length > 0) {
    const topMargin = inventory.topMarginProducts[0];
    if (topMargin.marginPercent > 40) {
      insights.push({
        id: 'inv_top_margin',
        category: 'inventory',
        priority: 'low',
        title: 'High Margin Product',
        description: `'${topMargin.name}' has a strong ${topMargin.marginPercent.toFixed(1)}% margin.`,
        action: 'Promoting it more heavily could significantly boost your overall profit.',
        impact: 'high',
        effort: 'easy',
        isPositive: true,
        metric: { label: 'Margin', value: `${topMargin.marginPercent.toFixed(1)}%` }
      });
    }
  }

  // ==========================================
  // EXPENSE RULES
  // ==========================================

  // 11. Large expense category
  if (expenses.expensesByCategory && expenses.expensesByCategory.length > 0) {
    const topExp = expenses.expensesByCategory[0];
    if (topExp.percentage > 40 && expenses.totalExpenses > 0) {
      insights.push({
        id: 'exp_concentration',
        category: 'expenses',
        priority: 'medium',
        title: 'High Expense Concentration',
        description: `'${topExp.category}' accounts for ${topExp.percentage.toFixed(1)}% of your total expenses.`,
        action: 'Review if spending in this category can be optimized or reduced.',
        impact: 'medium',
        effort: 'hard',
        isPositive: false,
        metric: { label: 'Amount', value: `AED ${formatCurrency(topExp.total)}` }
      });
    }
  }

  // 12. Expense vs Last Period
  if (isSufficientData && comparisons.vsLastPeriod.expenseChange > 30) {
    insights.push({
      id: 'exp_jump',
      category: 'expenses',
      priority: 'critical',
      title: 'Expenses Spiked',
      description: `Expenses increased ${comparisons.vsLastPeriod.expenseChange.toFixed(1)}% vs last period.`,
      action: 'Review recent spending to ensure this jump was expected and justified.',
      impact: 'high',
      effort: 'medium',
      isPositive: false,
      metric: { label: 'Increase', value: `+${comparisons.vsLastPeriod.expenseChange.toFixed(1)}%` }
    });
  }

  // 13. Expense to Revenue ratio
  const avgDailyRev = sales.totalRevenue / Math.max(1, aggregatedData.period.totalDays);
  if (expenses.avgDailyExpense > avgDailyRev * 0.7 && avgDailyRev > 0) {
    const ratio = (expenses.avgDailyExpense / avgDailyRev) * 100;
    insights.push({
      id: 'exp_ratio_high',
      category: 'expenses',
      priority: 'high',
      title: 'Thin Operating Margins',
      description: `Daily expenses consume ${ratio.toFixed(1)}% of daily revenue, leaving thin margins.`,
      action: 'Cut unnecessary costs or implement a price increase.',
      impact: 'high',
      effort: 'hard',
      isPositive: false,
      metric: { label: 'Exp/Rev Ratio', value: `${ratio.toFixed(1)}%` }
    });
  }

  // ==========================================
  // CREDITS RULES
  // ==========================================

  // 14. Overdue credits
  if (credits.overdueCredits && credits.overdueCredits.length > 0) {
    let overdueTotal = 0;
    let oldest = credits.overdueCredits[0];
    credits.overdueCredits.forEach(c => {
      overdueTotal += c.amount;
      if (c.daysOverdue > oldest.daysOverdue) oldest = c;
    });

    insights.push({
      id: 'cred_overdue',
      category: 'credits',
      priority: 'critical',
      title: 'Overdue Credits',
      description: `${credits.overdueCredits.length} credits are overdue totaling AED ${formatCurrency(overdueTotal)}. Oldest is ${oldest.personName} at ${oldest.daysOverdue} days.`,
      action: 'Send payment reminders to recover this trapped cash immediately.',
      impact: 'high',
      effort: 'easy',
      isPositive: false,
      metric: { label: 'Overdue Total', value: `AED ${formatCurrency(overdueTotal)}` }
    });
  }

  // 15. Net credits position
  if (credits.netCreditsPosition < 0) {
    insights.push({
      id: 'cred_net_neg',
      category: 'credits',
      priority: 'high',
      title: 'Negative Credit Balance',
      description: `You currently owe more (AED ${formatCurrency(credits.totalOwed)}) than you are owed (AED ${formatCurrency(credits.totalOutstanding)}).`,
      action: 'Ensure sufficient cash reserves to cover upcoming dues.',
      impact: 'high',
      effort: 'medium',
      isPositive: false,
      metric: { label: 'Net Position', value: `AED ${formatCurrency(credits.netCreditsPosition)}` }
    });
  }

  // 16. Extremely old credit
  if (credits.largestCredit && credits.largestCredit.daysOutstanding > 60) {
    insights.push({
      id: 'cred_old',
      category: 'credits',
      priority: 'high',
      title: 'Stagnant Credit',
      description: `${credits.largestCredit.personName} has owed AED ${formatCurrency(credits.largestCredit.amount)} for ${credits.largestCredit.daysOutstanding} days.`,
      action: 'Follow up urgently. Consider writing it off if uncollectable.',
      impact: 'medium',
      effort: 'medium',
      isPositive: false,
      metric: { label: 'Amount', value: `AED ${formatCurrency(credits.largestCredit.amount)}` }
    });
  }

  // ==========================================
  // FORECAST RULES
  // ==========================================
  
  if (forecastData) {
    const days = forecastData.forecast?.length || 30;
    
    if (forecastData.trend === 'upward') {
      const totalRev = forecastData.forecast.reduce((sum, f) => sum + (f.predictedRevenue || 0), 0);
      insights.push({
        id: 'fcst_up',
        category: 'forecast',
        priority: 'low',
        title: 'Positive Forecast',
        description: `Based on recent trends, the next ${days} days are forecast at AED ${formatCurrency(totalRev)} revenue.`,
        action: 'Ensure sufficient stock and staff to handle the projected volume.',
        impact: 'high',
        effort: 'medium',
        isPositive: true,
        metric: { label: 'Proj. Revenue', value: `AED ${formatCurrency(totalRev)}` }
      });
    } else if (forecastData.trend === 'downward') {
      insights.push({
        id: 'fcst_down',
        category: 'forecast',
        priority: 'high',
        title: 'Downward Forecast',
        description: `Forecast suggests revenue may decline over the next ${days} days based on current velocity.`,
        action: 'Review what changed recently and consider a marketing push.',
        impact: 'high',
        effort: 'medium',
        isPositive: false,
        metric: { label: 'Trend', value: 'Declining' }
      });
    }

    if (forecastData.confidence === 'low') {
      insights.push({
        id: 'fcst_low_conf',
        category: 'forecast',
        priority: 'low',
        title: 'Low Forecast Confidence',
        description: `Forecast confidence is low due to limited or highly volatile data.`,
        action: 'Add more consistent sales history for better accuracy.',
        impact: 'low',
        effort: 'easy',
        isPositive: false,
        metric: { label: 'Confidence', value: 'Low' }
      });
    }
  }

  // ==========================================
  // SCORING & SORTING
  // ==========================================

  let score = 100;
  insights.forEach(insight => {
    if (insight.isPositive) {
      score += 5;
    } else {
      if (insight.priority === 'critical') score -= 15;
      else if (insight.priority === 'high') score -= 8;
      else if (insight.priority === 'medium') score -= 3;
      else if (insight.priority === 'low') score -= 1;
    }
  });

  score = Math.max(0, Math.min(100, score));

  let scoreLabel = 'Needs Attention';
  if (score >= 85) scoreLabel = 'Excellent';
  else if (score >= 70) scoreLabel = 'Good';
  else if (score >= 50) scoreLabel = 'Fair';

  // Priority ranking mapping
  const priorityWeight = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
  
  // Sort insights: negative first (by priority), then positives
  insights.sort((a, b) => {
    if (a.isPositive !== b.isPositive) return a.isPositive ? 1 : -1; // negatives first
    return priorityWeight[b.priority] - priorityWeight[a.priority];
  });

  // Categorize
  const warnings = insights.filter(i => !i.isPositive && (i.priority === 'critical' || i.priority === 'high'));
  const opportunities = insights.filter(i => i.isPositive);
  
  // Quick wins: negative insights with high impact and easy effort
  const quickWins = insights
    .filter(i => !i.isPositive && i.effort === 'easy' && (i.impact === 'high' || i.impact === 'medium'))
    .slice(0, 3);

  // ==========================================
  // SUMMARY GENERATION
  // ==========================================

  const profitChangeStr = isSufficientData 
    ? (comparisons.vsLastPeriod.profitChange >= 0 
      ? `up ${comparisons.vsLastPeriod.profitChange.toFixed(1)}%` 
      : `down ${Math.abs(comparisons.vsLastPeriod.profitChange).toFixed(1)}%`)
    : '';

  let summary = `Your business generated AED ${formatCurrency(profitLoss.netProfit)} net profit this period${profitChangeStr ? `, ${profitChangeStr} from last period` : ''}. `;

  if (warnings.length > 0) {
    summary += `Your main concern is ${warnings[0].title.toLowerCase()}: ${warnings[0].description} `;
  } else {
    summary += `Your business metrics are looking stable with no critical warnings. `;
  }

  if (opportunities.length > 0) {
    summary += `Your best opportunity is ${opportunities[0].title.toLowerCase()}: ${opportunities[0].description}`;
  } else if (quickWins.length > 0) {
    summary += `For a quick win, ${quickWins[0].action.toLowerCase()}`;
  }

  return {
    summary: summary.trim(),
    score: Math.round(score),
    scoreLabel,
    insights,
    quickWins,
    warnings,
    opportunities
  };
}
