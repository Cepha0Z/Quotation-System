import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  combineProject,
  itemTechnical,
  mergeThreeWay,
  projectFinancial,
  projectTechnical,
} from '../storage/firebaseWorkspace';
import type { Project, QuoteItem } from '../domain/types';

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
