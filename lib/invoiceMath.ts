import { InvoiceItem } from '../types';

export interface InvoiceTotals {
  grossSubtotal: number;       // Sum of (price * quantity) before any discount
  lineItemDiscounts: number;   // Sum of item-level discounts
  invoiceDiscount: number;     // Invoice-level discount (invoice.discount)
  totalDiscount: number;       // lineItemDiscounts + invoiceDiscount
  netSubtotal: number;         // Math.max(0, grossSubtotal - totalDiscount)
  tax: number;                 // 7.5% VAT on netSubtotal
  total: number;               // netSubtotal + tax
}

/**
 * Centrally calculates financial totals for both one-time and recurring invoices.
 * Ensures consistent handling of item-level and invoice-level discounts,
 * net taxable subtotal, 7.5% VAT, and final totals.
 */
export function calculateInvoiceTotals(
  items: InvoiceItem[] = [],
  invoiceDiscount: number = 0
): InvoiceTotals {
  const grossSubtotal = (items || []).reduce((sum, item) => {
    const q = Math.max(0, Number(item?.quantity) || 0);
    const p = Math.max(0, Number(item?.price) || 0);
    return sum + (q * p);
  }, 0);

  const lineItemDiscounts = (items || []).reduce((sum, item) => {
    const d = Math.max(0, Number(item?.discount) || 0);
    return sum + d;
  }, 0);

  const cleanInvoiceDiscount = Math.max(0, Number(invoiceDiscount) || 0);
  const totalDiscount = lineItemDiscounts + cleanInvoiceDiscount;
  const netSubtotal = Math.max(0, grossSubtotal - totalDiscount);
  const tax = Math.round(netSubtotal * 0.075 * 100) / 100;
  const total = Math.round((netSubtotal + tax) * 100) / 100;

  return {
    grossSubtotal,
    lineItemDiscounts,
    invoiceDiscount: cleanInvoiceDiscount,
    totalDiscount,
    netSubtotal,
    tax,
    total
  };
}
