/**
 * Service Cost & Margin Utility
 * 
 * Total Cost = Direct Cost + Indirect Cost
 * Profit = Selling Price - Total Cost
 * Margin % = (Profit / Selling Price) * 100
 */

export function calculateServiceTotalCost(directCost?: number | null, indirectCost?: number | null): number {
  const dc = directCost !== undefined && directCost !== null ? Number(directCost) : 0;
  const ic = indirectCost !== undefined && indirectCost !== null ? Number(indirectCost) : 0;
  return (isNaN(dc) ? 0 : dc) + (isNaN(ic) ? 0 : ic);
}

export function calculateServiceMarginPct(price: number | null | undefined, directCost?: number | null, indirectCost?: number | null): number {
  const sellingPrice = Number(price);
  if (isNaN(sellingPrice) || sellingPrice <= 0) return 0;

  const totalCost = calculateServiceTotalCost(directCost, indirectCost);
  const profit = sellingPrice - totalCost;
  const marginPct = (profit / sellingPrice) * 100;
  return isNaN(marginPct) ? 0 : marginPct;
}

export function formatMarginPct(marginPct: number): string {
  if (isNaN(marginPct)) return '0.0%';
  return `${marginPct.toFixed(1)}%`;
}
