import { InvoiceFrequency } from '../types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats period_start and period_end into a clean, human-readable billing period string.
 * Example output:
 *   - "Sep 1 – Sep 30, 2026" (same month)
 *   - "Sep 1, 2026 – Oct 31, 2026" (different months)
 *   - "From Sep 1, 2026" (only start date)
 *   - "Until Sep 30, 2026" (only end date)
 */
export function formatBillingPeriod(startStr?: string | null, endStr?: string | null): string | null {
  if (!startStr && !endStr) return null;

  const parseDate = (dStr: string) => {
    if (!dStr) return null;
    const cleanStr = dStr.split('T')[0];
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { year: y, month: m, day: d, monthName: MONTH_NAMES[m] || '' };
      }
    }
    const dt = new Date(dStr);
    if (!isNaN(dt.getTime())) {
      return { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate(), monthName: MONTH_NAMES[dt.getMonth()] || '' };
    }
    return null;
  };

  const pStart = startStr ? parseDate(startStr) : null;
  const pEnd = endStr ? parseDate(endStr) : null;

  if (pStart && pEnd) {
    if (pStart.year === pEnd.year) {
      if (pStart.month === pEnd.month) {
        // Example user requirement: "Billing period: Sep 1 – Sep 30, 2026"
        return `${pStart.monthName} ${pStart.day} – ${pEnd.monthName} ${pEnd.day}, ${pStart.year}`;
      }
      return `${pStart.monthName} ${pStart.day}, ${pStart.year} – ${pEnd.monthName} ${pEnd.day}, ${pStart.year}`;
    }
    return `${pStart.monthName} ${pStart.day}, ${pStart.year} – ${pEnd.monthName} ${pEnd.day}, ${pEnd.year}`;
  }

  if (pStart) {
    return `From ${pStart.monthName} ${pStart.day}, ${pStart.year}`;
  }

  if (pEnd) {
    return `Until ${pEnd.monthName} ${pEnd.day}, ${pEnd.year}`;
  }

  return null;
}

/**
 * Calculates default period_start and period_end based on a starting date and invoice frequency.
 */
export function calculateBillingPeriod(
  startDateStr: string,
  frequency: InvoiceFrequency = 'monthly'
): { periodStart: string; periodEnd: string } {
  const cleanStr = (startDateStr || new Date().toISOString()).split('T')[0];
  const parts = cleanStr.split('-');
  let y = parseInt(parts[0], 10);
  let m = parseInt(parts[1], 10) - 1;
  let d = parseInt(parts[2], 10);

  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    const dt = new Date();
    y = dt.getFullYear();
    m = dt.getMonth();
    d = dt.getDate();
  }

  const start = new Date(y, m, d);
  const startIso = start.toISOString().split('T')[0];

  let end: Date;
  switch (frequency) {
    case 'daily':
      end = new Date(y, m, d);
      break;
    case 'weekly':
      end = new Date(y, m, d + 6);
      break;
    case 'quarterly':
      end = new Date(y, m + 3, d - 1);
      break;
    case 'biannually':
      end = new Date(y, m + 6, d - 1);
      break;
    case 'annually':
    case 'yearly':
      end = new Date(y + 1, m, d - 1);
      break;
    case 'monthly':
    default:
      end = new Date(y, m + 1, d - 1);
      break;
  }

  const endIso = end.toISOString().split('T')[0];
  return { periodStart: startIso, periodEnd: endIso };
}
