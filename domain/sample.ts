import type { FirmSettings, QuoteItem, RateCardItem } from './types';

export const rateCard: RateCardItem[] = [
  [
    'Wardrobe',
    'Modular wardrobe with internal fittings',
    'sqft',
    [1450, 1850, 2400],
  ],
  ['TV Unit', 'Storage-led media console', 'sqft', [1200, 1500, 2000]],
  ['False Ceiling', 'Gypsum ceiling with channels', 'sqft', [140, 180, 240]],
  ['Base Cabinets', 'Modular kitchen base units', 'rft', [9000, 11500, 14500]],
  ['Wall Cabinets', 'Modular kitchen wall units', 'rft', [7500, 9200, 12000]],
  ['Bed Back Panel', 'Upholstered feature panel', 'sqft', [850, 1100, 1550]],
  [
    'Shoe Seater',
    'Custom plywood seating with storage below',
    'quantity',
    [0, 0, 0],
  ],
  [
    'Shoe Storage',
    'Custom plywood shoe storage with shutters',
    'quantity',
    [0, 0, 0],
  ],
  [
    'Demolition',
    'Demolition of walls, doors or windows as specified',
    'sqft',
    [0, 0, 0],
  ],
  [
    'Construction of Walls',
    'Construction of walls and openings as specified',
    'sqft',
    [0, 0, 0],
  ],
  ['Sliding Door', 'Custom sliding door with top track', 'quantity', [0, 0, 0]],
  [
    'Ceiling Light',
    'Supply and installation of ceiling light',
    'quantity',
    [0, 0, 0],
  ],
  [
    'Pendant Light',
    'Supply and installation of pendant light',
    'quantity',
    [0, 0, 0],
  ],
  [
    'Mirror',
    'Supply and installation of mirror as selected',
    'quantity',
    [0, 0, 0],
  ],
  [
    '5-Seater Sofa',
    'Supply of five-seater sofa as selected',
    'quantity',
    [0, 0, 0],
  ],
  ['Vanity', 'Custom vanity with drawers and shutters', 'quantity', [0, 0, 0]],
  [
    'Shower Cubicle',
    'Frameless toughened-glass shower partition',
    'quantity',
    [0, 0, 0],
  ],
].map(([name, description, unit, rates]) => ({
  id: `template-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  name: name as string,
  description: description as string,
  unit: unit as QuoteItem['measurementType'],
  rates: {
    standard: (rates as number[])[0],
    premium: (rates as number[])[1],
    luxury: (rates as number[])[2],
  },
  subUnits: [],
}));

export const firmSettings: FirmSettings = {
  firmName: 'Nebulous Design Workshop',
  letterheadName: 'Nebulous Design Workshop',
  tagline: 'Interior architecture · thoughtfully estimated',
  gstNumber: '',
  address: '',
  phone: '',
  website: 'nebulousdesign.com',
  email: 'info@nebulousdesign.com',
  quotationNotes: 'Rates are valid for 30 days from the quotation date.',
  terms:
    '50% advance on confirmation. Taxes and statutory charges are additional where applicable. Final measurements will be verified on site.',
  thankYou: 'Thank you for choosing Nebulous Design Workshop.',
  enabledTiers: ['standard', 'premium', 'luxury'],
};
