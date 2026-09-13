import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, get, ref, set, update, runTransaction } from 'firebase/database';
import { saveProjects, combineProject, loadProjectAssignments, setProjectAssignment, subscribeWorkspace } from '../storage/firebaseWorkspace';
import type { Project } from '../domain/types';
import type { WorkspaceUser } from '../domain/auth';

async function main() {
  const namespace = `demo-boq-${Date.now()}`;
  const endpoint = `http://127.0.0.1:9000`;
  const admin: WorkspaceUser = { uid: 'admin', email: 'admin@example.test', displayName: 'Admin', role: 'admin' };
  const employee: WorkspaceUser = { uid: 'employee', email: 'employee@example.test', displayName: 'Employee', role: 'employee' };
  const outsider: WorkspaceUser = { ...employee, uid: 'outsider' };
  const apps = [admin, employee, outsider, employee].map((user, index) => {
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
  try {
    await rest('.settings/rules', JSON.parse(readFileSync('database.rules.json', 'utf8')));
    await rest('users', Object.fromEntries([admin, employee, outsider].map(({ uid, ...profile }) => [uid, profile])));
    const bossDb = selectClient(0);
    await saveProjects(admin, [], [project]);
    const financialBefore = (await get(ref(bossDb, 'projectsFinancial/project'))).val();
    const empDb = selectClient(1);
    await assert.rejects(get(ref(empDb, 'projectsTechnical/project')));
    await assert.rejects(get(ref(empDb, 'projectsFinancial')));
    await assert.rejects(runTransaction(ref(empDb, 'projectsTechnical/old-create'), () => ({ id: 'old-create', createdBy: employee.uid })));
    console.log('PASS: reproduced old employee transaction creation denial; unassigned access denied');
    let visible: Project[] = [];
    stop = subscribeWorkspace(employee, (snapshot) => { visible = snapshot.projects; }, () => {});
    const waitFor = async (check: () => boolean) => {
      for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(check(), 'subscription did not converge');
    };
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
  } finally {
    stop();
    await Promise.all(apps.map(({ app }) => deleteApp(app)));
  }
}
void main().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
