/**
 * dateUtils.js — Shared date/time formatting respecting business timezone.
 * 
 * Usage:
 *   import { formatDate, formatDateTime, todayISO, todayDisplay } from '../utils/dateUtils';
 *   const { timezone } = useBusiness();
 *   formatDate(new Date(), timezone)  // → "10 May 2026"
 */

const DEFAULT_TZ = 'Asia/Karachi';

/**
 * Returns today's date in ISO format (YYYY-MM-DD) using the business timezone.
 */
export function todayISO(timezone = DEFAULT_TZ) {
  try {
    const now = new Date();
    // Format to YYYY-MM-DD in business timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Returns today's date formatted for display (e.g. "10 May 2026").
 */
export function todayDisplay(timezone = DEFAULT_TZ) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toLocaleDateString('en-GB');
  }
}

/**
 * Formats any date/timestamp for display using the business timezone.
 * @param {Date|string|number|null} date
 * @param {string} timezone  - e.g. 'Asia/Karachi'
 * @param {'date'|'datetime'|'short'} mode
 */
export function formatDate(date, timezone = DEFAULT_TZ, mode = 'date') {
  if (!date) return '—';
  try {
    const d = date?.toDate ? date.toDate() : new Date(date);
    if (isNaN(d.getTime())) return '—';

    if (mode === 'datetime') {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }).format(d);
    }
    if (mode === 'short') {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        month: 'short', day: 'numeric',
      }).format(d);
    }
    // default: 'date'
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric', month: 'long', day: 'numeric',
    }).format(d);
  } catch {
    return String(date);
  }
}

/**
 * Returns the current timestamp as a JS Date in the business timezone.
 * (Still a UTC Date object — use formatDate for display.)
 */
export function nowInTz(timezone = DEFAULT_TZ) {
  return new Date(); // JS Date is always UTC; timezone is only for display
}
