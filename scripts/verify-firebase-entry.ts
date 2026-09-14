import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  combineProject,
  itemTechnical,
  mergeThreeWay,
  projectFinancial,
  projectTechnical,
  rateCardUpdates,
} from '../storage/firebaseWorkspace';
import type { Project, QuoteItem } from '../domain/types';
import { financialTemplates } from '../domain/financialInitialization';
import { rateCard } from '../domain/sample';
import { itemBaseRate, itemTotal } from '../domain/pricing';

const item: QuoteItem = {
  id: 'item-1',
  name: 'Cabinet',
  description: 'Technical description',
  enabled: true,
  measurementType: 'sqft',
  quantity: 1,
  length: 8,
  width: 4,
  height: 0,
  rates: { standard: 100, premium: 200, luxury: 300 },
  rateOverride: 175,
  discount: 25,
  notes: 'Technical note',
  workType: 'Millwork',
  unit: 'Sq.ft',
  pricingMode: 'unit',
  dimensionUnit: 'ft',
  hsnCode: '9403',
  measureMode: 'dimensions',
  subUnits: [{ id: 'sub-1', name: 'Hardware', rate: 10, enabled: true }],
};

const project: Project = {
  id: 'project-1',
  clientName: 'Client',
  propertyName: 'Villa',
  layout: '4 BHK',
  carpetArea: 2400,
  defaultTier: 'premium',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  floors: [{ id: 'floor-1', name: 'Ground Floor' }],
  rooms: [
    { id: 'room-1', name: 'Living Room', floorId: 'floor-1', items: [item] },
  ],
  fees: [
    {
      id: 'fee-1',
      name: 'Design Fee',
      method: 'flat',
      value: 1000,
      discount: 0,
      enabled: true,
    },
  ],
  projectDiscount: 100,
  showRates: true,
};

const forbidden = [
  'enabled',
  'rates',
  'tierOverride',
  'rateOverride',
  'discount',
  'pricingMode',
  'subUnits',
];
const technicalItem = itemTechnical(item) as Record<string, unknown>;
for (const key of forbidden)
  assert.equal(
    key in technicalItem,
    false,
    `${key} leaked into technical item storage`,
  );

const technical = projectTechnical(project, 'admin-uid');
const financial = projectFinancial(project);
const employeeView = combineProject(technical);
const adminView = combineProject(technical, financial);
assert.equal(employeeView.rooms[0].items[0].rateOverride, undefined);
assert.deepEqual(employeeView.rooms[0].items[0].rates, {
  standard: 0,
  premium: 0,
  luxury: 0,
});
assert.equal(employeeView.projectDiscount, 0);
assert.equal(employeeView.fees.length, 0);
assert.equal(adminView.rooms[0].items[0].rateOverride, 175);
assert.equal(adminView.projectDiscount, 100);
assert.equal(adminView.fees[0].value, 1000);
const flatProject = structuredClone(project);
flatProject.rooms[0].items[0].pricingMode = 'lump-sum';
const flatFinancial = projectFinancial(flatProject);
assert.equal(
  flatFinancial.rooms['room-1'].items['item-1'].pricingMode,
  'lump-sum',
);
const flatReloaded = combineProject(technical, flatFinancial);
assert.equal(flatReloaded.rooms[0].items[0].pricingMode, 'lump-sum');
assert.equal(itemTotal(flatReloaded.rooms[0].items[0], 'premium'), 150);

const bundledWardrobe = rateCard.find(
  (rate) => rate.id === 'template-wardrobe',
)!;
const recoveredRates = financialTemplates(
  {},
  {
    [bundledWardrobe.id]: {
      rates: { ...bundledWardrobe.rates, standard: 99 },
      subUnits: [],
    },
  },
);
const recoveredWardrobe = recoveredRates.find(
  (rate) => rate.id === bundledWardrobe.id,
)!;
assert.equal(recoveredWardrobe.rates.standard, 99);
const editedRates = recoveredRates.map((rate) =>
  rate.id === bundledWardrobe.id
    ? { ...rate, rates: { ...rate.rates, standard: 1000 } }
    : rate,
);
const rateUpdates = rateCardUpdates(recoveredRates, editedRates);
assert.equal(
  rateUpdates[`rateCardTechnical/${bundledWardrobe.id}`].id,
  bundledWardrobe.id,
);
assert.equal(
  rateUpdates[`rateCardFinancial/${bundledWardrobe.id}`].rates.standard,
  1000,
);
assert.equal(Object.keys(rateUpdates).length, 2);

const linkedTechnical = projectTechnical(
  {
    ...project,
    rooms: [
      {
        ...project.rooms[0],
        items: [
          {
            ...item,
            rateCardId: bundledWardrobe.id,
            rateSource: 'template',
            rateOverride: undefined,
          },
        ],
      },
    ],
  },
  'admin-uid',
);
const linkedFinancial = projectFinancial({
  ...project,
  rooms: [
    {
      ...project.rooms[0],
      items: [
        {
          ...item,
          rateCardId: bundledWardrobe.id,
          rateSource: 'template',
          rateOverride: undefined,
        },
      ],
    },
  ],
});
const master1000 = combineProject(
  linkedTechnical,
  linkedFinancial,
  editedRates,
);
assert.equal(itemBaseRate(master1000.rooms[0].items[0], 'standard'), 1000);
const at900 = editedRates.map((rate) =>
  rate.id === bundledWardrobe.id
    ? { ...rate, rates: { ...rate.rates, standard: 900 } }
    : rate,
);
const master900 = combineProject(linkedTechnical, linkedFinancial, at900);
assert.equal(itemBaseRate(master900.rooms[0].items[0], 'standard'), 900);
const overriddenFinancial = structuredClone(linkedFinancial);
overriddenFinancial.rooms['room-1'].items['item-1'].rateOverride = 1350;
const at800 = at900.map((rate) =>
  rate.id === bundledWardrobe.id
    ? { ...rate, rates: { ...rate.rates, standard: 800 } }
    : rate,
);
assert.equal(
  itemBaseRate(
    combineProject(linkedTechnical, overriddenFinancial, at800).rooms[0]
      .items[0],
    'standard',
  ),
  1350,
);
delete overriddenFinancial.rooms['room-1'].items['item-1'].rateOverride;
assert.equal(
  itemBaseRate(
    combineProject(linkedTechnical, overriddenFinancial, at800).rooms[0]
      .items[0],
    'standard',
  ),
  800,
);

const directAreaItem: QuoteItem = {
  ...item,
  rateCardId: undefined,
  measureMode: 'quantity',
  quantity: 14.47,
  rateOverride: 204,
  discount: 0,
  pricingMode: 'unit',
  subUnits: [],
};
assert.equal(itemTotal(directAreaItem, 'standard'), 14.47 * 204);
assert.equal(
  itemTotal({ ...directAreaItem, pricingMode: 'lump-sum' }, 'standard'),
  204,
);
assert.equal(
  itemTotal(
    { ...directAreaItem, pricingMode: 'lump-sum', discount: 4 },
    'standard',
  ),
  200,
);
assert.equal(
  itemTotal(
    { ...directAreaItem, pricingMode: 'lump-sum', rateOverride: 0 },
    'standard',
  ),
  0,
  'An intentional zero override must remain a priced zero, not fall back to master.',
);

const base = {
  rooms: { one: { name: 'Living', notes: '' }, two: { name: 'Kitchen' } },
};
const local = {
  rooms: { one: { name: 'Living Room', notes: '' }, two: { name: 'Kitchen' } },
};
const remote = {
  rooms: { one: { name: 'Living', notes: '' }, two: { name: 'Main Kitchen' } },
};
assert.deepEqual(mergeThreeWay(base, local, remote), {
  rooms: {
    one: { name: 'Living Room', notes: '' },
    two: { name: 'Main Kitchen' },
  },
});

const rules = JSON.parse(readFileSync('database.rules.json', 'utf8'));
const employeeFinancialWrite = rules.rules.projectsFinancial[
  '.write'
] as string;
assert.match(employeeFinancialWrite, /role.*admin/);
assert.doesNotMatch(employeeFinancialWrite, /employee/);
assert.equal(JSON.stringify(rules).includes('hasOnly'), false);
const projectRules = rules.rules.projectsTechnical.$projectId;
const floorRules = projectRules.floors.$floorId;
const roomRules = projectRules.rooms.$roomId;
const itemRules = roomRules.items.$itemId;
const revisionRules = projectRules.revisionHistory.$revisionId;
assert.match(
  revisionRules['.write'],
  /data\.child\('createdBy'\)\.val\(\) === auth\.uid/,
);
assert.match(revisionRules['.write'], /!newData\.exists\(\)/);
assert.match(rules.rules.revisions['.read'], /role.*admin/);
assert.match(rules.rules.revisions['.write'], /role.*admin/);
for (const key of forbidden)
  assert.equal(
    revisionRules.snapshot.rooms.$roomId.items.$itemId[key],
    undefined,
  );
for (const guardedRules of [
  rules.rules.users.$uid,
  projectRules,
  floorRules,
  roomRules,
  itemRules,
])
  assert.equal(guardedRules.$other['.validate'], false);
for (const key of forbidden) assert.equal(itemRules[key], undefined);
assert.equal(rules.rules['.read'], false);
assert.equal(rules.rules['.write'], false);

console.log(
  'Firebase storage split, role rules, and three-way merge checks passed.',
);
