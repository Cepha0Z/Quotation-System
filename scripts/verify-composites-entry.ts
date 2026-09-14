import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  moveCompositeChild,
  matchesHierarchySearch,
  normalizeCompositeItems,
  orderedCompositeChildren,
  orderedPriceableItems,
  removeItemTree,
} from '../domain/composites';
import { compositeTotal, itemTotal, roomTotal } from '../domain/pricing';
import { combineProject, projectFinancial, projectTechnical } from '../storage/firebaseWorkspace';
import type { Project, QuoteItem, Room } from '../domain/types';

const simple = (id: string, name: string, rate: number): QuoteItem => ({
  id, name, description: '', enabled: true, measurementType: 'quantity',
  quantity: 1, length: 0, width: 0, height: 0,
  rates: { standard: rate, premium: rate, luxury: rate }, discount: 0,
  notes: '', workType: 'Millwork', unit: 'Nos', pricingMode: 'unit',
  measureMode: 'quantity', dimensionUnit: 'ft', subUnits: [],
});
const parent: QuoteItem = {
  ...simple('group', 'Kitchen Cabinets', 999999),
  itemType: 'composite', childrenOrder: ['shutter', 'carcass'],
};
const carcass = { ...simple('carcass', 'Carcass', 210000), parentItemId: parent.id };
const shutter = { ...simple('shutter', 'Shutters', 160000), parentItemId: parent.id };
const room: Room = { id: 'room', name: 'Kitchen', floorId: 'floor', items: [parent, carcass, shutter] };

assert.equal(itemTotal(parent, 'standard'), 0, 'composite parents must never carry a price');
assert.equal(compositeTotal(parent, room, 'standard'), 370000);
assert.equal(roomTotal(room, 'standard'), 370000, 'children must be counted exactly once');
assert.equal(
  compositeTotal(parent, { ...room, items: [parent, { ...carcass, enabled: false }, shutter] }, 'standard'),
  160000,
  'disabled components must not contribute',
);
assert.equal(
  compositeTotal(parent, { ...room, items: [parent, { ...carcass, quantity: 0 }, shutter] }, 'standard'),
  160000,
  'zero-quantity components must remain zero',
);
assert.equal(
  compositeTotal(parent, { ...room, items: [parent, { ...carcass, quantity: -2 }, shutter] }, 'standard'),
  160000,
  'negative component quantities must be clamped safely',
);
assert.deepEqual(orderedCompositeChildren(room, parent).map((item) => item.id), ['shutter', 'carcass']);
assert.deepEqual(orderedPriceableItems(room).map((item) => item.id), ['shutter', 'carcass']);
assert.equal(matchesHierarchySearch(carcass, parent, ['Kitchen'], 'carcass'), true);
assert.equal(matchesHierarchySearch(carcass, parent, ['Kitchen'], 'kitchen cabinets'), true);
assert.equal(matchesHierarchySearch(carcass, parent, ['Kitchen'], 'wardrobe'), false);
assert.deepEqual(
  orderedCompositeChildren(
    { ...room, items: moveCompositeChild(room.items, parent.id, 'carcass', -1) },
    moveCompositeChild(room.items, parent.id, 'carcass', -1)[0],
  ).map((item) => item.id),
  ['carcass', 'shutter'],
);
assert.deepEqual(removeItemTree(room.items, 'carcass').map((item) => item.id), ['group', 'shutter']);
assert.deepEqual(removeItemTree(room.items, 'group'), []);

const invalid = normalizeCompositeItems([
  parent,
  { ...simple('orphan', 'Orphan', 10), parentItemId: 'missing' },
  { ...simple('nested', 'Nested group', 10), itemType: 'composite', parentItemId: 'group' },
]);
assert.equal(invalid.find((item) => item.id === 'orphan')?.parentItemId, undefined);
assert.equal(invalid.find((item) => item.id === 'nested')?.parentItemId, undefined);

const project: Project = {
  id: 'project', clientName: 'Client', propertyName: 'Villa', layout: '4 BHK',
  carpetArea: 2400, defaultTier: 'standard', status: 'active',
  createdAt: '2026-09-14T00:00:00.000Z', updatedAt: '2026-09-14T00:00:00.000Z',
  floors: [{ id: 'floor', name: 'Ground Floor' }], rooms: [room], fees: [],
  projectDiscount: 0, showRates: true,
};
const technical = projectTechnical(project, 'employee');
const financial = projectFinancial(project);
assert.equal(technical.rooms.room.items.group.itemType, 'composite');
assert.equal(technical.rooms.room.items.carcass.parentItemId, 'group');
assert.deepEqual(technical.rooms.room.items.group.childrenOrder, ['shutter', 'carcass']);
assert.equal(financial.rooms.room.items.group, undefined, 'parent money must not be stored');
assert.equal(financial.rooms.room.items.carcass.rates.standard, 210000);
const reloaded = combineProject(technical, financial);
assert.equal(compositeTotal(reloaded.rooms[0].items[0], reloaded.rooms[0], 'standard'), 370000);

const rulesText = readFileSync('database.rules.json', 'utf8');
const rules = JSON.parse(rulesText);
for (const path of [
  rules.rules.projectsTechnical.$projectId.rooms.$roomId.items.$itemId,
  rules.rules.projectsTechnical.$projectId.revisionHistory.$revisionId.snapshot.rooms.$roomId.items.$itemId,
]) {
  assert.ok(path.itemType && path.parentItemId && path.childrenOrder);
  assert.equal(path.$other['.validate'], false);
  assert.match(path['.validate'], /parentItemId/);
  assert.match(path['.validate'], /composite/);
}
assert.equal(rules.rules.projectsFinancial['.read'].includes("role').val() === 'admin'"), true);
assert.equal(rules.rules.projectsFinancial['.write'].includes("role').val() === 'admin'"), true);

console.log('PASS: composite totals, hierarchy normalization, deletion, ordering and Firebase split');
