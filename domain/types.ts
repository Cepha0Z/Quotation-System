export type Tier = 'standard' | 'premium' | 'luxury';
export type MeasurementType = 'sqft' | 'rft' | 'quantity' | 'flat';

export interface TierRates { standard: number; premium: number; luxury: number }
export interface SubUnit { id: string; name: string; rate: number; enabled: boolean }
export interface QuoteItem {
  id: string; rateCardId?: string; name: string; description: string; enabled: boolean;
  measurementType: MeasurementType; quantity: number; length: number; width: number; height: number;
  rates: TierRates; tierOverride?: Tier; rateOverride?: number; discount: number; notes: string;
  subUnits: SubUnit[];
}
export interface Room { id: string; name: string; items: QuoteItem[] }
export type FeeMethod = 'sqft' | 'percentage' | 'flat';
export interface Fee { id: string; name: string; method: FeeMethod; value: number; discount: number; enabled: boolean }
export interface Project {
  id: string; clientName: string; propertyName: string; layout: string; carpetArea: number;
  defaultTier: Tier; status: 'active' | 'draft' | 'closed'; createdAt: string; updatedAt: string;
  rooms: Room[]; fees: Fee[]; projectDiscount: number; showRates: boolean;
}
export interface RateCardItem { id: string; name: string; description: string; unit: MeasurementType; rates: TierRates; subUnits: SubUnit[] }
export interface FirmSettings {
  firmName: string; letterheadName: string; tagline: string; gstNumber: string; address: string;
  phone: string; website: string; email: string; quotationNotes: string; terms: string; thankYou: string;
  enabledTiers: Tier[];
}
export interface Revision { id: string; projectId: string; number: number; createdAt: string; total: number; note: string; snapshot: Project }
