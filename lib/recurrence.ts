import { InvoiceFrequency } from '../types';

export function calculateNextRecurrenceDate(currentDateStrOrObj: string | Date, frequency: InvoiceFrequency): string {
  const currentDate = typeof currentDateStrOrObj === 'string' ? new Date(currentDateStrOrObj) : currentDateStrOrObj;
  const nextDate = new Date(currentDate);
  if (isNaN(nextDate.getTime())) return '';
  nextDate.setHours(0, 0, 0, 0);
  switch (frequency) {
    case 'daily': nextDate.setDate(currentDate.getDate() + 1); break;
    case 'weekly': nextDate.setDate(currentDate.getDate() + 7); break;
    case 'monthly': nextDate.setMonth(currentDate.getMonth() + 1); break;
    case 'quarterly': nextDate.setMonth(currentDate.getMonth() + 3); break;
    case 'biannually': nextDate.setMonth(currentDate.getMonth() + 6); break;
    case 'annually':
    case 'yearly': nextDate.setFullYear(currentDate.getFullYear() + 1); break;
    default: return '';
  }
  return nextDate.toISOString().split('T')[0];
}

export function formatFrequencyLabel(freq?: string): string {
  if (!freq) return 'One-Time';
  const f = freq.toLowerCase();
  switch (f) {
    case 'one-time': return 'One-Time';
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
    case 'biannually':
    case 'bi-annually': return 'Bi-Annually';
    case 'annually':
    case 'yearly': return 'Annually';
    default: return freq;
  }
}
