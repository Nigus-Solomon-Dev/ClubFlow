/**
 * Nightclub stock display & counting helpers.
 *
 * Internally all stock is stored in "stock units" (bottles for alcohol,
 * pieces for beer/soft drinks). The barman and the manager think in everyday
 * units: bottles + sub-units (doubles/shots/halves) for alcohol, and
 * kasa (case) + pieces for beer/soft drinks. These helpers convert between
 * the two and render them for the UI.
 */

import type { SellingUnit } from '@/types';

/** Minimal shape a stock helper needs from a product (Product or handover product). */
export interface StockProductLike {
  stockUnit?: string | null;
  piecesPerCase?: number | null;
  category?: { name: string } | null;
  sellingUnits?: SellingUnit[];
}

export interface UnitCount {
  /** whole unit label, e.g. "Bottle" or "Kasa" */
  whole: string;
  /** number of whole units */
  wholeCount: number;
  /** sub-unit label, e.g. "Doubles", "Shots", "Pieces" (null when none) */
  sub: string | null;
  /** number of sub-units in the remainder */
  subCount: number;
  /** stock units per sub-unit (0 when none) */
  subConsumption: number;
}

function plural(name: string): string {
  const n = name.toLowerCase();
  if (n === 'half') return 'halves';
  if (n.endsWith('s')) return n;
  return `${n}s`;
}

/** The smallest selling unit smaller than a whole stock unit (e.g. Double, Shot, Half). */
export function subUnitOf(product: StockProductLike): SellingUnit | null {
  let best: SellingUnit | null = null;
  for (const u of product.sellingUnits ?? []) {
    const c = Number(u.stockConsumption);
    if (c > 0 && c < 1 && (!best || c < Number(best.stockConsumption))) {
      best = u;
    }
  }
  return best;
}

/** True when the product is stocked per piece (beer/soft/red bull). */
export function isPieceProduct(product: StockProductLike): boolean {
  if (product.stockUnit === 'Bottle') return false;
  if (product.category?.name === 'Alcohol') return false;
  if (
    product.sellingUnits &&
    product.sellingUnits.some((u) =>
      ['bottle', 'half', 'double', 'shot'].includes(u.name.toLowerCase()),
    )
  ) {
    return false;
  }
  return product.stockUnit === 'Piece' || (!product.stockUnit && product.category?.name !== 'Alcohol');
}

/** Decompose a stock quantity into everyday units for display/counting. */
export function decompose(product: StockProductLike, qty: number): UnitCount {
  const perCase = product.piecesPerCase ?? 24;
  if (isPieceProduct(product)) {
    const kasa = Math.floor(qty / perCase);
    const pieces = Math.max(0, qty - kasa * perCase);
    return {
      whole: 'Kasa',
      wholeCount: kasa,
      sub: 'Pieces',
      subCount: pieces,
      subConsumption: 1,
    };
  }
  const sub = subUnitOf(product);
  const bottles = Math.floor(qty);
  const remainder = Math.max(0, qty - bottles);
  if (sub && remainder > 0.0001) {
    const subCount = Math.round(remainder / Number(sub.stockConsumption));
    return {
      whole: 'Bottle',
      wholeCount: bottles,
      sub: plural(sub.name),
      subCount,
      subConsumption: Number(sub.stockConsumption),
    };
  }
  return {
    whole: 'Bottle',
    wholeCount: bottles,
    sub: null,
    subCount: 0,
    subConsumption: 0,
  };
}

/** Render a stock quantity in everyday units, e.g. "2 bottles 10 doubles" or "1 kasa 2 pieces". */
export function formatLeft(product: StockProductLike, qty: number): string {
  const d = decompose(product, qty);
  const parts: string[] = [];
  if (d.wholeCount > 0) {
    parts.push(`${d.wholeCount} ${d.whole.toLowerCase()}${d.wholeCount > 1 ? 's' : ''}`);
  }
  if (d.sub && d.subCount > 0) {
    parts.push(`${d.subCount} ${d.sub}`);
  }
  if (parts.length === 0) return '0';
  return parts.join(' ');
}

/** Labels for the count inputs of a product. */
export function countLabels(product: StockProductLike): { whole: string; sub: string | null } {
  if (isPieceProduct(product)) {
    return { whole: 'Kasa', sub: 'Pieces' };
  }
  const sub = subUnitOf(product);
  return { whole: 'Bottle', sub: sub ? plural(sub.name) : null };
}

/**
 * Convert an everyday count (whole units + sub-units) back into stock units.
 * Whole units for piece products are kasa (multiplied by piecesPerCase).
 */
export function parseCount(
  product: StockProductLike,
  whole: string,
  sub: string,
): number {
  const perCase = product.piecesPerCase ?? 24;
  const wholeNum = Number(whole);
  if (isPieceProduct(product)) {
    const kasa = Number.isFinite(wholeNum) && wholeNum > 0 ? wholeNum : 0;
    const pieces = Number(sub);
    const p = Number.isFinite(pieces) && pieces > 0 ? pieces : 0;
    return kasa * perCase + p;
  }
  const bottles = Number.isFinite(wholeNum) && wholeNum > 0 ? wholeNum : 0;
  const unit = subUnitOf(product);
  if (unit && sub.trim() !== '') {
    const s = Number(sub);
    const extra = Number.isFinite(s) && s > 0 ? s : 0;
    return bottles + extra * Number(unit.stockConsumption);
  }
  return bottles;
}

/** The giving unit for a product: whole bottles for alcohol, whole kasa for beer/soft. */
export function giveUnit(product: StockProductLike): { name: string; factor: number } {
  if (isPieceProduct(product)) {
    return { name: 'Kasa', factor: product.piecesPerCase ?? 24 };
  }
  return { name: 'Bottle', factor: 1 };
}

export function roundQty(n: number): number {
  return Math.round(n * 10000) / 10000;
}
