import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import {
  get,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from 'firebase/database';
import { normalizeProject } from '@/domain/boq';
import {
  financialTemplates,
  initializeMissingFinancials,
  resolveTemplate,
} from '@/domain/financialInitialization';
import type { WorkspaceUser, UserRole } from '@/domain/auth';
import type {
  FirmSettings,
  Project,
  QuoteItem,
  RateCardItem,
  Revision,
  Room,
} from '@/domain/types';
import { isCompositeItem } from '@/domain/composites';
import { getFirebaseServices } from '@/lib/firebase';
import { indexedDbStorage } from './db';

type JsonRecord = Record<string, any>;

export interface LocalMigrationData {
  projects: Project[];
  rates: RateCardItem[];
  settings?: FirmSettings;
  revisions: Revision[];
}

export interface WorkspaceSnapshot {
  projects: Project[];
  rates: RateCardItem[];
  settings?: FirmSettings;
  revisions: Revision[];
}

const zeroRates = { standard: 0, premium: 0, luxury: 0 } as const;
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const keyed = <T extends { id: string }>(values: T[]) =>
  Object.fromEntries(values.map((value) => [value.id, clean(value)]));
const ordered = <T>(
  map: Record<string, T> | undefined,
  order: string[] = [],
) => {
  const source = map ?? {};
  const ids = [
    ...order,
    ...Object.keys(source).filter((id) => !order.includes(id)),
  ];
  return ids.map((id) => source[id]).filter(Boolean);
};

export function itemTechnical(item: QuoteItem) {
  const {
    enabled: _enabled,
    rateSource: _rateSource,
    rates: _rates,
    tierOverride: _tierOverride,
    rateOverride: _rateOverride,
    discount: _discount,
    pricingMode: _pricingMode,
    subUnits: _subUnits,
    ...technical
  } = item;
  return clean(technical);
}

export function itemFinancial(item: QuoteItem) {
  return clean({
    enabled: item.enabled,
    rateSource: item.rateSource,
    rates: item.rates,
    tierOverride: item.tierOverride,
    rateOverride: item.rateOverride,
    discount: item.discount,
    pricingMode: item.pricingMode,
    subUnits: item.subUnits,
  });
}

export function projectTechnical(project: Project, ownerId?: string) {
  const {
    defaultTier: _defaultTier,
    fees: _fees,
    projectDiscount: _projectDiscount,
    showRates: _showRates,
    floors = [],
    rooms,
    ...technical
  } = normalizeProject(project);
  return clean({
    ...technical,
    createdBy: ownerId,
    floorOrder: floors.map((floor) => floor.id),
    floors: keyed(floors),
    roomOrder: rooms.map((room) => room.id),
    rooms: Object.fromEntries(
      rooms.map((room) => [
        room.id,
        {
          id: room.id,
          name: room.name,
          floorId: room.floorId,
          itemOrder: room.items.map((item) => item.id),
          items: Object.fromEntries(
            room.items.map((item) => [item.id, itemTechnical(item)]),
          ),
        },
      ]),
    ),
  });
}

export function projectFinancial(project: Project) {
  return clean({
    feesInitialized: true,
    defaultTier: project.defaultTier,
    projectDiscount: project.projectDiscount,
    showRates: project.showRates,
    feeOrder: project.fees.map((fee) => fee.id),
    fees: keyed(project.fees),
    rooms: Object.fromEntries(
      project.rooms.map((room) => [
        room.id,
        {
          items: Object.fromEntries(
            room.items
              .filter((item) => !isCompositeItem(item))
              .map((item) => [item.id, itemFinancial(item)]),
          ),
        },
      ]),
    ),
  });
}

function revisionTechnical(revision: Revision, user?: WorkspaceUser) {
  return clean({
    id: revision.id,
    projectId: revision.projectId,
    number: revision.number,
    createdAt: revision.createdAt,
    createdBy: revision.createdBy ?? user?.uid,
    authorName: revision.authorName ?? user?.displayName,
    note: revision.note,
    snapshot: projectTechnical(revision.snapshot),
  });
}

function combineTechnicalRevision(revision: JsonRecord): Revision {
  return {
    id: revision.id,
    projectId: revision.projectId,
    number: revision.number,
    createdAt: revision.createdAt,
    createdBy: revision.createdBy,
    authorName: revision.authorName,
    note: revision.note ?? '',
    total: 0,
    technicalOnly: true,
    snapshot: combineProject(revision.snapshot),
  };
}

export function combineProject(
  technical: JsonRecord,
  financial?: JsonRecord,
  templates: RateCardItem[] = [],
): Project {
  const floors = ordered(technical.floors, technical.floorOrder);
  const rooms = ordered<JsonRecord>(technical.rooms, technical.roomOrder).map(
    (room): Room => ({
      id: room.id,
      name: room.name,
      floorId: room.floorId,
      items: ordered<JsonRecord>(room.items, room.itemOrder).map((item) => {
        const money = financial?.rooms?.[room.id]?.items?.[item.id] ?? {};
        // The template reference is the link, including on legacy items that
        // predate rateSource. itemBaseRate gives explicit overrides precedence.
        const template = resolveTemplate(item as QuoteItem, templates);
        return {
          ...item,
          enabled: money.enabled ?? true,
          rateSource: money.rateSource,
          rates: template?.rates ?? money.rates ?? zeroRates,
          tierOverride: money.tierOverride,
          rateOverride: money.rateOverride,
          discount: money.discount ?? 0,
          pricingMode:
            money.pricingMode ??
            (item.measurementType === 'flat' ? 'lump-sum' : 'unit'),
          subUnits: money.subUnits ?? [],
        } as QuoteItem;
      }),
    }),
  );
  const project = {
    id: technical.id,
    clientName: technical.clientName ?? '',
    propertyName: technical.propertyName ?? '',
    layout: technical.layout ?? '',
    carpetArea: technical.carpetArea ?? 0,
    status: technical.status ?? 'active',
    createdAt: technical.createdAt ?? new Date(0).toISOString(),
    updatedAt: technical.updatedAt ?? new Date(0).toISOString(),
    propertyType: technical.propertyType ?? '',
    location: technical.location ?? '',
    notes: technical.notes ?? '',
    floors,
    rooms,
    defaultTier: financial?.defaultTier ?? 'standard',
    fees: ordered(financial?.fees, financial?.feeOrder),
    projectDiscount: financial?.projectDiscount ?? 0,
    showRates: financial?.showRates ?? false,
  } as Project;
  return normalizeProject(project);
}

function rateTechnical(rate: RateCardItem) {
  return clean({
    id: rate.id,
    name: rate.name,
    description: rate.description,
    unit: rate.unit,
  });
}

function rateFinancial(rate: RateCardItem) {
  return clean({ rates: rate.rates, subUnits: rate.subUnits });
}

function combineRate(
  technical: JsonRecord,
  financial?: JsonRecord,
): RateCardItem {
  return {
    id: technical.id,
    name: technical.name,
    description: technical.description ?? '',
    unit: technical.unit ?? 'quantity',
    rates: financial?.rates ?? zeroRates,
    subUnits: financial?.subUnits ?? [],
  };
}

function diff(base: any, next: any): any {
  if (Object.is(base, next)) return undefined;
  if (
    base === null ||
    next === null ||
    typeof base !== 'object' ||
    typeof next !== 'object' ||
    Array.isArray(base) ||
    Array.isArray(next)
  )
    return clean(next);
  const patch: JsonRecord = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (!(key in next)) patch[key] = null;
    else {
      const child = diff(base[key], next[key]);
      if (child !== undefined) patch[key] = child;
    }
  }
  return Object.keys(patch).length ? patch : undefined;
}

function applyPatch(current: any, patch: any): any {
  if (patch === undefined) return current;
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch))
    return patch;
  const result = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = applyPatch(result[key], value);
  }
  return result;
}

export function mergeThreeWay(base: any, next: any, current: any) {
  return applyPatch(current, diff(base ?? {}, next));
}

async function transactionalMerge(path: string, base: any, next: any) {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  const patch = diff(base ?? {}, next);
  if (patch === undefined) return;
  await runTransaction(ref(services.database, path), (current) =>
    applyPatch(current ?? {}, patch),
  );
}

export async function saveProjects(
  user: WorkspaceUser,
  previous: Project[],
  next: Project[],
) {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  const old = new Map(previous.map((project) => [project.id, project]));
  const fresh = new Map(next.map((project) => [project.id, project]));
  for (const project of next) {
    const before = old.get(project.id);
    const beforeTechnical = before ? projectTechnical(before) : {};
    const nextTechnical = projectTechnical(
      project,
      before ? undefined : user.uid,
    );
    if (!before) {
      // Transactions require read permission, which a new employee project
      // deliberately does not have yet. Create the document and discovery
      // index atomically; the rules validate ownership in the resulting tree.
      const creation: JsonRecord = {
        [`projectsTechnical/${project.id}`]: nextTechnical,
        [`userProjects/${user.uid}/${project.id}`]: true,
      };
      if (user.role === 'admin')
        creation[`projectsFinancial/${project.id}`] = projectFinancial(project);
      await update(ref(services.database), creation);
      continue;
    }
    await transactionalMerge(
      `projectsTechnical/${project.id}`,
      beforeTechnical,
      nextTechnical,
    );
    if (user.role === 'admin')
      await transactionalMerge(
        `projectsFinancial/${project.id}`,
        before ? projectFinancial(before) : {},
        projectFinancial(project),
      );
  }
  if (user.role === 'admin') {
    for (const project of previous) {
      if (fresh.has(project.id)) continue;
      await Promise.all([
        remove(ref(services.database, `projectsTechnical/${project.id}`)),
        remove(ref(services.database, `projectsFinancial/${project.id}`)),
        remove(ref(services.database, `projectMembers/${project.id}`)),
      ]);
    }
  }
}

export async function loadProjectAssignments(
  user: WorkspaceUser,
  projectId: string,
) {
  const services = getFirebaseServices();
  if (!services || user.role !== 'admin')
    throw new Error('Administrator access required');
  const [profiles, members] = await Promise.all([
    get(ref(services.database, 'users')),
    get(ref(services.database, `projectMembers/${projectId}`)),
  ]);
  const employees = Object.entries(profiles.val() ?? {})
    .filter(([, profile]) => (profile as WorkspaceUser).role === 'employee')
    .map(([uid, profile]) => ({ ...(profile as WorkspaceUser), uid }));
  return Promise.all(
    employees.map(async (employee) => {
      const indexed = await get(
        ref(services.database, `userProjects/${employee.uid}/${projectId}`),
      );
      const indexedAccess = indexed.val() === true;
      const memberAccess = members.child(employee.uid).val() === true;
      return {
        ...employee,
        assigned: indexedAccess || memberAccess,
        needsRepair: indexedAccess !== memberAccess,
      };
    }),
  );
}

export async function setProjectAssignment(
  user: WorkspaceUser,
  projectId: string,
  employeeId: string,
  assigned: boolean,
) {
  const services = getFirebaseServices();
  if (!services || user.role !== 'admin')
    throw new Error('Administrator access required');
  // Both the permission map and the employee's discovery index must agree.
  // Write only this member, so another admin's unrelated assignments survive.
  await update(ref(services.database), {
    [`projectMembers/${projectId}/${employeeId}`]: assigned ? true : null,
    [`userProjects/${employeeId}/${projectId}`]: assigned ? true : null,
  });
}

export function rateCardUpdates(
  previous: RateCardItem[],
  next: RateCardItem[],
) {
  const before = new Map(previous.map((rate) => [rate.id, rate]));
  const fresh = new Map(next.map((rate) => [rate.id, rate]));
  const changes: JsonRecord = {};
  // Both paths are one logical template. Writing them atomically also creates
  // the missing technical sibling when the displayed item came from defaults.
  for (const id of new Set([...before.keys(), ...fresh.keys()])) {
    const oldRate = before.get(id);
    const newRate = fresh.get(id);
    if (JSON.stringify(oldRate) === JSON.stringify(newRate)) continue;
    changes[`rateCardTechnical/${id}`] = newRate
      ? rateTechnical(newRate)
      : null;
    changes[`rateCardFinancial/${id}`] = newRate
      ? rateFinancial(newRate)
      : null;
  }
  return changes;
}

export async function saveRates(
  previous: RateCardItem[],
  next: RateCardItem[],
) {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  const changes = rateCardUpdates(previous, next);
  if (Object.keys(changes).length)
    await update(ref(services.database), changes);
}

export async function saveProjectItemPricing(
  user: WorkspaceUser,
  projectId: string,
  roomId: string,
  itemId: string,
  pricing: Pick<QuoteItem, 'pricingMode' | 'rateOverride' | 'rateSource'>,
) {
  const services = getFirebaseServices();
  if (!services || user.role !== 'admin')
    throw new Error('Administrator access required');
  await runTransaction(
    ref(
      services.database,
      `projectsFinancial/${projectId}/rooms/${roomId}/items/${itemId}`,
    ),
    (current) => {
      const next = { ...current };
      next.pricingMode = pricing.pricingMode ?? 'unit';
      next.rateSource = pricing.rateSource ?? 'project';
      if (pricing.rateOverride === undefined) delete next.rateOverride;
      else next.rateOverride = pricing.rateOverride;
      return next;
    },
    { applyLocally: false },
  );
}

// The existing admin client fills missing records on load. No backend or
// employee financial permissions are needed. Existing records always win.
export async function repairProjectFinancials(
  user: WorkspaceUser,
  projectId: string,
  templates: RateCardItem[],
) {
  const services = getFirebaseServices();
  if (!services || user.role !== 'admin')
    throw new Error('Administrator access required');
  const technical = await get(
    ref(services.database, `projectsTechnical/${projectId}`),
  );
  if (!technical.exists()) return;
  await runTransaction(
    ref(services.database, `projectsFinancial/${projectId}`),
    (current) => {
      const next = initializeMissingFinancials(
        technical.val(),
        current,
        templates,
      );
      return JSON.stringify(current) === JSON.stringify(next)
        ? undefined
        : next;
    },
    { applyLocally: false },
  );
}

export async function saveSettings(
  previous: FirmSettings | undefined,
  settings: FirmSettings,
) {
  await transactionalMerge('firmSettings', previous ?? {}, clean(settings));
}

export async function saveRevisions(
  user: WorkspaceUser,
  previous: Revision[],
  revisions: Revision[],
) {
  const services = getFirebaseServices();
  if (!services || user.role !== 'admin')
    throw new Error('Administrator access required');
  const before = new Map(previous.map((revision) => [revision.id, revision]));
  const next = new Map(revisions.map((revision) => [revision.id, revision]));
  const changes: JsonRecord = {};
  for (const revision of revisions) {
    if (JSON.stringify(before.get(revision.id)) === JSON.stringify(revision))
      continue;
    const full = clean({
      ...revision,
      createdBy: revision.createdBy ?? user.uid,
      authorName: revision.authorName ?? user.displayName,
    });
    changes[`revisions/${revision.id}`] = full;
    changes[
      `projectsTechnical/${revision.projectId}/revisionHistory/${revision.id}`
    ] = revisionTechnical(full, user);
  }
  for (const revision of previous) {
    if (next.has(revision.id)) continue;
    changes[`revisions/${revision.id}`] = null;
    changes[
      `projectsTechnical/${revision.projectId}/revisionHistory/${revision.id}`
    ] = null;
  }
  if (Object.keys(changes).length)
    await update(ref(services.database), changes);
}

export async function saveTechnicalRevisions(
  user: WorkspaceUser,
  previous: Revision[],
  revisions: Revision[],
) {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  const existing = new Set(previous.map((revision) => revision.id));
  for (const revision of revisions) {
    if (existing.has(revision.id)) continue;
    const value = revisionTechnical(revision, user);
    await runTransaction(
      ref(
        services.database,
        `projectsTechnical/${revision.projectId}/revisionHistory/${revision.id}`,
      ),
      (current) => current ?? value,
      { applyLocally: false },
    );
  }
  const remaining = new Set(revisions.map((revision) => revision.id));
  for (const revision of previous) {
    if (remaining.has(revision.id)) continue;
    if (revision.createdBy !== user.uid)
      throw new Error('You can only delete revisions that you created.');
    await remove(
      ref(
        services.database,
        `projectsTechnical/${revision.projectId}/revisionHistory/${revision.id}`,
      ),
    );
  }
}

async function publishLegacyTechnicalRevision(
  database: Database,
  user: WorkspaceUser,
  revision: Revision,
) {
  if (user.role !== 'admin') return;
  await runTransaction(
    ref(
      database,
      `projectsTechnical/${revision.projectId}/revisionHistory/${revision.id}`,
    ),
    (current) => current ?? revisionTechnical(revision, user),
    { applyLocally: false },
  );
}

export async function deleteProject(user: WorkspaceUser, projectId: string) {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  if (user.role !== 'admin')
    throw new Error('Only an administrator can delete projects');
  await Promise.all([
    remove(ref(services.database, `projectsTechnical/${projectId}`)),
    remove(ref(services.database, `projectsFinancial/${projectId}`)),
    remove(ref(services.database, `projectMembers/${projectId}`)),
  ]);
}

async function ensureProfile(firebaseUser: User): Promise<WorkspaceUser> {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  const profileRef = ref(services.database, `users/${firebaseUser.uid}`);
  const snapshot = await get(profileRef);
  if (!snapshot.exists()) {
    const profile = {
      email: firebaseUser.email ?? '',
      displayName:
        firebaseUser.displayName ??
        firebaseUser.email?.split('@')[0] ??
        'Employee',
      role: 'employee' as UserRole,
      createdAt: new Date().toISOString(),
    };
    await set(profileRef, profile);
    return { uid: firebaseUser.uid, ...profile };
  }
  const profile = snapshot.val();
  return {
    uid: firebaseUser.uid,
    email: profile.email ?? firebaseUser.email ?? '',
    displayName: profile.displayName ?? firebaseUser.email ?? 'Team member',
    role: profile.role === 'admin' ? 'admin' : 'employee',
  };
}

export function observeAuth(
  listener: (user: WorkspaceUser | null) => void,
  error: (message: string) => void,
) {
  const services = getFirebaseServices();
  if (!services) return () => {};
  void setPersistence(services.auth, browserLocalPersistence).catch(() => {});
  return onAuthStateChanged(
    services.auth,
    (firebaseUser) => {
      if (!firebaseUser) listener(null);
      else
        void ensureProfile(firebaseUser)
          .then(listener)
          .catch((cause) => error(cause.message));
    },
    (cause) => error(cause.message),
  );
}

export async function emailSignIn(email: string, password: string) {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  await signInWithEmailAndPassword(services.auth, email, password);
}

export async function emailSignUp(email: string, password: string) {
  const services = getFirebaseServices();
  if (!services) throw new Error('Firebase is not configured');
  const credential = await createUserWithEmailAndPassword(
    services.auth,
    email,
    password,
  );
  await ensureProfile(credential.user);
}

export async function workspaceSignOut() {
  const services = getFirebaseServices();
  if (services) await signOut(services.auth);
}

export function subscribeWorkspace(
  user: WorkspaceUser,
  listener: (snapshot: WorkspaceSnapshot) => void,
  error: (message: string) => void,
) {
  const services = getFirebaseServices();
  if (!services) return () => {};
  const state: WorkspaceSnapshot = { projects: [], rates: [], revisions: [] };
  const technical = new Map<string, JsonRecord>();
  const financial = new Map<string, JsonRecord>();
  const privateRevisions = new Map<string, Revision>();
  const projectUnsubscribers = new Map<string, Unsubscribe[]>();
  const employeePendingProjects = new Set<string>();
  let adminTechnicalReady = user.role !== 'admin';
  let adminFinancialReady = user.role !== 'admin';
  let adminRatesReady = user.role !== 'admin';
  let adminRevisionsReady = user.role !== 'admin';
  let active = true;
  const repairs = new Set<string>();
  // Legacy admin revisions predate the project-level shared history. Attempt
  // each backfill once per subscription, but never let one malformed/blocked
  // legacy record disable unrelated project saves for the current session.
  const legacyRevisionBackfills = new Set<string>();
  const emit = () => {
    if (
      !active ||
      !adminTechnicalReady ||
      !adminFinancialReady ||
      !adminRatesReady ||
      !adminRevisionsReady
    )
      return;
    if (employeePendingProjects.size) return;
    state.projects = [...technical.entries()]
      .map(([id, value]) => {
        const current = financial.get(id);
        if (user.role !== 'admin') return combineProject(value);
        const initialized = initializeMissingFinancials(
          value as Parameters<typeof initializeMissingFinancials>[0],
          current ?? null,
          state.rates,
        );
        if (
          JSON.stringify(initialized) !== JSON.stringify(current) &&
          !repairs.has(id)
        ) {
          repairs.add(id);
          void repairProjectFinancials(user, id, state.rates).then(
            () => {
              repairs.delete(id);
              // A technical item may have arrived while this repair was in flight.
              emit();
            },
            () => {
              repairs.delete(id);
              if (active)
                error(
                  'Could not initialize project pricing. Check your connection and admin permissions.',
                );
            },
          );
        }
        return combineProject(value, initialized, state.rates);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const sharedRevisions = [...technical.values()].flatMap((project) =>
      Object.values(
        (project.revisionHistory ?? {}) as Record<string, JsonRecord>,
      ).map(combineTechnicalRevision),
    );
    if (user.role === 'admin') {
      const sharedIds = new Set(sharedRevisions.map((revision) => revision.id));
      state.revisions = [
        ...sharedRevisions.map(
          (revision) => privateRevisions.get(revision.id) ?? revision,
        ),
        ...[...privateRevisions.values()].filter(
          (revision) => !sharedIds.has(revision.id),
        ),
      ];
      for (const revision of privateRevisions.values()) {
        if (sharedIds.has(revision.id) || !technical.has(revision.projectId))
          continue;
        const key = `${revision.projectId}:${revision.id}`;
        if (legacyRevisionBackfills.has(key)) continue;
        legacyRevisionBackfills.add(key);
        void publishLegacyTechnicalRevision(
          services.database,
          user,
          revision,
        ).then(
          () => undefined,
          (cause) => {
            // The private legacy record remains untouched and visible to the
            // admin. A later session can retry after rules/data are repaired.
            console.warn(
              `Could not backfill legacy revision at projectsTechnical/${revision.projectId}/revisionHistory/${revision.id}.`,
              cause,
            );
          },
        );
      }
    } else state.revisions = sharedRevisions;
    listener({
      ...state,
      projects: [...state.projects],
      rates: [...state.rates],
      revisions: [...state.revisions],
    });
  };
  const watchProject = (projectId: string) => {
    if (projectUnsubscribers.has(projectId)) return;
    const subscriptions = [
      onValue(
        ref(services.database, `projectsTechnical/${projectId}`),
        (snapshot) => {
          if (snapshot.exists()) technical.set(projectId, snapshot.val());
          else technical.delete(projectId);
          employeePendingProjects.delete(projectId);
          emit();
        },
        (cause) => {
          technical.delete(projectId);
          employeePendingProjects.delete(projectId);
          emit();
          error(cause.message);
        },
      ),
    ];
    if (user.role === 'admin')
      subscriptions.push(
        onValue(
          ref(services.database, `projectsFinancial/${projectId}`),
          (snapshot) => {
            if (snapshot.exists()) financial.set(projectId, snapshot.val());
            else financial.delete(projectId);
            emit();
          },
          (cause) => error(cause.message),
        ),
      );
    projectUnsubscribers.set(projectId, subscriptions);
  };
  const subscriptions: Unsubscribe[] = [];
  if (user.role === 'admin') {
    subscriptions.push(
      onValue(
        ref(services.database, 'projectsTechnical'),
        (snapshot) => {
          const all = (snapshot.val() ?? {}) as Record<string, JsonRecord>;
          technical.clear();
          Object.entries(all).forEach(([id, value]) =>
            technical.set(id, value),
          );
          adminTechnicalReady = true;
          emit();
        },
        (cause) => error(cause.message),
      ),
      onValue(
        ref(services.database, 'projectsFinancial'),
        (snapshot) => {
          const all = (snapshot.val() ?? {}) as Record<string, JsonRecord>;
          financial.clear();
          Object.entries(all).forEach(([id, value]) =>
            financial.set(id, value),
          );
          adminFinancialReady = true;
          emit();
        },
        (cause) => error(cause.message),
      ),
    );
  } else {
    subscriptions.push(
      onValue(
        ref(services.database, `userProjects/${user.uid}`),
        (snapshot) => {
          const ids = Object.keys(snapshot.val() ?? {});
          ids.forEach((id) => {
            if (!projectUnsubscribers.has(id)) employeePendingProjects.add(id);
            watchProject(id);
          });
          for (const [id, unsubs] of projectUnsubscribers) {
            if (ids.includes(id)) continue;
            unsubs.forEach((unsubscribe) => unsubscribe());
            projectUnsubscribers.delete(id);
            employeePendingProjects.delete(id);
            technical.delete(id);
            financial.delete(id);
          }
          emit();
        },
        (cause) => error(cause.message),
      ),
    );
  }
  if (user.role === 'employee')
    subscriptions.push(
      onValue(
        ref(services.database, 'rateCardTechnical'),
        (snapshot) => {
          const rates = Object.values(snapshot.val() ?? {}) as JsonRecord[];
          state.rates = rates.map((rate) => combineRate(rate));
          emit();
        },
        (cause) => error(cause.message),
      ),
    );
  if (user.role === 'admin') {
    let rateTech: Parameters<typeof financialTemplates>[0] = {};
    let rateMoney: Parameters<typeof financialTemplates>[1] = {};
    let rateTechReady = false;
    let rateMoneyReady = false;
    const emitRates = () => {
      if (!rateTechReady || !rateMoneyReady) return;
      state.rates = financialTemplates(rateTech, rateMoney);
      adminRatesReady = true;
      emit();
    };
    subscriptions.push(
      onValue(
        ref(services.database, 'rateCardTechnical'),
        (snapshot) => {
          rateTech = snapshot.val() ?? {};
          rateTechReady = true;
          emitRates();
        },
        (cause) => error(cause.message),
      ),
      onValue(
        ref(services.database, 'rateCardFinancial'),
        (snapshot) => {
          rateMoney = snapshot.val() ?? {};
          rateMoneyReady = true;
          emitRates();
        },
        (cause) => error(cause.message),
      ),
      onValue(
        ref(services.database, 'firmSettings'),
        (snapshot) => {
          state.settings = snapshot.val() ?? undefined;
          emit();
        },
        (cause) => error(cause.message),
      ),
      onValue(
        ref(services.database, 'revisions'),
        (snapshot) => {
          privateRevisions.clear();
          for (const revision of Object.values(
            snapshot.val() ?? {},
          ) as Revision[])
            privateRevisions.set(revision.id, revision);
          adminRevisionsReady = true;
          emit();
        },
        (cause) => error(cause.message),
      ),
    );
  }
  return () => {
    active = false;
    subscriptions.forEach((unsubscribe) => unsubscribe());
    projectUnsubscribers.forEach((unsubs) =>
      unsubs.forEach((unsubscribe) => unsubscribe()),
    );
  };
}

const legacyKeys = {
  projects: 'interix.projects.v1',
  rates: 'interix.rates.v1',
  settings: 'interix.settings.v1',
  revisions: 'interix.revisions.v1',
};

function legacyRead<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function loadLocalMigrationData(
  uid?: string,
): Promise<LocalMigrationData> {
  if (
    uid &&
    (await indexedDbStorage
      .get<boolean>(`firebase-migration:${uid}:completed`)
      .catch(() => false))
  )
    return { projects: [], rates: [], revisions: [] };
  const [projects, rates, settings, revisions] = await Promise.all([
    indexedDbStorage.get<Project[]>('projects').catch(() => undefined),
    indexedDbStorage.get<RateCardItem[]>('rates').catch(() => undefined),
    indexedDbStorage.get<FirmSettings>('settings').catch(() => undefined),
    indexedDbStorage.get<Revision[]>('revisions').catch(() => undefined),
  ]);
  return {
    projects: projects ?? legacyRead<Project[]>(legacyKeys.projects) ?? [],
    rates: rates ?? legacyRead<RateCardItem[]>(legacyKeys.rates) ?? [],
    settings: settings ?? legacyRead<FirmSettings>(legacyKeys.settings),
    revisions: revisions ?? legacyRead<Revision[]>(legacyKeys.revisions) ?? [],
  };
}

export async function migrateLocalWorkspace(
  user: WorkspaceUser,
  local: LocalMigrationData,
  current: WorkspaceSnapshot,
) {
  if (user.role !== 'admin')
    throw new Error('Only an administrator can import local financial data');
  const projectIds = new Set(current.projects.map((project) => project.id));
  const projects = local.projects.filter(
    (project) => !projectIds.has(project.id),
  );
  await saveProjects(user, current.projects, [
    ...current.projects,
    ...projects,
  ]);
  const rateIds = new Set(current.rates.map((rate) => rate.id));
  const rates = local.rates.filter((rate) => !rateIds.has(rate.id));
  if (rates.length)
    await saveRates(current.rates, [...current.rates, ...rates]);
  if (local.settings && !current.settings)
    await saveSettings(undefined, local.settings);
  const revisionIds = new Set(current.revisions.map((revision) => revision.id));
  const revisions = local.revisions.filter(
    (revision) => !revisionIds.has(revision.id),
  );
  if (revisions.length)
    await saveRevisions(user, current.revisions, [
      ...current.revisions,
      ...revisions,
    ]);
  const services = getFirebaseServices();
  if (services) {
    const access: Record<string, boolean> = {};
    projects.forEach((project) => {
      access[`userProjects/${user.uid}/${project.id}`] = true;
    });
    if (Object.keys(access).length)
      await update(ref(services.database), access);
  }
  await indexedDbStorage.set(`firebase-migration:${user.uid}:completed`, true);
  return projects.length;
}
