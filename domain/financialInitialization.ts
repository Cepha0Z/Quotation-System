import type { Fee, QuoteItem, RateCardItem, Tier } from './types';
import { createDefaultFees } from './projectDefaults';
import { rateCard as bundledTemplates } from './sample';

type Money = Partial<Pick<QuoteItem, 'enabled' | 'rateSource' | 'rates' | 'tierOverride' | 'rateOverride' | 'discount' | 'pricingMode' | 'subUnits'>>;
export interface TechnicalProject {
  id: string;
  rooms?: Record<string, { items?: Record<string, Pick<QuoteItem, 'id' | 'name' | 'measurementType' | 'rateCardId'>> }>;
}
export interface FinancialProject {
  defaultTier?: Tier;
  projectDiscount?: number;
  showRates?: boolean;
  feesInitialized?: boolean;
  fees?: Record<string, Fee>;
  feeOrder?: string[];
  rooms?: Record<string, { items?: Record<string, Money> }>;
}

// Match the same saved-template precedence as the UI. Bundled templates are
// defaults only; an explicitly saved zero rate is never replaced by a default.
export function financialTemplates(
  technical: Record<string, Pick<RateCardItem, 'id' | 'name' | 'description' | 'unit'>>,
  financial: Record<string, Pick<RateCardItem, 'rates' | 'subUnits'>>,
): RateCardItem[] {
  const saved = Object.values(technical).filter((template) => financial[template.id]?.rates).map((template) => ({
    ...template,
    rates: financial[template.id]?.rates ?? { standard: 0, premium: 0, luxury: 0 },
    subUnits: financial[template.id]?.subUnits ?? [],
  }));
  // Recover financial-only records produced by older clients. Stable bundled
  // IDs make this unambiguous and preserve explicit zero rates.
  const recovered = bundledTemplates.filter((template) =>
    !technical[template.id] && Boolean(financial[template.id]?.rates),
  ).map((template) => ({
    ...template,
    rates: financial[template.id]!.rates,
    subUnits: financial[template.id]?.subUnits ?? [],
  }));
  const represented = [...saved, ...recovered];
  return [...represented, ...bundledTemplates.filter((template) =>
    !represented.some((row) => row.id === template.id || row.name.toLowerCase() === template.name.toLowerCase())
    && !Object.values(technical).some((row) => row.name.toLowerCase() === template.name.toLowerCase()),
  )];
}

// Pure, retry-safe initialization. Existing project money (including zero and
// overrides) wins. No quantity, description or other employee input is money.
export function resolveTemplate(
  item: Pick<QuoteItem, 'rateCardId' | 'name' | 'measurementType'>,
  templates: RateCardItem[],
) {
  if (!item.rateCardId) return undefined;
  const direct = templates.find((template) => template.id === item.rateCardId);
  if (direct) return direct;
  const legacy = templates.filter((template) => template.name.toLowerCase() === item.name.toLowerCase()
    && template.unit === item.measurementType);
  return legacy.length === 1 ? legacy[0] : undefined;
}

export function initializeMissingFinancials(
  technical: TechnicalProject,
  current: FinancialProject | null,
  templates: RateCardItem[],
): FinancialProject {
  const result: FinancialProject = structuredClone(current ?? {
    defaultTier: 'standard', projectDiscount: 0, showRates: true,
  });
  if (!result.feesInitialized) {
    if (!current) {
      const fees = createDefaultFees();
      result.fees = Object.fromEntries(fees.map((fee) => [fee.id, fee]));
      result.feeOrder = fees.map((fee) => fee.id);
    }
    result.feesInitialized = true;
  }
  for (const [roomId, room] of Object.entries(technical.rooms ?? {})) {
    for (const [itemId, item] of Object.entries(room.items ?? {})) {
      if (result.rooms?.[roomId]?.items?.[itemId]) continue;
      // Moving a technical item between rooms must retain its project price.
      const previous = Object.values(current?.rooms ?? {}).find((r) => r.items?.[itemId])?.items?.[itemId];
      const template = resolveTemplate(item, templates);
      if (!previous && item.rateCardId && !template) continue;
      const money: Money = previous ?? {
        enabled: true,
        rateSource: template ? 'template' : 'project',
        rates: template?.rates ?? { standard: 0, premium: 0, luxury: 0 },
        discount: 0,
        pricingMode: item.measurementType === 'flat' ? 'lump-sum' : 'unit',
        subUnits: template?.subUnits ?? [],
      };
      result.rooms ??= {};
      result.rooms[roomId] ??= {};
      result.rooms[roomId].items ??= {};
      result.rooms[roomId].items![itemId] = structuredClone(money);
    }
  }
  return result;
}
