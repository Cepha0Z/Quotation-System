import assert from 'node:assert/strict';
import {
  interiorTotal,
  itemBaseRate,
  itemMeasure,
  itemTotal,
  quoteTotals,
  roomTotal,
} from '../domain/pricing';
import type { Project, QuoteItem } from '../domain/types';

const makeItem = (overrides: Partial<QuoteItem> = {}): QuoteItem => ({
  id: 'item',
  name: 'Pricing audit item',
  description: '',
  enabled: true,
  measurementType: 'quantity',
  measureMode: 'quantity',
  quantity: 1,
  length: 0,
  width: 0,
  height: 0,
  unit: 'Nos',
  dimensionUnit: 'ft',
  hsnCode: '',
  workType: 'Civil Work',
  rates: { standard: 0, premium: 0, luxury: 0 },
  rateOverride: 0,
  rateSource: 'project',
  pricingMode: 'unit',
  discount: 0,
  notes: '',
  subUnits: [],
  ...overrides,
});

const cases: Array<{
  label: string;
  item: QuoteItem;
  area: number;
  flat: number;
}> = [
  {
    label: '32 Sq.ft × ₹9,000',
    item: makeItem({
      quantity: 32,
      unit: 'Sq.ft',
      measurementType: 'sqft',
      rateOverride: 9_000,
    }),
    area: 288_000,
    flat: 9_000,
  },
  {
    label: '1 Nos × ₹30,000',
    item: makeItem({ quantity: 1, unit: 'Nos', rateOverride: 30_000 }),
    area: 30_000,
    flat: 30_000,
  },
  {
    label: '10 Sq.m × ₹1,000',
    item: makeItem({
      quantity: 10,
      unit: 'Sq.m',
      measurementType: 'sqft',
      rateOverride: 1_000,
    }),
    area: 10_000,
    flat: 1_000,
  },
  {
    label: '5 Nos × ₹30,000',
    item: makeItem({ quantity: 5, unit: 'Nos', rateOverride: 30_000 }),
    area: 150_000,
    flat: 30_000,
  },
  {
    label: '100 R.ft × ₹150',
    item: makeItem({
      quantity: 100,
      unit: 'R.ft',
      measurementType: 'rft',
      rateOverride: 150,
    }),
    area: 15_000,
    flat: 150,
  },
  {
    label: '32 Sq.ft × ₹0',
    item: makeItem({
      quantity: 32,
      unit: 'Sq.ft',
      measurementType: 'sqft',
      rateOverride: 0,
    }),
    area: 0,
    flat: 0,
  },
];

for (const test of cases) {
  assert.equal(
    itemTotal({ ...test.item, pricingMode: 'unit' }, 'standard'),
    test.area,
    `${test.label} AREA`,
  );
  assert.equal(
    itemTotal({ ...test.item, pricingMode: 'lump-sum' }, 'standard'),
    test.flat,
    `${test.label} FLAT`,
  );
}

const dimensions = makeItem({
  quantity: 999,
  length: 8,
  width: 4,
  measureMode: 'dimensions',
  measurementType: 'sqft',
  unit: 'Sq.ft',
  rateOverride: 9_000,
});
assert.equal(itemMeasure(dimensions), 32);
assert.equal(
  itemTotal({ ...dimensions, pricingMode: 'unit' }, 'standard'),
  288_000,
);
assert.equal(
  itemTotal({ ...dimensions, pricingMode: 'lump-sum' }, 'standard'),
  9_000,
);
assert.equal(
  itemTotal(
    {
      ...dimensions,
      pricingMode: 'lump-sum',
      subUnits: [
        { id: 'component', name: 'Component', rate: 25_000, enabled: true },
      ],
    },
    'standard',
  ),
  9_000,
  'A FLAT price is the complete item total and cannot gain a quantity/component multiplier.',
);
assert.equal(
  itemTotal(
    { ...dimensions, pricingMode: 'unit', rateOverride: 1_000, discount: 500 },
    'standard',
  ),
  31_500,
);
assert.equal(
  itemTotal(
    {
      ...dimensions,
      pricingMode: 'lump-sum',
      rateOverride: 9_000,
      discount: 500,
    },
    'standard',
  ),
  8_500,
);

const master = makeItem({
  rateCardId: 'template-wardrobe',
  rateSource: 'template',
  rateOverride: undefined,
  quantity: 32,
  unit: 'Sq.ft',
  measurementType: 'sqft',
  rates: { standard: 1_450, premium: 1_450, luxury: 1_450 },
});
assert.equal(itemTotal(master, 'standard'), 46_400);
assert.equal(
  itemTotal(
    { ...master, rates: { standard: 1_000, premium: 1_000, luxury: 1_000 } },
    'standard',
  ),
  32_000,
);
const override = {
  ...master,
  rateOverride: 1_350,
  rateSource: 'project' as const,
};
assert.equal(itemTotal(override, 'standard'), 43_200);
assert.equal(
  itemTotal(
    { ...override, rates: { standard: 900, premium: 900, luxury: 900 } },
    'standard',
  ),
  43_200,
);
const useMaster = {
  ...override,
  rates: { standard: 900, premium: 900, luxury: 900 },
  rateOverride: undefined,
  rateSource: 'template' as const,
};
assert.equal(itemBaseRate(useMaster, 'standard'), 900);
assert.equal(itemTotal(useMaster, 'standard'), 28_800);
assert.equal(
  itemTotal({ ...useMaster, pricingMode: 'lump-sum' }, 'standard'),
  900,
);
assert.equal(
  itemTotal({ ...override, pricingMode: 'lump-sum' }, 'standard'),
  1_350,
);

const unpriced = makeItem({ rateOverride: undefined });
assert.equal(itemBaseRate(unpriced, 'standard'), 0);
assert.equal(itemTotal(unpriced, 'standard'), 0);
assert.equal(
  Object.hasOwn(unpriced, 'rateOverride'),
  true,
  'Missing-rate state remains distinguishable from an explicit zero value.',
);
assert.equal(makeItem({ rateOverride: 0 }).rateOverride, 0);

const areaItem = makeItem({
  id: 'area',
  quantity: 32,
  unit: 'Sq.ft',
  measurementType: 'sqft',
  rateOverride: 1_000,
});
const flatItem = makeItem({
  id: 'flat',
  quantity: 5,
  rateOverride: 50_000,
  pricingMode: 'lump-sum',
});
const project: Project = {
  id: 'pricing-audit',
  propertyName: 'Pricing Audit',
  clientName: 'Test',
  layout: '',
  carpetArea: 100,
  defaultTier: 'standard',
  status: 'active',
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z',
  floors: [{ id: 'ground', name: 'Ground Floor' }],
  rooms: [
    {
      id: 'living',
      name: 'Living Room',
      floorId: 'ground',
      items: [areaItem, flatItem],
    },
  ],
  fees: [
    {
      id: 'flat-fee',
      name: 'Drawing Fee',
      method: 'flat',
      value: 1_000,
      discount: 0,
      enabled: true,
    },
    {
      id: 'percent-fee',
      name: 'Management',
      method: 'percentage',
      value: 10,
      discount: 0,
      enabled: true,
    },
  ],
  projectDiscount: 500,
  showRates: true,
};
assert.equal(roomTotal(project.rooms[0], 'standard'), 82_000);
assert.equal(interiorTotal(project), 82_000);
assert.deepEqual(quoteTotals(project), {
  interior: 82_000,
  fees: [
    { ...project.fees[0], original: 1_000, total: 1_000 },
    { ...project.fees[1], original: 8_200, total: 8_200 },
  ],
  feeTotal: 9_200,
  subtotal: 91_200,
  discount: 500,
  savings: 500,
  grandTotal: 90_700,
});

console.log(
  'Pricing modes, dimensions, zero/unpriced, master/override, aggregation, fees, and discounts passed.',
);
