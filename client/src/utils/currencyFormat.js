/**
 * Formats a number as a currency string.
 * @param {number} amount - The numeric amount.
 * @param {string} [currency='USD'] - The currency code (e.g. USD, AED, GBP)
 * @returns {string} Formatted string
 */
export function formatCurrency(amount, currency = 'USD') {
  if (isNaN(amount) || amount === null) return '—';
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (err) {
    // Fallback if currency code is weird
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}
