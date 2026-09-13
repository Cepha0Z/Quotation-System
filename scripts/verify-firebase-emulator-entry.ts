import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, get, ref, set, update, runTransaction } from 'firebase/database';
import { saveProjects, saveRates, combineProject, loadProjectAssignments, setProjectAssignment, subscribeWorkspace } from '../storage/firebaseWorkspace';
import type { Project } from '../domain/types';
import type { WorkspaceUser } from '../domain/auth';
import { repairProjectFinancials } from '../storage/firebaseWorkspace';
import { financialTemplates } from '../domain/financialInitialization';
import { createDefaultFees } from '../domain/projectDefaults';
import { rateCard, firmSettings } from '../domain/sample';
import { createProjectExcelFile } from '../domain/excelExport';
import * as X from 'xlsx-js-style';
import { itemBaseRate, itemTotal } from '../domain/pricing';

async function main() {
  const namespace = `demo-boq-${Date.now()}`;
  const endpoint = `http://127.0.0.1:9000`;
  const admin: WorkspaceUser = { uid: 'admin', email: 'admin@example.test', displayName: 'Admin', role: 'admin' };
  const employee: WorkspaceUser = { uid: 'employee', email: 'employee@example.test', displayName: 'Employee', role: 'employee' };
  const outsider: WorkspaceUser = { ...employee, uid: 'outsider' };
  const apps = [admin, employee, outsider, employee, admin].map((user, index) => {
    const app = initializeApp({ projectId: namespace, databaseURL: `${endpoint}?ns=${namespace}` }, `test-${index}`);
    const database = getDatabase(app);
    connectDatabaseEmulator(database, '127.0.0.1', 9000, { mockUserToken: { sub: user.uid } });
    return { app, database };
  });
  const selectClient = (index: number) => {
    (globalThis as typeof globalThis & { __boqTestServices: (typeof apps)[number] }).__boqTestServices = apps[index];
    return apps[index].database;
  };
  const rest = async (path: string, body: unknown) => {
    const response = await fetch(`${endpoint}/${path}.json?ns=${namespace}`, {
      method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(response.ok, true, await response.text());
  };
  const project: Project = {
    id: 'project', propertyName: 'Test Villa', clientName: 'Test', layout: '', carpetArea: 100,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', defaultTier: 'standard', status: 'active',
    floors: [{ id: 'floor', name: 'Ground Floor' }],
    rooms: [{ id: 'room', name: 'Living Room', floorId: 'floor', items: [{
      id: 'item', name: 'Cabinet', description: 'Original', measurementType: 'sqft', quantity: 1,
      length: 8, width: 4, height: 0, notes: '', workType: 'Millwork', unit: 'Sq.ft',
      measureMode: 'dimensions', dimensionUnit: 'ft', hsnCode: '9403', enabled: true,
      rates: { standard: 100, premium: 200, luxury: 300 }, discount: 10, subUnits: [],
    }] }], fees: [], projectDiscount: 0, showRates: true,
  };
  let stop = () => {};
  let stopAdmin = () => {};
  let stopRateClient = () => {};
  try {
    await rest('.settings/rules', JSON.parse(readFileSync('database.rules.json', 'utf8')));
    await rest('users', Object.fromEntries([admin, employee, outsider].map(({ uid, ...profile }) => [uid, profile])));
    const bossDb = selectClient(0);
    // Reproduce the production shape: persisted money with no technical
    // sibling. The saved value must load, then the next edit repairs both
    // paths atomically and reaches a second subscribed admin client.
    const bundledWardrobe = rateCard.find((row) => row.id === 'template-wardrobe')!;
    await set(ref(bossDb, `rateCardFinancial/${bundledWardrobe.id}`), {
      rates: { ...bundledWardrobe.rates, standard: 1450 },
    });
    const orphanedRates = financialTemplates(
      (await get(ref(bossDb, 'rateCardTechnical'))).val() ?? {},
      (await get(ref(bossDb, 'rateCardFinancial'))).val() ?? {},
    );
    assert.equal(orphanedRates.find((row) => row.id === bundledWardrobe.id)!.rates.standard, 1450);
    const at1000 = orphanedRates.map((row) => row.id === bundledWardrobe.id
      ? { ...row, rates: { ...row.rates, standard: 1000 } } : row);
    await saveRates(orphanedRates, at1000);
    assert.equal((await get(ref(bossDb, `rateCardFinancial/${bundledWardrobe.id}/rates/standard`))).val(), 1000);
    assert.equal((await get(ref(bossDb, `rateCardTechnical/${bundledWardrobe.id}/id`))).val(), bundledWardrobe.id);
    const secondAdminDb = selectClient(4);
    const reloadedRates = financialTemplates(
      (await get(ref(secondAdminDb, 'rateCardTechnical'))).val() ?? {},
      (await get(ref(secondAdminDb, 'rateCardFinancial'))).val() ?? {},
    );
    assert.equal(reloadedRates.find((row) => row.id === bundledWardrobe.id)!.rates.standard, 1000);
    let secondClientRate = 0;
    stopRateClient = subscribeWorkspace(admin, (snapshot) => {
      secondClientRate = snapshot.rates.find((row) => row.id === bundledWardrobe.id)?.rates.standard ?? 0;
    }, () => {});
    const waitFor = async (check: () => boolean) => {
      for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(check(), 'subscription did not converge');
    };
    await waitFor(() => secondClientRate === 1000);
    selectClient(0);
    const at900 = at1000.map((row) => row.id === bundledWardrobe.id
      ? { ...row, rates: { ...row.rates, standard: 900 } } : row);
    await saveRates(at1000, at900);
    await waitFor(() => secondClientRate === 900);
    assert.equal((await get(ref(secondAdminDb, `rateCardFinancial/${bundledWardrobe.id}/rates/standard`))).val(), 900);
    console.log('PASS: orphaned bundled rate recovered, atomic paired save persisted, reload and second client show current master rate');
    stopRateClient();
    stopRateClient = () => {};
    selectClient(0);
    await saveRates(at900, at900.filter((row) => row.id !== bundledWardrobe.id));
    await saveProjects(admin, [], [project]);
    const financialBefore = (await get(ref(bossDb, 'projectsFinancial/project'))).val();
    const empDb = selectClient(1);
    await assert.rejects(get(ref(empDb, 'projectsTechnical/project')));
    await assert.rejects(get(ref(empDb, 'projectsFinancial')));
    await assert.rejects(runTransaction(ref(empDb, 'projectsTechnical/old-create'), () => ({ id: 'old-create', createdBy: employee.uid })));
    console.log('PASS: reproduced old employee transaction creation denial; unassigned access denied');
    let visible: Project[] = [];
    stop = subscribeWorkspace(employee, (snapshot) => { visible = snapshot.projects; }, () => {});
    selectClient(0);
    assert.equal((await loadProjectAssignments(admin, project.id)).find((row) => row.uid === employee.uid)?.assigned, false);
    await setProjectAssignment(admin, project.id, employee.uid, true);
    await waitFor(() => visible.some((p) => p.id === project.id));
    selectClient(1);
    const before = visible.find((p) => p.id === project.id)!;
    const edited = structuredClone(before);
    edited.propertyName = 'Employee changed name';
    edited.floors![0].name = 'Level One';
    Object.assign(edited.rooms[0].items[0], { description: 'Full technical edit', quantity: 4, length: 12, width: 6, notes: 'Note', hsnCode: '1234' });
    await saveProjects(employee, [before], [edited]);
    assert.equal((await get(ref(bossDb, 'projectsTechnical/project/rooms/room/items/item/quantity'))).val(), 4);
    assert.deepEqual((await get(ref(bossDb, 'projectsFinancial/project'))).val(), financialBefore);
    const expanded = structuredClone(edited);
    expanded.floors!.push({ id: 'second-floor', name: 'Second Floor' });
    expanded.rooms.push({ id: 'second-room', name: 'Living Room', floorId: 'second-floor', items: [
      { ...expanded.rooms[0].items[0], id: 'second-item', unit: 'Nos', quantity: 3, measureMode: 'quantity' },
    ] });
    await saveProjects(employee, [edited], [expanded]);
    assert.equal((await get(ref(bossDb, 'projectsTechnical/project/rooms/second-room/floorId'))).val(), 'second-floor');
    await saveProjects(employee, [expanded], [edited]);
    assert.equal((await get(ref(bossDb, 'projectsTechnical/project/rooms/second-room'))).exists(), false);
    // Independent SDK client, with no prior project cache.
    const secondDb = selectClient(3);
    const secondView = combineProject((await get(ref(secondDb, 'projectsTechnical/project'))).val());
    assert.equal(secondView.propertyName, edited.propertyName);
    await saveProjects(employee, [secondView], [{ ...secondView, notes: 'Second device' }]);
    selectClient(1);
    const own = { ...project, id: 'employee-project' };
    await saveProjects(employee, [], [own]);
    await waitFor(() => visible.some((p) => p.id === own.id));
    assert.equal((await get(ref(bossDb, `projectsFinancial/${own.id}`))).exists(), false);
    console.log('PASS: admin assignment, realtime discovery, employee create/edit, second-client save, finances unchanged');
    for (const path of ['projectsFinancial/project', 'rateCardFinancial', 'firmSettings', 'revisions']) {
      await assert.rejects(get(ref(empDb, path)));
      await assert.rejects(set(ref(empDb, path), { amount: 1 }));
    }
    for (const field of ['rates', 'rateOverride', 'discount', 'amount', 'fee', 'gst', 'pricingMode'])
      await assert.rejects(set(ref(empDb, `projectsTechnical/project/rooms/room/items/item/${field}`), 1));
    await assert.rejects(set(ref(empDb, 'users/employee/role'), 'admin'));
    await assert.rejects(get(ref(empDb, 'users')));
    await assert.rejects(set(ref(empDb, 'projectsTechnical/project/createdBy'), employee.uid));
    await assert.rejects(set(ref(empDb, 'projectsTechnical/project'), null));
    const outsiderDb = selectClient(2);
    await assert.rejects(set(ref(outsiderDb, 'userProjects/outsider/project'), true));
    await assert.rejects(set(ref(outsiderDb, 'projectMembers/project/outsider'), true));
    await assert.rejects(update(ref(outsiderDb, 'projectsTechnical/project'), { notes: 'Unauthorized' }));
    selectClient(0);
    // Legacy member-only grants must be repairable into discoverable assignments.
    await set(ref(bossDb, 'projectMembers/project/outsider'), true);
    const legacy = (await loadProjectAssignments(admin, 'project')).find((row) => row.uid === outsider.uid)!;
    assert.equal(legacy.needsRepair, true);
    await setProjectAssignment(admin, 'project', outsider.uid, legacy.assigned);
    assert.equal((await get(ref(outsiderDb, 'userProjects/outsider/project'))).val(), true);
    await setProjectAssignment(admin, 'project', outsider.uid, false);
    await setProjectAssignment(admin, 'project', employee.uid, false);
    await waitFor(() => !visible.some((p) => p.id === 'project'));
    await assert.rejects(update(ref(empDb, 'projectsTechnical/project'), { notes: 'Revoked' }));
    await setProjectAssignment(admin, own.id, employee.uid, false);
    await assert.rejects(set(ref(empDb, `userProjects/employee/${own.id}`), true));
    console.log('PASS: financial read/write denial, technical financial injection denial, escalation denial, revocation and self-regrant denial');
    await update(ref(bossDb, 'projectsFinancial/project'), { projectDiscount: 20 });
    console.log('PASS: admin financial access retained; rules accepted by Firebase emulator');

    const repair = async (id: string) => {
      selectClient(0);
      const templates = financialTemplates(
        (await get(ref(bossDb, 'rateCardTechnical'))).val() ?? {},
        (await get(ref(bossDb, 'rateCardFinancial'))).val() ?? {},
      );
      await repairProjectFinancials(admin, id, templates);
    };
    await repair(own.id);
    assert.equal((await get(ref(bossDb, `projectsFinancial/${own.id}/fees/design/name`))).val(), 'Design Fee');
    const wardrobe = { ...rateCard.find((row) => row.name === 'Wardrobe')!, id: 'office-wardrobe',
      rates: { standard: 1777, premium: 2222, luxury: 3333 } };
    await set(ref(bossDb, `rateCardTechnical/${wardrobe.id}`), {
      id: wardrobe.id, name: wardrobe.name, description: wardrobe.description, unit: wardrobe.unit,
    });
    await set(ref(bossDb, `rateCardFinancial/${wardrobe.id}`), { rates: wardrobe.rates });
    const pricedTemplates = [wardrobe, ...rateCard.filter((row) => row.name !== 'Wardrobe')];
    const templateProject: Project = { ...project, id: 'admin-template-project', fees: createDefaultFees(),
      rooms: [{ ...project.rooms[0], items: pricedTemplates.map((template, index) => ({
        ...project.rooms[0].items[0], id: `priced-${index}`, rateCardId: template.id,
        name: template.name, measurementType: template.unit, rates: template.rates, discount: 0,
        rateSource: 'template',
      })) }],
    };
    selectClient(0);
    await saveProjects(admin, [], [templateProject]);
    const bossOriginal = (await get(ref(bossDb, `projectsFinancial/${templateProject.id}`))).val();
    await repair(templateProject.id);
    assert.deepEqual((await get(ref(bossDb, `projectsFinancial/${templateProject.id}`))).val(), bossOriginal);
    selectClient(1);
    const employeeProject = { ...templateProject, id: 'employee-template-project' };
    await saveProjects(employee, [], [employeeProject]);
    await assert.rejects(get(ref(empDb, `projectsFinancial/${employeeProject.id}`)));
    await repair(employeeProject.id);
    const employeeMoney = (await get(ref(bossDb, `projectsFinancial/${employeeProject.id}`))).val();
    for (const [index, template] of pricedTemplates.entries())
      assert.deepEqual(employeeMoney.rooms.room.items[`priced-${index}`].rates, template.rates);
    assert.deepEqual(employeeMoney.fees, bossOriginal.fees);
    await assert.rejects(get(ref(empDb, `projectsFinancial/${employeeProject.id}`)));
    await assert.rejects(set(ref(empDb, `projectsFinancial/${employeeProject.id}/fees/design/value`), 1));
    const adminSecondDb = selectClient(4);
    const bossView = combineProject(
      (await get(ref(adminSecondDb, `projectsTechnical/${employeeProject.id}`))).val(),
      (await get(ref(adminSecondDb, `projectsFinancial/${employeeProject.id}`))).val(),
    );
    assert.equal(bossView.rooms[0].items[0].rates.standard, 1777);
    const bossEdited = structuredClone(bossView);
    bossEdited.fees[0].value = 87;
    bossEdited.rooms[0].items[0].rateOverride = 999;
    bossEdited.rooms[0].items[1].rates = { standard: 0, premium: 0, luxury: 0 };
    bossEdited.rooms[0].items[1].rateSource = 'project';
    await saveProjects(admin, [bossView], [bossEdited]);
    await update(ref(bossDb, `rateCardFinancial/${wardrobe.id}/rates`), { standard: 8888 });
    await repair(employeeProject.id);
    let protectedMoney = (await get(ref(bossDb, `projectsFinancial/${employeeProject.id}`))).val();
    assert.equal(protectedMoney.fees.design.value, 87);
    assert.equal(protectedMoney.rooms.room.items['priced-0'].rateOverride, 999);
    assert.equal(protectedMoney.rooms.room.items['priced-0'].rates.standard, 1777);
    assert.equal(protectedMoney.rooms.room.items['priced-1'].rates.standard, 0);
    // An intentionally emptied fee list must not be re-created on future edits.
    await saveProjects(admin, [bossEdited], [{ ...bossEdited, fees: [] }]);
    await repair(employeeProject.id);
    protectedMoney = (await get(ref(bossDb, `projectsFinancial/${employeeProject.id}`))).val();
    assert.equal(protectedMoney.fees, undefined);
    // Employee adds a legacy random-ID template item and moves a priced item.
    selectClient(1);
    const technicalBefore = combineProject((await get(ref(empDb, `projectsTechnical/${employeeProject.id}`))).val());
    const technicalAfter = structuredClone(technicalBefore);
    technicalAfter.rooms[0].items.push({ ...technicalBefore.rooms[0].items[0], id: 'legacy-item', rateCardId: 'old-browser-random-id' });
    const moved = technicalAfter.rooms[0].items.shift()!;
    technicalAfter.rooms.push({ id: 'moved-room', name: 'Another Room', floorId: 'floor', items: [moved] });
    await saveProjects(employee, [technicalBefore], [technicalAfter]);
    await repair(employeeProject.id);
    protectedMoney = (await get(ref(bossDb, `projectsFinancial/${employeeProject.id}`))).val();
    assert.equal(protectedMoney.rooms.room.items['legacy-item'].rates.standard, 8888);
    assert.equal(protectedMoney.rooms['moved-room'].items['priced-0'].rateOverride, 999);
    const once = JSON.stringify(protectedMoney);
    await repair(employeeProject.id);
    assert.equal(JSON.stringify((await get(ref(bossDb, `projectsFinancial/${employeeProject.id}`))).val()), once);
    // Exercise the real admin subscription: automatic repair, current master
    // rates and exporter/preview calculation inputs, without a backend.
    selectClient(1);
    const automaticProject = { ...templateProject, id: 'auto-repair-project' };
    await saveProjects(employee, [], [automaticProject]);
    selectClient(0);
    await repair(automaticProject.id);
    // Reproduce a pre-marker item with a copied 1450 rate and a legacy ID.
    await update(ref(bossDb), {
      [`projectsFinancial/${automaticProject.id}/rooms/room/items/priced-0/rateSource`]: null,
      [`projectsFinancial/${automaticProject.id}/rooms/room/items/priced-0/rates/standard`]: 1450,
      [`projectsTechnical/${automaticProject.id}/rooms/room/items/priced-0/rateCardId`]: 'old-browser-random-id',
      [`projectsFinancial/${templateProject.id}/rooms/room/items/priced-0/rateSource`]: 'project',
      [`rateCardFinancial/${wardrobe.id}/rates/standard`]: 1450,
    });
    let adminProjects: Project[] = [];
    const syncErrors: string[] = [];
    stopAdmin = subscribeWorkspace(admin, (snapshot) => { adminProjects = snapshot.projects; }, (error) => syncErrors.push(error));
    await waitFor(() => adminProjects.some((row) => row.id === automaticProject.id && row.fees.length === 3));
    const adminItem = () => adminProjects.find((row) => row.id === templateProject.id)!.rooms[0].items[0];
    const employeeItem = () => adminProjects.find((row) => row.id === automaticProject.id)!.rooms[0].items[0];
    assert.equal(itemBaseRate(adminItem(), 'standard'), 1450);
    assert.equal(itemBaseRate(employeeItem(), 'standard'), 1450);
    await update(ref(bossDb, `rateCardFinancial/${wardrobe.id}/rates`), { standard: 1000 });
    await waitFor(() => itemBaseRate(adminItem(), 'standard') === 1000 && itemBaseRate(employeeItem(), 'standard') === 1000);
    assert.equal(itemTotal(employeeItem(), 'standard'), 32000);
    assert.equal((await get(ref(bossDb, `projectsFinancial/${automaticProject.id}/rooms/room/items/priced-0/rates/standard`))).val(), 1450);
    const verifyExport = async (expectedRate: number, expectedAmount: number) => {
      const output = await createProjectExcelFile(adminProjects.find((row) => row.id === automaticProject.id)!, firmSettings);
      const workbook = X.read(output.bytes, { type: 'array' });
      const rows = X.utils.sheet_to_json<unknown[]>(workbook.Sheets.Millwork, { header: 1 });
      const wardrobeRow = rows.find((row) => String(row[1]).startsWith('Wardrobe'))!;
      assert.equal(wardrobeRow[5], expectedRate);
      assert.equal(wardrobeRow[6], expectedAmount);
    };
    await verifyExport(1000, 32000);
    const beforeOverride = adminProjects.find((row) => row.id === automaticProject.id)!;
    const afterOverride = structuredClone(beforeOverride);
    afterOverride.rooms[0].items[0].rateOverride = 1350;
    afterOverride.fees[0].value = 99;
    await saveProjects(admin, [beforeOverride], [afterOverride]);
    await waitFor(() => itemBaseRate(employeeItem(), 'standard') === 1350);
    await update(ref(bossDb, `rateCardFinancial/${wardrobe.id}/rates`), { standard: 900 });
    await waitFor(() => itemBaseRate(adminItem(), 'standard') === 900 && itemBaseRate(employeeItem(), 'standard') === 1350);
    assert.equal(itemTotal(employeeItem(), 'standard'), 43200);
    await verifyExport(1350, 43200);
    // Persist the exact patch used by the editor's Use master rate button.
    const beforeReset = adminProjects.find((row) => row.id === automaticProject.id)!;
    const reset = structuredClone(beforeReset);
    Object.assign(reset.rooms[0].items[0], { rateSource: 'template', rateOverride: undefined });
    await saveProjects(admin, [beforeReset], [reset]);
    await waitFor(() => itemBaseRate(employeeItem(), 'standard') === 900);
    await verifyExport(900, 28800);
    assert.equal((await get(ref(bossDb, `projectsFinancial/${automaticProject.id}/rooms/room/items/priced-0/rateOverride`))).exists(), false);
    const beforeZero = adminProjects.find((row) => row.id === automaticProject.id)!;
    const zero = structuredClone(beforeZero);
    zero.rooms[0].items[0].rateOverride = 0;
    await saveProjects(admin, [beforeZero], [zero]);
    await update(ref(bossDb, `rateCardFinancial/${wardrobe.id}/rates`), { standard: 800 });
    await waitFor(() => itemBaseRate(adminItem(), 'standard') === 800 && itemBaseRate(employeeItem(), 'standard') === 0);
    await verifyExport(0, 0);
    assert.equal(adminProjects.find((row) => row.id === automaticProject.id)!.fees[0].value, 99);
    assert.equal((await get(ref(adminSecondDb, `projectsFinancial/${automaticProject.id}/fees/design/value`))).val(), 99);
    await assert.rejects(get(ref(empDb, `projectsFinancial/${automaticProject.id}`)));
    assert.deepEqual(syncErrors, []);
    console.log('PASS: frontend-only automatic repair, realtime master-rate changes, fixed item overrides, fees and export calculation inputs');
    console.log('PASS: both fresh projects, all templates, cloud rate precedence, fees, cross-client admin edits, legacy repair, moves, zero/override preservation, idempotence and employee financial denial');
  } finally {
    stop();
    stopAdmin();
    stopRateClient();
    await Promise.all(apps.map(({ app }) => deleteApp(app)));
  }
}
void main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
