import type { Fee, Project, QuoteItem, Room, Tier } from './types';

const safe = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export const inr = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(safe(value));
export const effectiveTier = (item: QuoteItem, projectTier: Tier) => item.tierOverride ?? projectTier;
export const itemBaseRate = (item: QuoteItem, projectTier: Tier, forcedTier?: Tier) => item.rateOverride ?? item.rates[forcedTier ?? effectiveTier(item, projectTier)] ?? 0;
export const itemMeasure = (item: QuoteItem) => {
  if (item.measurementType === 'sqft') return safe(item.length) * safe(item.width);
  if (item.measurementType === 'rft') return safe(item.length);
  if (item.measurementType === 'quantity') return safe(item.quantity);
  return 1;
};
export const itemOriginalTotal = (item: QuoteItem, projectTier: Tier, forcedTier?: Tier) => item.enabled ? itemMeasure(item) * safe(itemBaseRate(item, projectTier, forcedTier)) + item.subUnits.filter(s => s.enabled).reduce((a, s) => a + safe(s.rate), 0) : 0;
export const itemTotal = (item: QuoteItem, projectTier: Tier, forcedTier?: Tier) => Math.max(0, itemOriginalTotal(item, projectTier, forcedTier) - safe(item.discount));
export const roomTotal = (room: Room, tier: Tier, forcedTier?: Tier) => room.items.reduce((sum, item) => sum + itemTotal(item, tier, forcedTier), 0);
export const interiorTotal = (project: Project, forcedTier?: Tier) => project.rooms.reduce((sum, room) => sum + roomTotal(room, project.defaultTier, forcedTier), 0);
export const feeOriginal = (fee: Fee, project: Project, interior = interiorTotal(project)) => fee.enabled ? fee.method === 'sqft' ? safe(project.carpetArea) * safe(fee.value) : fee.method === 'percentage' ? interior * safe(fee.value) / 100 : safe(fee.value) : 0;
export const feeTotal = (fee: Fee, project: Project, interior = interiorTotal(project)) => Math.max(0, feeOriginal(fee, project, interior) - safe(fee.discount));
export const quoteTotals = (project: Project, forcedTier?: Tier) => {
  const interior = interiorTotal(project, forcedTier);
  const fees = project.fees.map(fee => ({ ...fee, original: feeOriginal(fee, project, interior), total: feeTotal(fee, project, interior) }));
  const feeTotalValue = fees.reduce((sum, f) => sum + f.total, 0);
  const subtotal = interior + feeTotalValue;
  return { interior, fees, feeTotal: feeTotalValue, subtotal, discount: safe(project.projectDiscount), grandTotal: Math.max(0, subtotal - safe(project.projectDiscount)) };
};
