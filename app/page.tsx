'use client';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import {
  BarChart3,
  ArrowRight,
  Building2,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  Check,
  Copy,
  Download,
  DoorOpen,
  FileClock,
  FileSpreadsheet,
  Gauge,
  GripVertical,
  Home as HomeIcon,
  Info,
  Layers,
  Lightbulb,
  Menu,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  WalletCards,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { firmSettings as ds, rateCard as dr } from '@/domain/sample';
import { createDefaultFees } from '@/domain/projectDefaults';
import { resolveTemplate } from '@/domain/financialInitialization';
import {
  createProjectExcelFile,
  excelBytesToBase64,
} from '@/domain/excelExport';
import {
  inr,
  compositeTotal,
  itemBaseRate,
  itemMeasure,
  itemSavings,
  itemTotal,
  quoteTotals,
  roomTotal,
} from '@/domain/pricing';
import {
  isCompositeItem,
  matchesHierarchySearch,
  moveCompositeChild,
  orderedCompositeChildren,
  orderedPriceableItems,
  removeItemTree,
} from '@/domain/composites';
import {
  BOQ_UNITS,
  FLOOR_SUGGESTIONS,
  SPACE_SUGGESTIONS,
  WORK_TYPES,
  measurementForUnit,
  normalizeProject,
  unitForMeasurement,
} from '@/domain/boq';
import type {
  FirmSettings,
  BoqUnit,
  FeeMethod,
  MeasurementType,
  Project,
  QuoteItem,
  RateCardItem,
  Revision,
  Room,
  Tier,
} from '@/domain/types';
import type { WorkspaceUser } from '@/domain/auth';
import { firebaseConfigured, missingFirebaseEnvironment } from '@/lib/firebase';
import {
  emailSignIn,
  emailSignUp,
  loadLocalMigrationData,
  loadProjectAssignments,
  setProjectAssignment,
  migrateLocalWorkspace,
  observeAuth,
  saveProjects,
  saveProjectItemPricing,
  saveRates,
  saveRevisions,
  saveTechnicalRevisions,
  combineProject,
  projectFinancial,
  projectTechnical,
  saveSettings,
  subscribeWorkspace,
  workspaceSignOut,
  type LocalMigrationData,
  type WorkspaceSnapshot,
} from '@/storage/firebaseWorkspace';
const uid = () => crypto.randomUUID(),
  tl = (t: Tier) => t[0].toUpperCase() + t.slice(1);

function normalizeFirmSettings(saved?: Partial<FirmSettings>): FirmSettings {
  const settings = { ...ds, ...saved };
  if (settings.firmName === 'INTERIX') settings.firmName = ds.firmName;
  if (settings.letterheadName === 'Interix Design Studio')
    settings.letterheadName = ds.letterheadName;
  if (settings.gstNumber === '29ABCDE1234F1Z5') settings.gstNumber = '';
  if (settings.address === 'Indiranagar, Bengaluru, Karnataka 560038')
    settings.address = '';
  if (settings.phone === '+91 98765 43210') settings.phone = '';
  if (settings.email === 'studio@interix.in') settings.email = ds.email;
  if (settings.thankYou === 'Thank you for trusting Interix with your home.')
    settings.thankYou = ds.thankYou;
  return settings;
}
const presets = [
  'Living Room',
  'Dining',
  'Kitchen',
  'Master Bedroom',
  'Bedroom 2',
  'Bedroom 3',
  'Kids Bedroom',
  'Guest Bedroom',
  'Balcony',
  'Pooja / Mandir',
  'Utility',
  'Other',
];
const itemImage = (name: string) => {
  const key = name.toLowerCase();
  if (key.includes('false ceiling')) return '/item-images/false-ceiling.png';
  if (key.includes('tv unit')) return '/item-images/tv-unit.png';
  if (key.includes('mandir') || key.includes('pooja'))
    return '/item-images/mandir.png';
  if (key.includes('base cabinet')) return '/item-images/base-cabinets.png';
  if (key.includes('wall cabinet')) return '/item-images/wall-cabinets.png';
  if (key.includes('tall unit')) return '/item-images/tall-unit.png';
  if (key.includes('wardrobe')) return '/item-images/wardrobe.png';
  if (key.includes('bed back')) return '/item-images/bed-back-panel.png';
  if (key.includes('study')) return '/item-images/study-unit.png';
  return '/item-images/custom-joinery.png';
};
type Store = {
  authReady: boolean;
  user: WorkspaceUser | null;
  canManageFinancials: boolean;
  hydrated: boolean;
  saveState: 'loading' | 'saving' | 'saved' | 'error';
  storageError: string | null;
  projects: Project[];
  setProjects: (v: Project[]) => void;
  saveProjectsNow: (v: Project[]) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  deleteRoom: (projectId: string, roomId: string) => Promise<void>;
  rates: RateCardItem[];
  setRates: (v: RateCardItem[]) => void;
  settings: FirmSettings;
  setSettings: (v: FirmSettings) => void;
  revisions: Revision[];
  setRevisions: (v: Revision[]) => Promise<void>;
  setItemPricing: (
    projectId: string,
    roomId: string,
    itemId: string,
    pricing: Pick<QuoteItem, 'pricingMode' | 'rateOverride' | 'rateSource'>,
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  localMigration: LocalMigrationData | null;
  migrateLocal: () => Promise<number>;
};
function useStore(): Store {
  const [user, setUser] = useState<WorkspaceUser | null>(null),
    [authReady, setAuthReady] = useState(false),
    [projects, sp] = useState<Project[]>([]),
    [rates, sr] = useState<RateCardItem[]>([]),
    [settings, ss] = useState(ds),
    [revisions, sv] = useState<Revision[]>([]),
    [ready, setReady] = useState(false),
    [saveState, setSaveState] = useState<Store['saveState']>('loading'),
    [storageError, setStorageError] = useState<string | null>(null),
    [localMigration, setLocalMigration] = useState<LocalMigrationData | null>(
      null,
    ),
    timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}),
    pendingWrites = useRef<Record<string, () => Promise<void>>>({}),
    activeWrites = useRef<Record<string, number>>({}),
    projectRef = useRef<Project[]>([]),
    rateRef = useRef<RateCardItem[]>([]),
    settingsRef = useRef<FirmSettings>(ds),
    revisionRef = useRef<Revision[]>([]),
    pendingRevisionMutation = useRef<{
      added: Set<string>;
      deleted: Set<string>;
    } | null>(null),
    snapshotRef = useRef<WorkspaceSnapshot>({
      projects: [],
      rates: [],
      revisions: [],
    });

  const flushWrite = async (key: string) => {
    const write = pendingWrites.current[key];
    if (!write) return;
    delete pendingWrites.current[key];
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    activeWrites.current[key] = (activeWrites.current[key] ?? 0) + 1;
    const finish = () => {
      activeWrites.current[key] -= 1;
      if (!activeWrites.current[key]) delete activeWrites.current[key];
    };
    try {
      await write();
      finish();
      if (
        !Object.keys(pendingWrites.current).length &&
        !Object.keys(activeWrites.current).length
      )
        setSaveState('saved');
    } catch (cause) {
      finish();
      setSaveState('error');
      setStorageError(
        `Firebase could not save these changes. ${cause instanceof Error ? cause.message : 'Check your connection or account permissions.'}`,
      );
    }
  };

  const queueWrite = (key: string, write: () => Promise<void>) => {
    pendingWrites.current[key] = write;
    clearTimeout(timers.current[key]);
    setSaveState('saving');
    timers.current[key] = setTimeout(() => void flushWrite(key), 180);
  };

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthReady(true);
      return;
    }
    return observeAuth(
      (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
        setReady(false);
        setStorageError(null);
      },
      (message) => {
        setStorageError(message);
        setAuthReady(true);
      },
    );
  }, []);

  useEffect(() => {
    if (!user) {
      sp([]);
      sr([]);
      sv([]);
      ss(ds);
      setReady(false);
      return;
    }
    let active = true;
    void loadLocalMigrationData(user.uid).then((local) => {
      if (
        active &&
        (local.projects.length || local.rates.length || local.revisions.length)
      )
        setLocalMigration(local);
    });
    const unsubscribe = subscribeWorkspace(
      user,
      (snapshot) => {
        if (!active) return;
        snapshotRef.current = snapshot;
        const normalized = snapshot.projects.map(normalizeProject);
        const mergedRates = snapshot.rates.length
          ? [
              ...snapshot.rates,
              ...dr
                .filter(
                  (template) =>
                    !snapshot.rates.some(
                      (saved) =>
                        saved.name.toLowerCase() ===
                        template.name.toLowerCase(),
                    ),
                )
                .map((template) =>
                  user.role === 'admin'
                    ? template
                    : {
                        ...template,
                        rates: { standard: 0, premium: 0, luxury: 0 },
                        subUnits: [],
                      },
                ),
            ]
          : user.role === 'admin'
            ? dr
            : dr.map((template) => ({
                ...template,
                rates: { standard: 0, premium: 0, luxury: 0 },
                subUnits: [],
              }));
        const rateWritePending = Boolean(
          pendingWrites.current.rates || activeWrites.current.rates,
        );
        projectRef.current = normalized;
        if (!rateWritePending) rateRef.current = mergedRates;
        settingsRef.current = normalizeFirmSettings(snapshot.settings);
        const revisionMutation = pendingRevisionMutation.current;
        const visibleRevisions = revisionMutation
          ? [
              ...snapshot.revisions.filter(
                (revision) => !revisionMutation.added.has(revision.id),
              ),
              ...revisionRef.current.filter(
                (revision) =>
                  revisionMutation.deleted.has(revision.id) &&
                  !snapshot.revisions.some((saved) => saved.id === revision.id),
              ),
            ]
          : snapshot.revisions;
        revisionRef.current = visibleRevisions;
        sp(normalized);
        if (!rateWritePending) sr(mergedRates);
        ss(settingsRef.current);
        sv(visibleRevisions);
        if (
          !Object.keys(pendingWrites.current).length &&
          !Object.keys(activeWrites.current).length &&
          !revisionMutation
        ) {
          setSaveState('saved');
          setStorageError(null);
        }
        setReady(true);
      },
      (message) => {
        if (!active) return;
        setSaveState('error');
        setStorageError(`Firebase synchronization failed: ${message}`);
        setReady(true);
      },
    );
    const flushPending = () => {
      if (document.visibilityState === 'hidden')
        Object.keys(pendingWrites.current).forEach(
          (key) => void flushWrite(key),
        );
    };
    document.addEventListener('visibilitychange', flushPending);
    window.addEventListener('pagehide', flushPending);
    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', flushPending);
      window.removeEventListener('pagehide', flushPending);
    };
  }, [user?.uid, user?.role]);

  const currentUser = user;
  return {
    authReady,
    user,
    canManageFinancials: user?.role === 'admin',
    hydrated: ready,
    saveState,
    storageError,
    projects,
    setProjects: (v) => {
      const previous = snapshotRef.current.projects;
      projectRef.current = v;
      sp(v);
      if (ready && currentUser)
        queueWrite('projects', () =>
          saveProjects(currentUser, previous, projectRef.current),
        );
    },
    saveProjectsNow: async (v) => {
      if (!ready || !currentUser) {
        projectRef.current = v;
        sp(v);
        return;
      }
      clearTimeout(timers.current.projects);
      delete timers.current.projects;
      delete pendingWrites.current.projects;
      const previous = structuredClone(snapshotRef.current.projects);
      const next = structuredClone(v);
      setSaveState('saving');
      setStorageError(null);
      try {
        await saveProjects(currentUser, previous, next);
        projectRef.current = next;
        sp(next);
        setSaveState('saved');
      } catch (cause) {
        setSaveState('error');
        setStorageError(
          `Firebase could not save these changes. ${cause instanceof Error ? cause.message : 'Check your connection or account permissions.'}`,
        );
        throw cause;
      }
    },
    deleteProject: async (projectId) => {
      if (!currentUser || currentUser.role !== 'admin') return;
      sp((current) => current.filter((project) => project.id !== projectId));
      if (!ready) return;
      setSaveState('saving');
      try {
        await flushWrite('projects');
        const before = projectRef.current;
        const after = before.filter((project) => project.id !== projectId);
        projectRef.current = after;
        await saveProjects(currentUser, before, after);
        setSaveState('saved');
      } catch {
        setSaveState('error');
        setStorageError('The project could not be deleted from Firebase.');
      }
    },
    deleteRoom: async (projectId, roomId) => {
      const before = projectRef.current;
      const after = before.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: new Date().toISOString(),
              rooms: project.rooms.filter((room) => room.id !== roomId),
            }
          : project,
      );
      projectRef.current = after;
      sp(after);
      if (!ready) return;
      setSaveState('saving');
      try {
        await flushWrite('projects');
        if (currentUser) await saveProjects(currentUser, before, after);
        setSaveState('saved');
      } catch {
        setSaveState('error');
        setStorageError('The room could not be deleted from Firebase.');
      }
    },
    rates,
    setRates: (v) => {
      if (!currentUser || currentUser.role !== 'admin') return;
      // Snapshot the displayed edit now so a later subscription callback
      // cannot change the debounced write's intended before/after values.
      const previous = structuredClone(rateRef.current);
      const next = structuredClone(v);
      rateRef.current = next;
      sr(next);
      if (ready) queueWrite('rates', () => saveRates(previous, next));
    },
    settings,
    setSettings: (v) => {
      if (!currentUser || currentUser.role !== 'admin') return;
      settingsRef.current = v;
      ss(v);
      if (ready)
        queueWrite('settings', () =>
          saveSettings(snapshotRef.current.settings, settingsRef.current),
        );
    },
    revisions,
    setRevisions: async (v) => {
      if (!currentUser) throw new Error('Sign in to manage revisions.');
      const previous = structuredClone(revisionRef.current);
      const next = structuredClone(v);
      if (!ready) throw new Error('Revision history is still loading.');
      if (pendingRevisionMutation.current)
        throw new Error('Another revision change is still saving.');
      const previousIds = new Set(previous.map((revision) => revision.id));
      const nextIds = new Set(next.map((revision) => revision.id));
      pendingRevisionMutation.current = {
        added: new Set(
          next
            .filter((revision) => !previousIds.has(revision.id))
            .map((revision) => revision.id),
        ),
        deleted: new Set(
          previous
            .filter((revision) => !nextIds.has(revision.id))
            .map((revision) => revision.id),
        ),
      };
      setSaveState('saving');
      setStorageError(null);
      try {
        if (currentUser.role === 'admin')
          await saveRevisions(currentUser, previous, next);
        else await saveTechnicalRevisions(currentUser, previous, next);
        pendingRevisionMutation.current = null;
        revisionRef.current = snapshotRef.current.revisions;
        sv(snapshotRef.current.revisions);
        setSaveState('saved');
      } catch (cause) {
        pendingRevisionMutation.current = null;
        setSaveState('error');
        setStorageError(
          `Firebase could not save these changes. ${cause instanceof Error ? cause.message : 'Check your connection or account permissions.'}`,
        );
        throw cause;
      }
    },
    setItemPricing: async (projectId, roomId, itemId, pricing) => {
      if (!currentUser || currentUser.role !== 'admin')
        throw new Error('Administrator access required.');
      activeWrites.current.projectRates =
        (activeWrites.current.projectRates ?? 0) + 1;
      setSaveState('saving');
      setStorageError(null);
      try {
        await saveProjectItemPricing(
          currentUser,
          projectId,
          roomId,
          itemId,
          pricing,
        );
        activeWrites.current.projectRates -= 1;
        if (!activeWrites.current.projectRates)
          delete activeWrites.current.projectRates;
        if (!Object.keys(activeWrites.current).length) setSaveState('saved');
      } catch (cause) {
        activeWrites.current.projectRates -= 1;
        if (!activeWrites.current.projectRates)
          delete activeWrites.current.projectRates;
        setSaveState('error');
        setStorageError(
          `Firebase could not save this rate. ${cause instanceof Error ? cause.message : 'Check your connection or account permissions.'}`,
        );
        throw cause;
      }
    },
    signIn: emailSignIn,
    signUp: emailSignUp,
    signOut: workspaceSignOut,
    localMigration,
    migrateLocal: async () => {
      if (!currentUser || !localMigration) return 0;
      setSaveState('saving');
      const count = await migrateLocalWorkspace(
        currentUser,
        localMigration,
        snapshotRef.current,
      );
      setLocalMigration(null);
      setSaveState('saved');
      return count;
    },
  };
}
const nav = [
  ['/dashboard', 'Dashboard', Gauge],
  ['/projects', 'Projects', BriefcaseBusiness],
  ['/rate-card', 'Rate Card', ClipboardList],
  ['/fees', 'Fee Structure', CircleDollarSign],
  ['/settings', 'Firm Settings', Settings],
] as const;
function Shell({ s }: { s: Store }) {
  const [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    go = useNavigate(),
    location = useLocation();
  const visibleNav = s.canManageFinancials ? nav : nav.slice(0, 2);
  return (
    <div className={'app-shell ' + (collapsed ? 'nav-collapsed' : '')}>
      <aside className={'sidebar ' + (open ? 'open' : '')}>
        <div className="brand">
          <b>ND</b>
          <span>
            <strong>NEBULOUS DESIGN</strong>
            <small>Quotation Studio</small>
          </span>
          <button
            className="nav-collapse"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button className="mobile-nav-close" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <nav>
          {visibleNav.map(([to, label, I]) => (
            <button
              key={to}
              className={location.pathname.startsWith(to) ? 'active' : ''}
              onClick={() => {
                go(to);
                setOpen(false);
              }}
            >
              <I />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="profile">
          <b>ND</b>
          <span>
            <strong>{s.user?.displayName || s.user?.email}</strong>
            <small>{s.canManageFinancials ? 'Boss / Admin' : 'Employee'}</small>
          </span>
          <button
            className="profile-signout"
            onClick={() => void s.signOut()}
            title="Sign out"
          >
            <DoorOpen />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="hamb" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          <div>
            <small>ESTIMATING WORKSPACE</small>
            <strong>Nebulous Design Workshop</strong>
          </div>
          <span className={`saved ${s.saveState}`}>
            ●{' '}
            {s.saveState === 'loading'
              ? 'Loading Firebase data'
              : s.saveState === 'saving'
                ? 'Saving…'
                : s.saveState === 'error'
                  ? 'Saving unavailable'
                  : 'Synced to Firebase'}
          </span>
        </header>
        {s.storageError && (
          <div className="storage-error" role="status">
            {s.storageError}
          </div>
        )}
        {s.canManageFinancials && s.localMigration && (
          <div className="migration-banner" role="status">
            <span>
              Local projects are still available on this device. Import them
              once into Firebase without deleting the originals.
            </span>
            <Button variant="outline" onClick={() => void s.migrateLocal()}>
              Import local data
            </Button>
          </div>
        )}
        <Routes>
          <Route path="/dashboard" element={<Dashboard s={s} />} />
          <Route path="/projects" element={<Projects s={s} />} />
          <Route path="/projects/:id" element={<Builder s={s} />} />
          <Route
            path="/projects/:id/rates"
            element={
              s.canManageFinancials ? (
                <ProjectRates s={s} />
              ) : (
                <Navigate to="/projects" />
              )
            }
          />
          <Route
            path="/projects/:id/preview"
            element={
              s.canManageFinancials ? (
                <Preview s={s} />
              ) : (
                <Navigate to="/projects" />
              )
            }
          />
          <Route path="/projects/:id/revisions" element={<Revisions s={s} />} />
          <Route
            path="/rate-card"
            element={
              s.canManageFinancials ? (
                <RateCard s={s} />
              ) : (
                <Navigate to="/projects" />
              )
            }
          />
          <Route
            path="/fees"
            element={
              s.canManageFinancials ? (
                <Fees s={s} />
              ) : (
                <Navigate to="/projects" />
              )
            }
          />
          <Route
            path="/settings"
            element={
              s.canManageFinancials ? (
                <Firm s={s} />
              ) : (
                <Navigate to="/projects" />
              )
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </div>
    </div>
  );
}

function AuthScreen({ s }: { s: Store }) {
  const [createAccount, setCreateAccount] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const email = String(form.get('email')).trim();
      const password = String(form.get('password'));
      await (createAccount
        ? s.signUp(email, password)
        : s.signIn(email, password));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message.replace(/^Firebase:\s*/, '')
          : 'Authentication failed',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <b>ND</b>
          <span>
            NEBULOUS DESIGN<small>Quotation Studio</small>
          </span>
        </div>
        <small>SECURE TEAM WORKSPACE</small>
        <h1>{createAccount ? 'Create employee account' : 'Sign in'}</h1>
        <p>
          Projects synchronize through Firebase across your computers and
          phones.
        </p>
        <form onSubmit={submit}>
          <label>
            Email
            <Input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <Input
              name="password"
              type="password"
              autoComplete={createAccount ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </label>
          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            {busy
              ? 'Please wait…'
              : createAccount
                ? 'Create account'
                : 'Sign in'}
          </Button>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            setCreateAccount((value) => !value);
            setError('');
          }}
        >
          {createAccount
            ? 'Already have an account? Sign in'
            : 'New employee? Create an account'}
        </button>
        {createAccount && (
          <small className="auth-note">
            New accounts start as Employees. An admin can promote accounts in
            Firebase.
          </small>
        )}
      </section>
    </main>
  );
}
function Modal({
  title,
  subtitle,
  className,
  close,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section className={`modal ${className ?? ''}`}>
        <header>
          <div>
            <small>NEBULOUS DESIGN</small>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={close}
            aria-label={`Close ${title}`}
          >
            <X />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
function NewProject({ s }: { s: Store }) {
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(1),
    [details, setDetails] = useState({
      clientName: '',
      propertyName: '',
      propertyType: '',
      layout: '4 BHK',
      location: '',
      carpetArea: 2400,
      notes: '',
      defaultTier: 'premium' as Tier,
    }),
    [floors, setFloors] = useState(() => [{ id: uid(), name: 'Ground Floor' }]),
    [spaces, setSpaces] = useState<Record<string, string[]>>({}),
    [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({}),
    [floorMenuId, setFloorMenuId] = useState(''),
    [addingSpaceFloorId, setAddingSpaceFloorId] = useState(''),
    go = useNavigate();
  const close = () => {
    setOpen(false);
    setStep(1);
  };
  const addSpace = (floorId: string, name: string) => {
    const value = name.trim();
    if (!value) return;
    setSpaces((current) => ({
      ...current,
      [floorId]: [...(current[floorId] ?? []), value],
    }));
  };
  const toggleFloor = (floorId: string) =>
    setExpandedFloors((current) => ({
      ...current,
      [floorId]: !(current[floorId] ?? floorId === floors[0]?.id),
    }));
  const isFloorOpen = (floorId: string) =>
    expandedFloors[floorId] ?? floorId === floors[0]?.id;
  const floorIcon = (name: string) =>
    name.toLowerCase().includes('ground') ? <HomeIcon /> : <Layers />;
  function create() {
    const chosenSpaces = floors.flatMap((floor) =>
      (spaces[floor.id] ?? []).map((name) => ({
        id: uid(),
        name,
        floorId: floor.id,
        items: [] as QuoteItem[],
      })),
    );
    const fallback = roomsForLayout(details.layout, s.rates).map((room) => ({
      ...room,
      floorId: floors[0].id,
    }));
    const p: Project = {
      id: uid(),
      ...details,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      floors,
      rooms: chosenSpaces.length ? chosenSpaces : fallback,
      fees: createDefaultFees(),
      projectDiscount: 0,
      showRates: true,
    };
    s.setProjects([p, ...s.projects]);
    close();
    go('/projects/' + p.id);
  }
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Plus />
        New Project
      </Button>
      {open && (
        <Modal
          title={`Create project · ${step} of 4`}
          subtitle={
            [
              'Enter the essential details for this project.',
              'Add, rename and order every floor used by the project.',
              'Add spaces to each floor.',
              'Review your structure before creating the project.',
            ][step - 1]
          }
          className="new-project-modal"
          close={close}
        >
          <div className="project-stepper" aria-label={`Step ${step} of 4`}>
            {['Project details', 'Floors', 'Spaces', 'Review'].map(
              (label, index) => {
                const number = index + 1;
                const complete = number < step;
                const current = number === step;
                return (
                  <div
                    className={`${complete ? 'complete' : ''} ${current ? 'current' : ''}`}
                    key={label}
                  >
                    <span aria-hidden="true">
                      {complete ? <Check /> : number}
                    </span>
                    <small>{label}</small>
                  </div>
                );
              },
            )}
          </div>
          <div className="project-step-content">
            {step === 1 && (
              <div className="form-grid">
                <label>
                  Project name
                  <Input
                    value={details.propertyName}
                    onChange={(e) =>
                      setDetails({ ...details, propertyName: e.target.value })
                    }
                  />
                </label>
                <label>
                  Client
                  <Input
                    value={details.clientName}
                    onChange={(e) =>
                      setDetails({ ...details, clientName: e.target.value })
                    }
                  />
                </label>
                <label>
                  Property type
                  <Input
                    value={details.propertyType}
                    onChange={(e) =>
                      setDetails({ ...details, propertyType: e.target.value })
                    }
                    placeholder="Residence, villa, office…"
                  />
                </label>
                <label>
                  Configuration
                  <select
                    value={details.layout}
                    onChange={(e) =>
                      setDetails({ ...details, layout: e.target.value })
                    }
                  >
                    {['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK', 'Other'].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Location
                  <Input
                    value={details.location}
                    onChange={(e) =>
                      setDetails({ ...details, location: e.target.value })
                    }
                  />
                </label>
                <label>
                  Area (sq.ft)
                  <Num
                    value={details.carpetArea}
                    onChange={(carpetArea) =>
                      setDetails({ ...details, carpetArea })
                    }
                  />
                </label>
                {s.canManageFinancials && (
                  <label>
                    Default tier
                    <select
                      value={details.defaultTier}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          defaultTier: e.target.value as Tier,
                        })
                      }
                    >
                      {s.settings.enabledTiers.map((t) => (
                        <option value={t} key={t}>
                          {tl(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="wide">
                  Notes
                  <textarea
                    value={details.notes}
                    onChange={(e) =>
                      setDetails({ ...details, notes: e.target.value })
                    }
                  />
                </label>
              </div>
            )}
            {step === 2 && (
              <div className="floor-step-layout">
                <div className="floor-card-list">
                  {floors.map((floor, index) => (
                    <article className="project-floor-card" key={floor.id}>
                      <GripVertical className="floor-grip" aria-hidden="true" />
                      <span className="project-floor-icon">
                        {floorIcon(floor.name)}
                      </span>
                      <label>
                        <span className="sr-only">Floor name</span>
                        <Input
                          value={floor.name}
                          onChange={(e) =>
                            setFloors(
                              floors.map((x) =>
                                x.id === floor.id
                                  ? { ...x, name: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                        <small>
                          {(spaces[floor.id] ?? []).length}{' '}
                          {(spaces[floor.id] ?? []).length === 1
                            ? 'space'
                            : 'spaces'}
                        </small>
                      </label>
                      <div className="project-floor-menu-wrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${floor.name}`}
                          aria-expanded={floorMenuId === floor.id}
                          onClick={() =>
                            setFloorMenuId(
                              floorMenuId === floor.id ? '' : floor.id,
                            )
                          }
                        >
                          <MoreVertical />
                        </Button>
                        {floorMenuId === floor.id && (
                          <div className="project-floor-menu">
                            <Button
                              variant="ghost"
                              disabled={!index}
                              onClick={() => {
                                const next = [...floors];
                                [next[index - 1], next[index]] = [
                                  next[index],
                                  next[index - 1],
                                ];
                                setFloors(next);
                                setFloorMenuId('');
                              }}
                            >
                              <ChevronUp /> Move up
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={index === floors.length - 1}
                              onClick={() => {
                                const next = [...floors];
                                [next[index + 1], next[index]] = [
                                  next[index],
                                  next[index + 1],
                                ];
                                setFloors(next);
                                setFloorMenuId('');
                              }}
                            >
                              <ChevronDown /> Move down
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={floors.length === 1}
                              onClick={() => {
                                setFloors(
                                  floors.filter((x) => x.id !== floor.id),
                                );
                                setFloorMenuId('');
                              }}
                            >
                              <Trash2 /> Delete floor
                            </Button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                  <aside className="project-tip">
                    <Lightbulb />
                    <p>
                      <strong>Tip</strong>
                      <span>
                        Floors can be renamed, deleted and reordered at any
                        time.
                      </span>
                    </p>
                  </aside>
                </div>
                <aside className="add-floor-panel">
                  <h3>
                    <Plus /> Add floor
                  </h3>
                  <div>
                    {FLOOR_SUGGESTIONS.filter(
                      (name) => !floors.some((floor) => floor.name === name),
                    ).map((name) => (
                      <Button
                        key={name}
                        variant="outline"
                        onClick={() =>
                          setFloors([...floors, { id: uid(), name }])
                        }
                      >
                        {floorIcon(name)} {name}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      onClick={() =>
                        setFloors([...floors, { id: uid(), name: 'New Floor' }])
                      }
                    >
                      <Pencil /> Custom floor
                    </Button>
                  </div>
                </aside>
              </div>
            )}
            {step === 3 && (
              <div className="space-setup refined-space-setup">
                {floors.map((floor) => {
                  const floorSpaces = spaces[floor.id] ?? [];
                  const expanded = isFloorOpen(floor.id);
                  return (
                    <section
                      className={expanded ? 'expanded' : ''}
                      key={floor.id}
                    >
                      <button
                        className="space-floor-heading"
                        onClick={() => toggleFloor(floor.id)}
                        aria-expanded={expanded}
                      >
                        <span className="project-floor-icon">
                          {floorIcon(floor.name)}
                        </span>
                        <span>
                          <strong>{floor.name}</strong>
                          <small>
                            {floorSpaces.length}{' '}
                            {floorSpaces.length === 1 ? 'space' : 'spaces'}
                          </small>
                        </span>
                        {expanded ? <ChevronUp /> : <ChevronDown />}
                      </button>
                      {expanded && (
                        <div className="floor-space-body">
                          {floorSpaces.map((name, index) => (
                            <div
                              className="compact-space-row"
                              key={`${name}-${index}`}
                            >
                              <DoorOpen />
                              <span>{name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${name}`}
                                onClick={() =>
                                  setSpaces({
                                    ...spaces,
                                    [floor.id]: floorSpaces.filter(
                                      (_, i) => i !== index,
                                    ),
                                  })
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          ))}
                          {addingSpaceFloorId === floor.id ? (
                            <div className="space-add-controls">
                              <select
                                aria-label={`Choose a space for ${floor.name}`}
                                defaultValue=""
                                onChange={(e) => {
                                  addSpace(floor.id, e.target.value);
                                  e.target.value = '';
                                }}
                              >
                                <option value="">Choose a common space…</option>
                                {SPACE_SUGGESTIONS.map((name) => (
                                  <option key={name}>{name}</option>
                                ))}
                              </select>
                              <Input
                                placeholder="Custom space — press Enter"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    addSpace(floor.id, e.currentTarget.value);
                                    e.currentTarget.value = '';
                                  }
                                  if (e.key === 'Escape')
                                    setAddingSpaceFloorId('');
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Close add space"
                                onClick={() => setAddingSpaceFloorId('')}
                              >
                                <X />
                              </Button>
                            </div>
                          ) : (
                            <button
                              className="add-space-compact"
                              onClick={() => setAddingSpaceFloorId(floor.id)}
                            >
                              <Plus /> Add space to {floor.name}
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            {step === 4 && (
              <div className="setup-review refined-setup-review">
                <aside className="layout-notice">
                  <Info />
                  <p>
                    <strong>{details.layout}</strong> is only a starting
                    reference. Bedrooms and all other spaces remain fully
                    editable after creation.
                  </p>
                </aside>
                <div className="review-floor-list">
                  {floors.map((floor) => {
                    const floorSpaces = spaces[floor.id] ?? [];
                    return (
                      <section key={floor.id}>
                        <span className="project-floor-icon">
                          {floorIcon(floor.name)}
                        </span>
                        <div>
                          <h3>{floor.name}</h3>
                          <p>
                            {floorSpaces.length}{' '}
                            {floorSpaces.length === 1 ? 'space' : 'spaces'}
                            {floorSpaces.length
                              ? `  ·  ${floorSpaces.join(', ')}`
                              : '  ·  No spaces yet'}
                          </p>
                        </div>
                        <ChevronRight aria-hidden="true" />
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="actions project-setup-actions">
            <Button
              variant="outline"
              onClick={step === 1 ? close : () => setStep(step - 1)}
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>
            {step < 4 ? (
              <Button
                disabled={
                  step === 1 &&
                  (!details.propertyName.trim() || !details.clientName.trim())
                }
                onClick={() => {
                  if (
                    step === 2 &&
                    !Object.values(spaces).some((items) => items.length)
                  ) {
                    const suggested = layoutRooms[details.layout] ?? [
                      'Living Room',
                      'Kitchen',
                    ];
                    const next: Record<string, string[]> = {};
                    floors.forEach((floor) => (next[floor.id] = []));
                    suggested.forEach((name, index) => {
                      const bedroom = name.includes('Bedroom');
                      const target = bedroom
                        ? floors[
                            Math.min(index % floors.length, floors.length - 1)
                          ]
                        : floors[0];
                      next[target.id].push(name);
                    });
                    setSpaces(next);
                  }
                  setStep(step + 1);
                }}
              >
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button onClick={create}>
                Create & open BOQ <ArrowRight />
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
function Page({
  title,
  sub,
  back,
  children,
}: {
  title: string;
  sub: string;
  back?: {
    label: string;
    onClick: () => void;
  };
  children: React.ReactNode;
}) {
  return (
    <main className="page">
      <header className="page-title">
        {back && (
          <Button
            className="page-back"
            type="button"
            variant="outline"
            onClick={back.onClick}
          >
            <ChevronLeft />
            {back.label}
          </Button>
        )}
        <h1>{title}</h1>
        <p>{sub}</p>
      </header>
      {children}
    </main>
  );
}
function Metric({
  label,
  value,
  note,
  green = false,
}: {
  label: string;
  value: string;
  note: string;
  green?: boolean;
}) {
  return (
    <article className={'metric ' + (green ? 'green' : '')}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function Dashboard({ s }: { s: Store }) {
  const total = s.projects.reduce((a, p) => a + quoteTotals(p).grandTotal, 0),
    fees = s.projects.reduce((a, p) => a + quoteTotals(p).feeTotal, 0);
  return (
    <Page
      title="Good afternoon"
      sub="Here’s the commercial view across your studio."
    >
      <div className="metrics">
        <Metric
          label="Total projects"
          value={String(s.projects.length)}
          note={`${s.projects.filter((p) => p.status === 'active').length} active quotations`}
        />
        {s.canManageFinancials && (
          <>
            <Metric
              label="Quotation value"
              value={inr(total)}
              note="Across all projects"
            />
            <Metric
              green
              label="Design fee revenue"
              value={inr(fees)}
              note="Projected fee income"
            />
            <Metric
              label="Average project"
              value={inr(s.projects.length ? total / s.projects.length : 0)}
              note="Portfolio average"
            />
          </>
        )}
      </div>
      <section className="panel">
        <SectionHead title="Recent projects">
          <NewProject s={s} />
        </SectionHead>
        <ProjectTable
          projects={s.projects.slice(0, 5)}
          showFinancials={s.canManageFinancials}
        />
      </section>
    </Page>
  );
}
function SectionHead({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <small>WORKSPACE</small>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}
function Projects({ s }: { s: Store }) {
  return (
    <Page title="Projects" sub="Create, manage and revisit every quotation.">
      <section className="panel">
        <SectionHead title="Quotation register">
          <NewProject s={s} />
        </SectionHead>
        <ProjectTable
          projects={s.projects}
          showFinancials={s.canManageFinancials}
        />
      </section>
    </Page>
  );
}
function ProjectTable({
  projects,
  showFinancials,
}: {
  projects: Project[];
  showFinancials: boolean;
}) {
  const go = useNavigate();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Layout</th>
            {showFinancials && <th>Tier</th>}
            <th>Updated</th>
            {showFinancials && <th className="num">Value</th>}
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} onClick={() => go('/projects/' + p.id)}>
              <td>
                <strong>{p.propertyName}</strong>
                <small>{p.clientName}</small>
              </td>
              <td>{p.layout}</td>
              {showFinancials && (
                <td>
                  <em className="pill">{tl(p.defaultTier)}</em>
                </td>
              )}
              <td>{new Date(p.updatedAt).toLocaleDateString('en-IN')}</td>
              {showFinancials && (
                <td className="num">
                  <strong>{inr(quoteTotals(p).grandTotal)}</strong>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const fresh = (r?: RateCardItem): QuoteItem => ({
  id: uid(),
  itemType: 'simple',
  rateCardId: r?.id,
  rateSource: r ? 'template' : 'project',
  name: r?.name ?? 'New Item',
  description: r?.description ?? '',
  enabled: true,
  measurementType: r?.unit ?? 'quantity',
  unit: unitForMeasurement(r?.unit ?? 'quantity'),
  pricingMode: r?.unit === 'flat' ? 'lump-sum' : 'unit',
  workType: 'Millwork',
  dimensionUnit: 'ft',
  hsnCode: '',
  measureMode:
    r?.unit === 'sqft' || r?.unit === 'rft' ? 'dimensions' : 'quantity',
  quantity: 1,
  length: 8,
  width: 4,
  height: 0,
  rates: r?.rates ?? { standard: 0, premium: 0, luxury: 0 },
  discount: 0,
  notes: '',
  subUnits: structuredClone(r?.subUnits ?? []),
});

const layoutRooms: Record<string, string[]> = {
  '1 BHK': ['Living Room', 'Kitchen', 'Master Bedroom'],
  '2 BHK': ['Living Room', 'Kitchen', 'Master Bedroom', 'Bedroom 2'],
  '3 BHK': [
    'Living Room',
    'Kitchen',
    'Master Bedroom',
    'Bedroom 2',
    'Bedroom 3',
  ],
  '4 BHK': [
    'Living Room',
    'Kitchen',
    'Master Bedroom',
    'Bedroom 2',
    'Bedroom 3',
    'Guest Bedroom',
  ],
  '5 BHK': [
    'Living Room',
    'Kitchen',
    'Master Bedroom',
    'Bedroom 2',
    'Bedroom 3',
    'Kids Bedroom',
    'Guest Bedroom',
  ],
};

function roomsForLayout(layout: string, rates: RateCardItem[]): Room[] {
  const rate = (name: string) => rates.find((item) => item.name === name);
  const itemNamesForRoom = (name: string) => {
    if (name === 'Living Room') return ['False Ceiling', 'TV Unit'];
    if (name === 'Kitchen') return ['Base Cabinets', 'Wall Cabinets'];
    return ['Wardrobe', 'Bed Back Panel'];
  };

  return (layoutRooms[layout] ?? []).map((name) => ({
    id: uid(),
    name,
    items: itemNamesForRoom(name)
      .map(rate)
      .filter((item): item is RateCardItem => Boolean(item))
      .map(fresh),
  }));
}

export async function exportProjectExcel(
  project: Project,
  settings: FirmSettings,
  saveBytes?: (filename: string, data: Uint8Array) => void | Promise<void>,
) {
  const { filename, bytes } = await createProjectExcelFile(project, settings);
  if (saveBytes) {
    await saveBytes(filename, bytes);
    return;
  }
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    await shareNativeFile(
      filename,
      excelBytesToBase64(bytes),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return;
  }
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  const url = URL.createObjectURL(
    new Blob([blobBytes.buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function shareNativeFile(
  filename: string,
  data: string,
  _mimeType: string,
) {
  const [{ Directory, Filesystem }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const result = await Filesystem.writeFile({
    path: `exports/${filename}`,
    data,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({
    title: filename,
    text: 'Nebulous Design Workshop quotation export',
    url: result.uri,
    dialogTitle: 'Save or share quotation',
  });
}

async function exportQuotationPdf(project: Project) {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) {
    window.print();
    return;
  }

  const element = document.querySelector<HTMLElement>('.document');
  if (!element) throw new Error('Quotation preview is unavailable.');
  await document.fonts?.ready;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    logging: false,
    windowWidth: Math.max(element.scrollWidth, 1000),
  });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const renderedHeight = (canvas.height * pageWidth) / canvas.width;
  const image = canvas.toDataURL('image/jpeg', 0.94);
  let offset = 0;
  let page = 0;
  while (offset < renderedHeight) {
    if (page > 0) pdf.addPage();
    pdf.addImage(image, 'JPEG', 0, -offset, pageWidth, renderedHeight);
    offset += pageHeight;
    page += 1;
  }
  const filename = `${project.propertyName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-quotation.pdf`;
  const data = pdf.output('datauristring').split(',')[1];
  await shareNativeFile(filename, data, 'application/pdf');
}
function ProjectAssignments({
  user,
  projectId,
  close,
}: {
  user: WorkspaceUser;
  projectId: string;
  close: () => void;
}) {
  const [employees, setEmployees] = useState<Awaited<
    ReturnType<typeof loadProjectAssignments>
  > | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    void loadProjectAssignments(user, projectId)
      .then((rows) => {
        if (!active) return;
        setEmployees(rows);
        setSelected(
          Object.fromEntries(rows.map((row) => [row.uid, row.assigned])),
        );
      })
      .catch(() => {
        if (active)
          setError(
            'Could not load employees. Check your connection and published database rules.',
          );
      });
    return () => {
      active = false;
    };
  }, [user.uid, projectId]);
  return (
    <Modal
      title="Assign employees"
      close={() => {
        if (!saving) close();
      }}
      subtitle="Assigned employees can edit technical details only. Financial data remains restricted."
    >
      {error && <p role="alert">{error}</p>}
      {!employees && !error && <p role="status">Loading employees…</p>}
      {employees?.length === 0 && (
        <p>Employees appear here after signing in to the app once.</p>
      )}
      <div className="form-grid single-column">
        {employees?.map((employee) => (
          <label
            key={employee.uid}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <input
              type="checkbox"
              style={{ width: 20, height: 20 }}
              disabled={saving}
              checked={selected[employee.uid] ?? false}
              onChange={(event) =>
                setSelected((current) => ({
                  ...current,
                  [employee.uid]: event.target.checked,
                }))
              }
            />
            <span>
              {employee.displayName} — {employee.email}
            </span>
          </label>
        ))}
      </div>
      <div className="actions">
        <Button variant="outline" disabled={saving} onClick={close}>
          Cancel
        </Button>
        <Button
          disabled={!employees || saving}
          onClick={async () => {
            setSaving(true);
            setError('');
            try {
              for (const employee of employees ?? []) {
                if (
                  employee.needsRepair ||
                  selected[employee.uid] !== employee.assigned
                )
                  await setProjectAssignment(
                    user,
                    projectId,
                    employee.uid,
                    selected[employee.uid],
                  );
              }
              close();
            } catch {
              setError(
                'Could not save assignments. Please retry; financial access has not changed.',
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? 'Saving…' : 'Save assignments'}
        </Button>
      </div>
    </Modal>
  );
}

function Builder({ s }: { s: Store }) {
  const { id } = useParams(),
    go = useNavigate(),
    p = s.projects.find((x) => x.id === id),
    [rid, setRid] = useState(p?.rooms[0]?.id ?? ''),
    [roomModal, setRoomModal] = useState(false),
    [itemModal, setItemModal] = useState(false),
    [itemParentId, setItemParentId] = useState<string | null>(null),
    [groupModal, setGroupModal] = useState(false),
    [groupName, setGroupName] = useState(''),
    [groupQuantity, setGroupQuantity] = useState(1),
    [groupUnit, setGroupUnit] = useState<BoqUnit>('Nos'),
    [compare, setCompare] = useState(false),
    [projectActions, setProjectActions] = useState(false),
    [assignmentModal, setAssignmentModal] = useState(false),
    [renameModal, setRenameModal] = useState(false),
    [renameValue, setRenameValue] = useState(''),
    [deleteProject, setDeleteProject] = useState(false),
    [revisionModal, setRevisionModal] = useState(false),
    [revisionNote, setRevisionNote] = useState(''),
    [revisionSaving, setRevisionSaving] = useState(false),
    [editingItemId, setEditingItemId] = useState<string | null>(null),
    [selectedWorkType, setSelectedWorkType] = useState('All'),
    [selectedFloorId, setSelectedFloorId] = useState(p?.floors?.[0]?.id ?? ''),
    [mobileSpaceDetail, setMobileSpaceDetail] = useState(false),
    [structureModal, setStructureModal] = useState(false),
    [expandedFloorId, setExpandedFloorId] = useState(p?.floors?.[0]?.id ?? ''),
    [floorMenuId, setFloorMenuId] = useState(''),
    [roomsOpen, setRoomsOpen] = useState(() => window.innerWidth > 1100),
    [summaryOpen, setSummaryOpen] = useState(() => window.innerWidth > 1100);
  if (!p && !s.hydrated)
    return <div className="boot">Preparing your quotation workspace…</div>;
  if (!p) return <Navigate to="/projects" />;
  const projectFloors = p.floors ?? [],
    activeFloorId = projectFloors.some((floor) => floor.id === selectedFloorId)
      ? selectedFloorId
      : (projectFloors[0]?.id ?? ''),
    visibleRooms = p.rooms.filter((space) => space.floorId === activeFloorId),
    room = visibleRooms.find((r) => r.id === rid) ?? visibleRooms[0],
    update = (fn: (p: Project) => Project) =>
      s.setProjects(
        s.projects.map((x) =>
          x.id === id ? { ...fn(x), updatedAt: new Date().toISOString() } : x,
        ),
      ),
    tot = quoteTotals(p);
  const roomWorkTypeItems = (space: Room) =>
    space.items.filter(
      (item) =>
        item.enabled &&
        (selectedWorkType === 'All' || item.workType === selectedWorkType),
    );
  const roomFilteredItems = (space: Room) =>
    space.items.filter((item) => {
      if (item.parentItemId) return false;
      if (selectedWorkType === 'All') return true;
      if (item.workType === selectedWorkType) return true;
      return (
        isCompositeItem(item) &&
        orderedCompositeChildren(space, item).some(
          (child) => child.workType === selectedWorkType,
        )
      );
    });
  const roomWorkTypeTotal = (space: Room) =>
    roomWorkTypeItems(space).reduce(
      (sum, item) => sum + itemTotal(item, p.defaultTier),
      0,
    );
  const workTypeOptions = ['All', ...WORK_TYPES];
  const selectedFloor = projectFloors.find(
    (floor) => floor.id === activeFloorId,
  );
  const patchItem = (iid: string, x: Partial<QuoteItem>) =>
    update((q) => ({
      ...q,
      rooms: q.rooms.map((r) =>
        r.id === room.id
          ? {
              ...r,
              items: r.items.map((i) => (i.id === iid ? { ...i, ...x } : i)),
            }
          : r,
      ),
    }));
  const openItemPicker = (parentItemId: string | null = null) => {
    setItemParentId(parentItemId);
    setItemModal(true);
  };
  const addPickedItem = (template?: RateCardItem) => {
    if (!room) return;
    const parent = itemParentId
      ? room.items.find((candidate) => candidate.id === itemParentId)
      : undefined;
    const item = {
      ...fresh(template),
      workType:
        parent?.workType ??
        (selectedWorkType === 'All'
          ? template
            ? 'Millwork'
            : 'Other'
          : selectedWorkType),
      ...(itemParentId ? { parentItemId: itemParentId } : {}),
    };
    update((q) => ({
      ...q,
      rooms: q.rooms.map((candidate) =>
        candidate.id !== room.id
          ? candidate
          : {
              ...candidate,
              items: [
                ...candidate.items.map((existing) =>
                  existing.id === itemParentId
                    ? {
                        ...existing,
                        childrenOrder: [...(existing.childrenOrder ?? []), item.id],
                      }
                    : existing,
                ),
                item,
              ],
            },
      ),
    }));
    setItemModal(false);
    setItemParentId(null);
  };
  const addSpaceToFloor = (floorId: string, floorName: string) => {
    const name = window.prompt(`Add a space to ${floorName}`);
    if (!name?.trim()) return;
    const newRoom: Room = {
      id: uid(),
      name: name.trim(),
      floorId,
      items: [],
    };
    update((project) => ({
      ...project,
      rooms: [...project.rooms, newRoom],
    }));
    setRid(newRoom.id);
  };
  async function saveRev(note: string) {
    const project = p!;
    const prior = s.revisions.filter((r) => r.projectId === project.id);
    await s.setRevisions([
      ...s.revisions,
      {
        id: uid(),
        projectId: project.id,
        number: Math.max(0, ...prior.map((revision) => revision.number)) + 1,
        createdAt: new Date().toISOString(),
        createdBy: s.user?.uid,
        authorName: s.user?.displayName,
        total: tot.grandTotal,
        note: note.trim(),
        snapshot: structuredClone(project),
        technicalOnly: !s.canManageFinancials,
      },
    ]);
    setRevisionModal(false);
    setRevisionNote('');
  }
  const renderItem = (
    item: QuoteItem,
    index: number,
    parent?: QuoteItem,
  ) => (
    <Item
      key={item.id}
      item={item}
      p={p}
      canManageFinancials={s.canManageFinancials}
      showWorkType={selectedWorkType === 'All'}
      currentRoomId={room.id}
      editing={editingItemId === item.id}
      setEditing={(value) => setEditingItemId(value ? item.id : null)}
      patch={(x) => patchItem(item.id, x)}
      duplicate={() => {
        const copy = {
          ...structuredClone(item),
          id: uid(),
          name: item.name + ' copy',
        };
        update((q) => ({
          ...q,
          rooms: q.rooms.map((candidate) =>
            candidate.id !== room.id
              ? candidate
              : {
                  ...candidate,
                  items: [
                    ...candidate.items.map((existing) =>
                      existing.id === parent?.id
                        ? {
                            ...existing,
                            childrenOrder: [
                              ...(existing.childrenOrder ?? []),
                              copy.id,
                            ],
                          }
                        : existing,
                    ),
                    copy,
                  ],
                },
          ),
        }));
      }}
      remove={() =>
        update((q) => ({
          ...q,
          rooms: q.rooms.map((candidate) =>
            candidate.id === room.id
              ? { ...candidate, items: removeItemTree(candidate.items, item.id) }
              : candidate,
          ),
        }))
      }
      move={
        parent
          ? undefined
          : (destination) =>
              update((q) => ({
                ...q,
                rooms: q.rooms.map((candidate) =>
                  candidate.id === room.id
                    ? {
                        ...candidate,
                        items: candidate.items.filter((x) => x.id !== item.id),
                      }
                    : candidate.id === destination
                      ? { ...candidate, items: [...candidate.items, structuredClone(item)] }
                      : candidate,
                ),
              }))
      }
      order={(direction) =>
        update((q) => ({
          ...q,
          rooms: q.rooms.map((candidate) => {
            if (candidate.id !== room.id) return candidate;
            if (parent)
              return {
                ...candidate,
                items: moveCompositeChild(
                  candidate.items,
                  parent.id,
                  item.id,
                  direction < 0 ? -1 : 1,
                ),
              };
            const roots = candidate.items.filter((entry) => !entry.parentItemId);
            const rootIndex = roots.findIndex((entry) => entry.id === item.id);
            const target = roots[rootIndex + direction];
            if (!target) return candidate;
            const items = [...candidate.items];
            const from = items.findIndex((entry) => entry.id === item.id);
            const to = items.findIndex((entry) => entry.id === target.id);
            [items[from], items[to]] = [items[to], items[from]];
            return { ...candidate, items };
          }),
        }))
      }
    />
  );
  return (
    <div className="builder">
      <header className="builder-head">
        <div>
          <button onClick={() => go('/projects')}>Projects /</button>
          <h1>{p.propertyName}</h1>
          <p>
            {p.clientName} · {p.layout} · {p.carpetArea.toLocaleString('en-IN')}{' '}
            sqft
          </p>
        </div>
        <div className="builder-actions">
          <nav className="project-links" aria-label="Quotation workflow">
            <span>Builder</span>
            {s.canManageFinancials && (
              <>
                <button onClick={() => go(`/projects/${id}/rates`)}>
                  Rates
                </button>
                <button onClick={() => setCompare(true)}>Compare</button>
                <button onClick={() => go(`/projects/${id}/preview`)}>
                  Preview
                </button>
              </>
            )}
            <button onClick={() => go(`/projects/${id}/revisions`)}>
              Revisions
            </button>
          </nav>
          {s.canManageFinancials && (
            <Button
              variant="outline"
              className="save-revision"
              onClick={() => setRevisionModal(true)}
            >
              <Save /> Save revision
            </Button>
          )}
          <div className="project-actions-wrap">
            <Button
              variant="outline"
              size="icon-lg"
              className="project-more"
              onClick={() => setProjectActions((value) => !value)}
              aria-label="Project actions"
              title="Project actions"
            >
              <MoreHorizontal />
            </Button>
            {projectActions && (
              <div className="context-menu project-menu">
                {s.canManageFinancials && (
                  <>
                    <button
                      onClick={() => {
                        setProjectActions(false);
                        go(`/projects/${id}/rates`);
                      }}
                    >
                      <CircleDollarSign /> Project rates
                    </button>
                    <button
                      onClick={() => {
                        setProjectActions(false);
                        setAssignmentModal(true);
                      }}
                    >
                      <BriefcaseBusiness /> Assign employees
                    </button>
                    <button
                      onClick={() => {
                        setProjectActions(false);
                        setCompare(true);
                      }}
                    >
                      <BarChart3 />
                      Compare tiers
                    </button>
                    <button onClick={() => go(`/projects/${id}/preview`)}>
                      <ReceiptText />
                      Quotation preview
                    </button>
                    <span />
                  </>
                )}
                <button
                  onClick={() => {
                    setRenameValue(p.propertyName);
                    setRenameModal(true);
                    setProjectActions(false);
                  }}
                >
                  <Pencil />
                  Edit project details
                </button>
                <button
                  onClick={() => {
                    const copy = {
                      ...structuredClone(p),
                      id: uid(),
                      propertyName: `${p.propertyName} copy`,
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    s.setProjects([copy, ...s.projects]);
                    setProjectActions(false);
                    go(`/projects/${copy.id}`);
                  }}
                >
                  <Copy />
                  Duplicate project
                </button>
                <button
                  onClick={() => {
                    setProjectActions(false);
                    go(`/projects/${id}/revisions`);
                  }}
                >
                  <FileClock />
                  Revision history
                </button>
                <button
                  onClick={() => {
                    setProjectActions(false);
                    setRevisionModal(true);
                  }}
                >
                  <Save />
                  Save revision
                </button>
                {s.canManageFinancials && (
                  <>
                    <button
                      onClick={() => {
                        void exportProjectExcel(p, s.settings);
                        setProjectActions(false);
                      }}
                    >
                      <Download />
                      Export quotation
                    </button>
                    <span />
                    <button
                      className="danger"
                      onClick={() => {
                        setProjectActions(false);
                        setDeleteProject(true);
                      }}
                    >
                      <Trash2 />
                      Delete project
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <nav className="boq-drilldown" aria-label="BOQ navigation">
        <div className="boq-filter-group">
          <label htmlFor="boq-work-type">Work Type</label>
          <div className="boq-select-control">
            <BriefcaseBusiness />
            <select
              id="boq-work-type"
              aria-label="Work type"
              value={selectedWorkType}
              onChange={(event) => {
                setSelectedWorkType(event.target.value);
                setMobileSpaceDetail(false);
              }}
            >
              {workTypeOptions.map((workType) => (
                <option key={workType} value={workType}>
                  {workType === 'All' ? 'All Work Types' : workType}
                </option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </div>
        <div className="boq-filter-group floor-filter-group">
          <label htmlFor="boq-floor">Floor</label>
          <div className="boq-select-control">
            <Building2 />
            <select
              id="boq-floor"
              aria-label="Floor"
              value={activeFloorId}
              onChange={(event) => {
                const floorId = event.target.value;
                setSelectedFloorId(floorId);
                setRid(
                  p.rooms.find((space) => space.floorId === floorId)?.id ?? '',
                );
                setMobileSpaceDetail(false);
              }}
            >
              {projectFloors.map((floor) => (
                <option value={floor.id} key={floor.id}>
                  {floor.name}
                </option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </div>
        <div className="boq-quick-action">
          <small>Quick Actions</small>
          <Button variant="outline" onClick={() => setStructureModal(true)}>
            <Settings />
            Manage Floors & Spaces
          </Button>
        </div>
      </nav>
      <section
        className={`mobile-space-browser ${mobileSpaceDetail ? 'detail-open' : ''}`}
      >
        <header>
          <div>
            <small>{selectedFloor?.name ?? 'Select a floor'}</small>
            <h2>Spaces</h2>
          </div>
          <span>{selectedWorkType}</span>
        </header>
        <div>
          {visibleRooms.map((space) => {
            const items = roomWorkTypeItems(space);
            return (
              <button
                key={space.id}
                onClick={() => {
                  setRid(space.id);
                  setRoomsOpen(false);
                  setMobileSpaceDetail(true);
                }}
              >
                <span className="space-nav-icon" aria-hidden="true">
                  <DoorOpen />
                </span>
                <span className="space-nav-copy">
                  <strong>{space.name}</strong>
                  <small>
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </small>
                </span>
                {s.canManageFinancials && (
                  <b>{inr(roomWorkTypeTotal(space))}</b>
                )}
                <ChevronRight />
              </button>
            );
          })}
        </div>
        <Button variant="outline" onClick={() => setRoomModal(true)}>
          <Plus /> Add space
        </Button>
      </section>
      <div
        className={`builder-grid ${roomsOpen ? 'rooms-open' : 'rooms-closed'} ${summaryOpen && s.canManageFinancials ? 'summary-open' : 'summary-closed'} ${mobileSpaceDetail ? 'mobile-detail-open' : 'mobile-detail-closed'}`}
      >
        <aside className={`rooms ${roomsOpen ? 'panel-open' : 'panel-closed'}`}>
          <header>
            <span>
              <b>SPACES</b>
              <small>{visibleRooms.length}</small>
            </span>
            <div>
              <button onClick={() => setRoomModal(true)} aria-label="Add space">
                <Plus />
              </button>
              <button
                onClick={() => setRoomsOpen(false)}
                aria-label="Hide rooms"
              >
                <PanelLeftClose />
              </button>
            </div>
          </header>
          {visibleRooms.map((r, i) => (
            <article
              key={r.id}
              className={r.id === room?.id ? 'selected' : ''}
              onClick={() => setRid(r.id)}
            >
              <button>
                <span className="space-nav-icon" aria-hidden="true">
                  <DoorOpen />
                </span>
                <span className="space-nav-copy">
                  <strong>{r.name}</strong>
                  <small>
                    {roomWorkTypeItems(r).length}{' '}
                    {roomWorkTypeItems(r).length === 1 ? 'item' : 'items'}
                  </small>
                </span>
                {s.canManageFinancials && <b>{inr(roomWorkTypeTotal(r))}</b>}
                <ChevronRight className="room-chevron" />
              </button>
              <div>
                <button
                  disabled={!i}
                  onClick={(e) => {
                    e.stopPropagation();
                    update((q) => {
                      const a = [...q.rooms];
                      const from = a.findIndex((space) => space.id === r.id),
                        to = a.findIndex(
                          (space) => space.id === visibleRooms[i - 1]?.id,
                        );
                      if (from < 0 || to < 0) return q;
                      [a[to], a[from]] = [a[from], a[to]];
                      return { ...q, rooms: a };
                    });
                  }}
                >
                  <ChevronUp />
                </button>
                <button
                  disabled={i === visibleRooms.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    update((q) => {
                      const a = [...q.rooms];
                      const from = a.findIndex((space) => space.id === r.id),
                        to = a.findIndex(
                          (space) => space.id === visibleRooms[i + 1]?.id,
                        );
                      if (from < 0 || to < 0) return q;
                      [a[to], a[from]] = [a[from], a[to]];
                      return { ...q, rooms: a };
                    });
                  }}
                >
                  <ChevronDown />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      r.items.length &&
                      !window.confirm(
                        `Delete ${r.name} and its ${r.items.length} BOQ items?`,
                      )
                    )
                      return;
                    const remainingRooms = p.rooms.filter(
                      (candidate) => candidate.id !== r.id,
                    );
                    if (room?.id === r.id) {
                      setRid(
                        remainingRooms[Math.min(i, remainingRooms.length - 1)]
                          ?.id ?? '',
                      );
                    }
                    void s.deleteRoom(p.id, r.id);
                  }}
                  aria-label={`Delete ${r.name}`}
                  title={`Delete ${r.name}`}
                >
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
          <Button variant="ghost" size="lg" onClick={() => setRoomModal(true)}>
            <Plus />
            Add space
          </Button>
        </aside>
        <main className="items">
          {room ? (
            <>
              <div className="workspace-controls">
                {!roomsOpen && (
                  <Button
                    className="rooms-reopen"
                    variant="ghost"
                    onClick={() => setRoomsOpen(true)}
                    aria-label="Show rooms"
                  >
                    <PanelLeftOpen />
                    Rooms
                  </Button>
                )}
                <Button
                  className="mobile-space-back"
                  variant="ghost"
                  onClick={() => setMobileSpaceDetail(false)}
                >
                  <ChevronLeft /> Spaces
                </Button>
                <span>
                  {roomWorkTypeItems(room).length}{' '}
                  {roomWorkTypeItems(room).length === 1 ? 'item' : 'items'}{' '}
                  shown
                </span>
                {s.canManageFinancials && (
                  <Button
                    className="summary-toggle"
                    variant="ghost"
                    size="icon-lg"
                    onClick={() => setSummaryOpen((value) => !value)}
                    aria-pressed={summaryOpen}
                    aria-label={summaryOpen ? 'Hide summary' : 'Show summary'}
                    title={summaryOpen ? 'Hide summary' : 'Show summary'}
                  >
                    {summaryOpen ? <X /> : <WalletCards />}
                  </Button>
                )}
              </div>
              <section className="room-workspace">
                <header>
                  <div className="room-identity">
                    <img
                      src={itemImage(room.items[0]?.name ?? '')}
                      alt=""
                      aria-hidden="true"
                    />
                    <div>
                      <small>SELECTED ROOM</small>
                      <h2>{room.name}</h2>
                      <p>
                        {selectedWorkType === 'All'
                          ? 'All Work Types'
                          : selectedWorkType}{' '}
                        · {selectedFloor?.name ?? 'Select a floor'}
                      </p>
                    </div>
                  </div>
                  {s.canManageFinancials && (
                    <span>
                      <strong>{inr(roomWorkTypeTotal(room))}</strong>
                      <small>Visible items</small>
                    </span>
                  )}
                </header>
                <div className="room-components">
                  {roomFilteredItems(room).length === 0 ? (
                    <div className="room-empty-state">
                      <span className="empty-state-icon" aria-hidden="true">
                        <ClipboardList />
                      </span>
                      <h3>No items yet</h3>
                      <p>
                        Add BOQ items to this space to start building your
                        quotation.
                      </p>
                      <div>
                        <Button size="lg" onClick={() => openItemPicker()}>
                          <Plus /> Add BOQ Item
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => openItemPicker()}
                        >
                          <ClipboardList /> Browse Item Templates
                        </Button>
                      </div>
                      <aside>
                        <strong>Tip</strong>
                        <span>
                          You can add any item to any space. There are no work
                          type restrictions.
                        </span>
                      </aside>
                    </div>
                  ) : (
                    roomFilteredItems(room).map((item, i) =>
                      isCompositeItem(item) ? (
                        <CompositeItem
                          key={item.id}
                          item={item}
                          room={room}
                          p={p}
                          canManageFinancials={s.canManageFinancials}
                          patch={async (change) => {
                            const next = s.projects.map((q) =>
                              q.id !== id
                                ? q
                                : {
                                    ...q,
                                    updatedAt: new Date().toISOString(),
                                    rooms: q.rooms.map((candidate) =>
                                      candidate.id !== room.id
                                        ? candidate
                                        : {
                                            ...candidate,
                                            items: candidate.items.map((entry) => {
                                              if (entry.id === item.id)
                                                return { ...entry, ...change };
                                              if (
                                                change.workType !== undefined &&
                                                entry.parentItemId === item.id
                                              )
                                                return {
                                                  ...entry,
                                                  workType: change.workType,
                                                };
                                              return entry;
                                            }),
                                          },
                                    ),
                                  },
                            );
                            await s.saveProjectsNow(next);
                          }}
                          addChild={() => openItemPicker(item.id)}
                          remove={() => {
                            const count = orderedCompositeChildren(room, item).length;
                            if (
                              count &&
                              !window.confirm(
                                `Delete ${item.name} and its ${count} components?`,
                              )
                            )
                              return;
                            update((q) => ({
                              ...q,
                              rooms: q.rooms.map((candidate) =>
                                candidate.id === room.id
                                  ? {
                                      ...candidate,
                                      items: removeItemTree(candidate.items, item.id),
                                    }
                                  : candidate,
                              ),
                            }));
                          }}
                        >
                          {orderedCompositeChildren(room, item)
                            .filter(
                              (child) =>
                                selectedWorkType === 'All' ||
                                child.workType === selectedWorkType,
                            )
                            .map((child, childIndex) =>
                              renderItem(child, childIndex, item),
                            )}
                        </CompositeItem>
                      ) : (
                        renderItem(item, i)
                      ),
                    )
                  )}
                  {roomFilteredItems(room).length > 0 && (
                    <Button
                      className="add-item"
                      variant="outline"
                      size="lg"
                      onClick={() => openItemPicker()}
                    >
                      <Plus />
                      Add item to {room.name}
                    </Button>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="empty">
              <h2>No rooms yet</h2>
              <p>Add a room to begin the quotation.</p>
              <Button onClick={() => setRoomModal(true)}>
                <Plus />
                Add first room
              </Button>
            </div>
          )}
        </main>
        {s.canManageFinancials && (
          <Summary
            p={p}
            update={update}
            open={summaryOpen}
            close={() => setSummaryOpen(false)}
            preview={() => go(`/projects/${id}/preview`)}
            download={() => void exportProjectExcel(p, s.settings)}
          />
        )}
      </div>
      {roomModal && (
        <Modal title="Add a room" close={() => setRoomModal(false)}>
          <div className="presets">
            {presets.map((name) => (
              <Button
                variant="outline"
                key={name}
                onClick={() => {
                  const r = {
                    id: uid(),
                    name,
                    floorId: activeFloorId,
                    items: [],
                  };
                  update((q) => ({ ...q, rooms: [...q.rooms, r] }));
                  setRid(r.id);
                  setRoomModal(false);
                }}
              >
                {name}
              </Button>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                const name = window.prompt('Custom space name');
                if (!name?.trim()) return;
                const r = {
                  id: uid(),
                  name: name.trim(),
                  floorId: activeFloorId,
                  items: [],
                };
                update((q) => ({ ...q, rooms: [...q.rooms, r] }));
                setRid(r.id);
                setRoomModal(false);
              }}
            >
              <Plus /> Add custom space
            </Button>
          </div>
        </Modal>
      )}
      {structureModal && (
        <Modal
          title="Floors & Spaces"
          subtitle="Manage the floors and spaces for this project"
          className="structure-modal"
          close={() => setStructureModal(false)}
        >
          <div className="structure-editor">
            {projectFloors.map((floor, index) => {
              const floorRooms = p.rooms.filter(
                (space) => space.floorId === floor.id,
              );
              const floorTotal = floorRooms.reduce(
                (sum, space) => sum + roomTotal(space, p.defaultTier),
                0,
              );
              const expanded = expandedFloorId === floor.id;
              return (
                <section
                  key={floor.id}
                  className={`floor-section ${expanded ? 'expanded' : ''}`}
                >
                  <header>
                    <span className="floor-icon" aria-hidden="true">
                      <Building2 />
                    </span>
                    <label>
                      <Input
                        aria-label={`Rename ${floor.name}`}
                        value={floor.name}
                        onChange={(e) =>
                          update((q) => ({
                            ...q,
                            floors: (q.floors ?? []).map((x) =>
                              x.id === floor.id
                                ? { ...x, name: e.target.value }
                                : x,
                            ),
                          }))
                        }
                      />
                      <small>
                        {floorRooms.length}{' '}
                        {floorRooms.length === 1 ? 'space' : 'spaces'}
                      </small>
                    </label>
                    {s.canManageFinancials && (
                      <strong>{inr(floorTotal)}</strong>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      onClick={() =>
                        setExpandedFloorId(expanded ? '' : floor.id)
                      }
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${floor.name}`}
                      aria-expanded={expanded}
                    >
                      {expanded ? <ChevronUp /> : <ChevronDown />}
                    </Button>
                    <Button
                      className="floor-action-mark"
                      variant="ghost"
                      size="icon-lg"
                      onClick={() =>
                        setFloorMenuId(floorMenuId === floor.id ? '' : floor.id)
                      }
                      aria-label={`Actions for ${floor.name}`}
                      aria-expanded={floorMenuId === floor.id}
                    >
                      <MoreVertical />
                    </Button>
                    <div
                      className={`floor-actions ${floorMenuId === floor.id ? 'open' : ''}`}
                    >
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        disabled={!index}
                        onClick={() =>
                          update((q) => {
                            const next = [...(q.floors ?? [])];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            return { ...q, floors: next };
                          })
                        }
                        aria-label={`Move ${floor.name} up`}
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        disabled={index === projectFloors.length - 1}
                        onClick={() =>
                          update((q) => {
                            const next = [...(q.floors ?? [])];
                            [next[index + 1], next[index]] = [
                              next[index],
                              next[index + 1],
                            ];
                            return { ...q, floors: next };
                          })
                        }
                        aria-label={`Move ${floor.name} down`}
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        disabled={projectFloors.length === 1}
                        onClick={() => {
                          const count = floorRooms.reduce(
                            (sum, space) => sum + space.items.length,
                            0,
                          );
                          if (
                            count &&
                            !window.confirm(
                              `Delete ${floor.name} and ${count} BOQ items?`,
                            )
                          )
                            return;
                          update((q) => ({
                            ...q,
                            floors: (q.floors ?? []).filter(
                              (x) => x.id !== floor.id,
                            ),
                            rooms: q.rooms.filter(
                              (space) => space.floorId !== floor.id,
                            ),
                          }));
                        }}
                        aria-label={`Delete ${floor.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </header>
                  {expanded && (
                    <div className="floor-spaces">
                      {floorRooms.map((space) => (
                        <div className="structure-space-row" key={space.id}>
                          <span className="space-icon" aria-hidden="true">
                            <DoorOpen />
                          </span>
                          <label>
                            <Input
                              aria-label={`Rename ${space.name}`}
                              value={space.name}
                              onChange={(e) =>
                                update((q) => ({
                                  ...q,
                                  rooms: q.rooms.map((x) =>
                                    x.id === space.id
                                      ? { ...x, name: e.target.value }
                                      : x,
                                  ),
                                }))
                              }
                            />
                            <small>
                              {space.items.length}{' '}
                              {space.items.length === 1 ? 'item' : 'items'}
                            </small>
                          </label>
                          {s.canManageFinancials && (
                            <strong>
                              {inr(roomTotal(space, p.defaultTier))}
                            </strong>
                          )}
                          <select
                            aria-label={`Move ${space.name} to another floor`}
                            value={space.floorId}
                            onChange={(e) =>
                              update((q) => ({
                                ...q,
                                rooms: q.rooms.map((x) =>
                                  x.id === space.id
                                    ? { ...x, floorId: e.target.value }
                                    : x,
                                ),
                              }))
                            }
                          >
                            {projectFloors.map((x) => (
                              <option value={x.id} key={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="icon-lg"
                            onClick={() => {
                              if (
                                space.items.length &&
                                !window.confirm(
                                  `Delete ${space.name} and its ${space.items.length} BOQ items?`,
                                )
                              )
                                return;
                              void s.deleteRoom(p.id, space.id);
                            }}
                            aria-label={`Delete ${space.name}`}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      ))}
                      <button
                        className="add-space-to-floor"
                        onClick={() => addSpaceToFloor(floor.id, floor.name)}
                      >
                        <Plus /> Add space to {floor.name}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <div className="actions structure-actions">
            <Button
              variant="outline"
              onClick={() => {
                const name = window.prompt('New floor name');
                if (name?.trim())
                  update((q) => ({
                    ...q,
                    floors: [
                      ...(q.floors ?? []),
                      { id: uid(), name: name.trim() },
                    ],
                  }));
              }}
            >
              <Plus /> Add floor
            </Button>
            <Button onClick={() => setStructureModal(false)}>Done</Button>
          </div>
        </Modal>
      )}
      {itemModal && room && (
        <Modal
          title={
            itemParentId
              ? `Add a component to ${room.items.find((item) => item.id === itemParentId)?.name ?? 'group'}`
              : 'Add an item'
          }
          close={() => {
            setItemModal(false);
            setItemParentId(null);
          }}
        >
          <div className="picker">
            {!itemParentId && (
              <button
                className="composite-picker"
                onClick={() => {
                  setItemModal(false);
                  setGroupName('');
                  setGroupQuantity(1);
                  setGroupUnit('Nos');
                  setGroupModal(true);
                }}
              >
                <strong>Group / composite item</strong>
                <small>One commercial scope made from separately priced components</small>
              </button>
            )}
            {s.rates.map((r) => (
              <button
                key={r.id}
                onClick={() => addPickedItem(r)}
              >
                <strong>{r.name}</strong>
                <small>{r.description}</small>
                {s.canManageFinancials && (
                  <span>
                    {inr(r.rates[p.defaultTier])} / {r.unit}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => addPickedItem()}
            >
              <strong>Custom item</strong>
              <small>Project-specific scope</small>
            </button>
          </div>
        </Modal>
      )}
      {groupModal && room && (
        <Modal
          title="Create a grouped BOQ item"
          subtitle="Create one scope with independently priced components."
          className="edit-group-modal"
          close={() => setGroupModal(false)}
        >
          <form
            className="edit-group-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!groupName.trim()) return;
              const descriptionValue = new FormData(event.currentTarget).get('description');
              const parent: QuoteItem = {
                ...fresh(),
                itemType: 'composite',
                childrenOrder: [],
                name: groupName.trim(),
                description:
                  typeof descriptionValue === 'string' ? descriptionValue : '',
                workType:
                  selectedWorkType === 'All' ? 'Other' : selectedWorkType,
                quantity: groupQuantity,
                unit: groupUnit,
                measurementType: measurementForUnit(groupUnit),
                measureMode: 'quantity',
                rates: { standard: 0, premium: 0, luxury: 0 },
                subUnits: [],
              };
              update((q) => ({
                ...q,
                rooms: q.rooms.map((candidate) =>
                  candidate.id === room.id
                    ? { ...candidate, items: [...candidate.items, parent] }
                    : candidate,
                ),
              }));
              setGroupModal(false);
              setGroupName('');
            }}
          >
            <div className="edit-group-scroll">
              <div className="form-grid single-column">
                <label htmlFor="composite-group-name">
                  Group name
                  <Input
                    id="composite-group-name"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Kitchen cabinets"
                  />
                </label>
                <label htmlFor="composite-group-description">
                  Description
                  <textarea
                    id="composite-group-description"
                    name="description"
                    placeholder="Describe the complete commercial scope"
                  />
                </label>
                <div className="group-measure-fields">
                  <label>
                    Overall quantity
                    <Num
                      value={groupQuantity}
                      onChange={setGroupQuantity}
                    />
                  </label>
                  <label htmlFor="composite-group-unit">
                    Overall unit
                    <select
                      id="composite-group-unit"
                      value={groupUnit}
                      onChange={(event) =>
                        setGroupUnit(event.target.value as BoqUnit)
                      }
                    >
                      {BOQ_UNITS.map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
            <div className="actions edit-group-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGroupModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!groupName.trim()}>
                Create group
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {s.canManageFinancials && compare && (
        <Compare p={p} close={() => setCompare(false)} />
      )}
      {renameModal && (
        <Modal title="Edit project details" close={() => setRenameModal(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const name = renameValue.trim();
              if (!name) return;
              update((q) => ({
                ...q,
                propertyName: name,
                clientName: String(form.get('clientName') ?? ''),
                propertyType: String(form.get('propertyType') ?? ''),
                layout: String(form.get('layout') ?? ''),
                location: String(form.get('location') ?? ''),
                carpetArea: Number(form.get('carpetArea')) || 0,
                notes: String(form.get('notes') ?? ''),
              }));
              setRenameModal(false);
            }}
          >
            <div className="form-grid">
              <label>
                Property name
                <Input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
              </label>
              <label>
                Client
                <Input name="clientName" defaultValue={p.clientName} />
              </label>
              <label>
                Property type
                <Input name="propertyType" defaultValue={p.propertyType} />
              </label>
              <label>
                Layout / BHK
                <Input name="layout" defaultValue={p.layout} />
              </label>
              <label>
                Location
                <Input name="location" defaultValue={p.location} />
              </label>
              <label>
                Carpet area (sq.ft)
                <Input
                  name="carpetArea"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={p.carpetArea}
                />
              </label>
              <label className="wide">
                Project notes
                <textarea name="notes" defaultValue={p.notes} />
              </label>
            </div>
            <div className="actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()}>
                Save name
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {s.canManageFinancials && assignmentModal && s.user && (
        <ProjectAssignments
          user={s.user}
          projectId={p.id}
          close={() => setAssignmentModal(false)}
        />
      )}
      {revisionModal && (
        <Modal
          title="Save revision"
          className="save-revision-modal"
          close={() => {
            if (!revisionSaving) setRevisionModal(false);
          }}
        >
          <form
            className="revision-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setRevisionSaving(true);
              try {
                await saveRev(revisionNote);
              } catch {
                // Keep the modal open so the message can be retried.
              } finally {
                setRevisionSaving(false);
              }
            }}
          >
            <div className="form-grid single-column">
              <label>
                <span className="revision-field-label">
                  Revision name / message <em>(optional)</em>
                </span>
                <Input
                  autoFocus
                  disabled={revisionSaving}
                  value={revisionNote}
                  onChange={(event) => setRevisionNote(event.target.value)}
                  placeholder="Completed electrical pricing for first floor"
                />
              </label>
            </div>
            <div className="actions">
              <Button
                type="button"
                variant="outline"
                disabled={revisionSaving}
                onClick={() => setRevisionModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={revisionSaving}>
                <Save />
                {revisionSaving ? 'Saving…' : 'Save revision'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {s.canManageFinancials && deleteProject && (
        <Modal title="Delete project" close={() => setDeleteProject(false)}>
          <div className="delete-confirm">
            <Trash2 />
            <div>
              <strong>
                Are you sure you want to delete “{p.propertyName}”?
              </strong>
              <p>
                This removes the project and its saved revisions from this
                device. This cannot be undone.
              </p>
            </div>
          </div>
          <div className="actions">
            <Button variant="outline" onClick={() => setDeleteProject(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void s.deleteProject(p.id);
                s.setRevisions(
                  s.revisions.filter((revision) => revision.projectId !== p.id),
                );
                go('/projects');
              }}
            >
              Delete project
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Num({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [focused, value]);

  return (
    <Input
      type="number"
      min="0"
      step="any"
      value={focused ? draft : value}
      onFocus={(event) => {
        setFocused(true);
        setDraft(String(value));
        if (value === 0) {
          const input = event.currentTarget;
          window.requestAnimationFrame(() => input.select());
        }
      }}
      onPointerUp={(event) => {
        if (Number(event.currentTarget.value) !== 0) return;
        event.preventDefault();
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (next === '') {
          onChange(0);
          return;
        }
        const parsed = Number(next);
        if (Number.isFinite(parsed)) onChange(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        if (draft === '' || !Number.isFinite(Number(draft))) {
          setDraft('0');
          onChange(0);
          return;
        }
        setDraft(String(Number(draft)));
      }}
    />
  );
}
function itemMeasureLabel(item: QuoteItem) {
  const quantity = itemMeasure(item).toLocaleString('en-IN', {
    maximumFractionDigits: 3,
  });
  return `${quantity} ${item.customUnit || item.unit || unitForMeasurement(item.measurementType)}`;
}
function CompositeItem({
  item,
  room,
  p,
  canManageFinancials,
  patch,
  addChild,
  remove,
  children,
}: {
  item: QuoteItem;
  room: Room;
  p: Project;
  canManageFinancials: boolean;
  patch: (change: Partial<QuoteItem>) => Promise<void>;
  addChild: () => void;
  remove: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [draft, setDraft] = useState({
    name: item.name,
    description: item.description,
    workType: item.workType ?? 'Other',
    notes: item.notes,
    quantity: item.quantity,
    unit: item.unit ?? unitForMeasurement(item.measurementType),
  });
  const components = orderedCompositeChildren(room, item);
  const openEditor = () => {
    setDraft({
      name: item.name,
      description: item.description,
      workType: item.workType ?? 'Other',
      notes: item.notes,
      quantity: item.quantity,
      unit: item.unit ?? unitForMeasurement(item.measurementType),
    });
    setSaveError('');
    setEditing(true);
  };
  const dirty =
    draft.name !== item.name ||
    draft.description !== item.description ||
    draft.workType !== (item.workType ?? 'Other') ||
    draft.notes !== item.notes ||
    draft.quantity !== item.quantity ||
    draft.unit !== (item.unit ?? unitForMeasurement(item.measurementType));
  const requestClose = () => {
    if (saving) return;
    if (dirty && !window.confirm('Discard changes?')) return;
    setEditing(false);
  };
  return (
    <section className="composite-item">
      <header>
        <button
          type="button"
          className="composite-toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown /> : <ChevronRight />}
          <span>
            <strong>{item.name}</strong>
            <small>
              {components.length} {components.length === 1 ? 'component' : 'components'}
            </small>
            <small className="composite-measure">{itemMeasureLabel(item)}</small>
          </span>
        </button>
        {canManageFinancials && (
          <strong className="composite-total">
            {inr(compositeTotal(item, room, p.defaultTier))}
          </strong>
        )}
        <Button variant="outline" className="edit-item composite-edit" onClick={openEditor}>
          Edit group
        </Button>
        <div className="item-actions-wrap composite-delete">
          <Button variant="ghost" size="icon-lg" onClick={remove} aria-label={`Delete ${item.name}`}>
            <Trash2 />
          </Button>
        </div>
      </header>
      {item.description && (
        <p className="composite-description">{item.description}</p>
      )}
      {expanded && (
        <div className="composite-children">
          {children}
          <Button variant="outline" className="add-component" onClick={addChild}>
            <Plus /> Add component
          </Button>
        </div>
      )}
      {editing && (
        <Modal
          title="Edit group"
          subtitle="Update the grouped scope without changing component pricing."
          className="edit-group-modal"
          close={requestClose}
        >
          <form
            className="edit-group-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.name.trim() || saving) return;
              setSaving(true);
              setSaveError('');
              try {
                await patch({
                  name: draft.name.trim(),
                  description: draft.description,
                  workType: draft.workType,
                  notes: draft.notes,
                  quantity: draft.quantity,
                  unit: draft.unit,
                  measurementType: measurementForUnit(draft.unit),
                  measureMode: 'quantity',
                });
                setEditing(false);
              } catch (cause) {
                setSaveError(
                  cause instanceof Error
                    ? cause.message
                    : 'Could not save this group. Please try again.',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="edit-group-scroll">
            <div className="form-grid single-column">
              <label htmlFor={`edit-group-name-${item.id}`}>
                Group name
                <Input
                  id={`edit-group-name-${item.id}`}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label htmlFor={`edit-group-description-${item.id}`}>
                Description
                <textarea
                  id={`edit-group-description-${item.id}`}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <label htmlFor={`edit-group-work-type-${item.id}`}>
                Work type
                <select
                  id={`edit-group-work-type-${item.id}`}
                  value={draft.workType}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      workType: event.target.value,
                    }))
                  }
                >
                  {WORK_TYPES.map((entry) => (
                    <option key={entry}>{entry}</option>
                  ))}
                </select>
              </label>
              <div className="group-measure-fields">
                <label>
                  Overall quantity
                  <Num
                    value={draft.quantity}
                    onChange={(quantity) =>
                      setDraft((current) => ({ ...current, quantity }))
                    }
                  />
                </label>
                <label htmlFor={`edit-group-unit-${item.id}`}>
                  Overall unit
                  <select
                    id={`edit-group-unit-${item.id}`}
                    value={draft.unit}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        unit: event.target.value as BoqUnit,
                      }))
                    }
                  >
                    {BOQ_UNITS.map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label htmlFor={`edit-group-notes-${item.id}`}>
                Notes
                <textarea
                  id={`edit-group-notes-${item.id}`}
                  value={draft.notes}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <p className="group-rate-note">
              A group has no editable rate. Its total is calculated from its
              components.
            </p>
            {saveError && <p className="edit-group-error" role="alert">{saveError}</p>}
            </div>
            <div className="actions edit-group-actions">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!draft.name.trim() || saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
function Item({
  item,
  p,
  canManageFinancials,
  showWorkType,
  currentRoomId,
  editing,
  setEditing,
  patch,
  duplicate,
  remove,
  move,
  order,
}: {
  item: QuoteItem;
  p: Project;
  canManageFinancials: boolean;
  showWorkType: boolean;
  currentRoomId: string;
  editing: boolean;
  setEditing: (value: boolean) => void;
  patch: (x: Partial<QuoteItem>) => void;
  duplicate: () => void;
  remove: () => void;
  move?: (x: string) => void;
  order: (d: number) => void;
}) {
  const [more, setMore] = useState(false),
    [menuCompact, setMenuCompact] = useState(false),
    menuAnchorRef = useRef<HTMLDivElement>(null),
    menuPanelRef = useRef<HTMLDivElement>(null),
    [menuPosition, setMenuPosition] = useState<{
      left: number;
      width: number;
      maxHeight: number;
      top?: number;
      bottom?: number;
    } | null>(null),
    rate = itemBaseRate(item, p.defaultTier),
    total = itemTotal(item, p.defaultTier),
    savings = itemSavings(item, p.defaultTier),
    quantityKind =
      item.measureMode === 'dimensions'
        ? 'dimensions'
        : item.unit === 'Sq.ft' ||
            item.unit === 'Sq.m' ||
            item.unit === 'Sq.yd' ||
            item.unit === 'Sq.in'
          ? 'area'
          : item.unit === 'Nos'
            ? 'nos'
            : 'other';
  useEffect(() => {
    if (!more) return;
    const resetMenuScroll = window.requestAnimationFrame(() => {
      menuPanelRef.current?.scrollTo({ top: 0 });
    });
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuAnchorRef.current?.contains(target) &&
        !menuPanelRef.current?.contains(target)
      )
        setMore(false);
    };
    const closeForViewportChange = () => setMore(false);
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', closeForViewportChange);
    window.addEventListener('scroll', closeForViewportChange, true);
    return () => {
      window.cancelAnimationFrame(resetMenuScroll);
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', closeForViewportChange);
      window.removeEventListener('scroll', closeForViewportChange, true);
    };
  }, [more]);
  return (
    <article className={'item ' + (!item.enabled ? 'off' : '')}>
      <header onClick={() => !editing && setEditing(true)}>
        <div className="item-title">
          <figure className="item-image">
            <img src={itemImage(item.name)} alt="" aria-hidden="true" />
          </figure>
          {canManageFinancials && (
            <Switch
              checked={item.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              onClick={(event) => event.stopPropagation()}
            />
          )}
          <span className="item-copy">
            <strong>{item.name}</strong>
            {showWorkType && (
              <span className="item-work-type">{item.workType ?? 'Other'}</span>
            )}
            <small>{item.description || 'No description'}</small>
            <span className="item-measure-summary">
              {itemMeasureLabel(item)}
            </span>
          </span>
        </div>
        {canManageFinancials && (
          <span className="item-total">
            <strong>{inr(total)}</strong>
            {savings > 0 && <small>You save {inr(savings)}</small>}
          </span>
        )}
        <Button
          variant={editing ? 'secondary' : 'outline'}
          className="edit-item"
          onClick={(event) => {
            event.stopPropagation();
            setEditing(!editing);
          }}
        >
          {editing ? 'Done' : 'Edit'}
        </Button>
        <div className="item-actions-wrap" ref={menuAnchorRef}>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={(event) => {
              event.stopPropagation();
              if (more) {
                setMore(false);
                return;
              }

              const anchor = event.currentTarget.getBoundingClientRect();
              const margin = 12;
              const gap = 7;
              const compact = window.innerWidth <= 560;
              const width = Math.min(244, window.innerWidth - margin * 2);
              setMenuCompact(compact);

              if (compact) {
                setMenuPosition({
                  left: margin,
                  bottom: margin,
                  width,
                  maxHeight: window.innerHeight - margin * 2,
                });
              } else {
                const spaceBelow =
                  window.innerHeight - anchor.bottom - gap - margin;
                const spaceAbove = anchor.top - gap - margin;
                const opensUp = spaceBelow < 320 && spaceAbove > spaceBelow;
                const availableSpace = opensUp ? spaceAbove : spaceBelow;

                setMenuPosition({
                  left: Math.min(
                    Math.max(margin, anchor.right - width),
                    window.innerWidth - margin - width,
                  ),
                  ...(opensUp
                    ? { bottom: window.innerHeight - anchor.top + gap }
                    : { top: anchor.bottom + gap }),
                  width,
                  maxHeight: Math.max(120, Math.min(360, availableSpace)),
                });
              }
              setMore(true);
            }}
            aria-label={`Actions for ${item.name}`}
            aria-expanded={more}
          >
            <MoreHorizontal />
          </Button>
          {more &&
            menuPosition &&
            typeof document !== 'undefined' &&
            createPortal(
              <>
                {menuCompact && (
                  <button
                    type="button"
                    className="item-menu-scrim"
                    aria-label="Close item actions"
                    onClick={() => setMore(false)}
                  />
                )}
                <div
                  ref={menuPanelRef}
                  className="context-menu item-context-menu item-context-menu-portal"
                  role="menu"
                  style={menuPosition}
                >
                  <div className="item-menu-heading">
                    <strong>Item actions</strong>
                    <button
                      type="button"
                      aria-label="Close item actions"
                      onClick={() => setMore(false)}
                    >
                      <X />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      duplicate();
                      setMore(false);
                    }}
                  >
                    <Copy /> Duplicate here
                  </Button>
                  {move && (
                    <label>
                      Move to room
                      <select
                      defaultValue=""
                      onChange={(event) => {
                        if (event.target.value) move(event.target.value);
                        setMore(false);
                      }}
                    >
                      <option value="" disabled>
                        Select room…
                      </option>
                      {p.rooms
                        .filter((room) => room.id !== currentRoomId)
                        .map((room) => (
                          <option value={room.id} key={room.id}>
                            {room.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {canManageFinancials && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        patch({ enabled: !item.enabled });
                        setMore(false);
                      }}
                    >
                      {item.enabled ? 'Disable item' : 'Enable item'}
                    </Button>
                  )}
                  <div className="menu-order">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        order(-1);
                        setMore(false);
                      }}
                    >
                      <ChevronUp /> Up
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        order(1);
                        setMore(false);
                      }}
                    >
                      <ChevronDown /> Down
                    </Button>
                  </div>
                  <span className="menu-separator" />
                  <Button
                    variant="destructive"
                    onClick={() => {
                      remove();
                      setMore(false);
                    }}
                  >
                    <Trash2 /> Delete item
                  </Button>
                </div>
              </>,
              document.body,
            )}
        </div>
      </header>
      {editing && (
        <div className="item-editor">
          <div className="identity-fields">
            <label>
              Name
              <Input
                value={item.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={item.description}
                placeholder="Add description"
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
          </div>
          <div className="item-detail-grid">
            <label>
              Work type
              <select
                value={item.workType ?? 'Other'}
                onChange={(e) => patch({ workType: e.target.value })}
              >
                {WORK_TYPES.map((workType) => (
                  <option key={workType}>{workType}</option>
                ))}
              </select>
            </label>
          </div>
          <section
            className="quantity-editor"
            aria-labelledby={`quantity-${item.id}`}
          >
            <header>
              <div>
                <strong id={`quantity-${item.id}`}>
                  Quantity &amp; dimensions
                </strong>
                <small>
                  This quantity is used everywhere, including Excel.
                </small>
              </div>
              <output>{itemMeasureLabel(item)}</output>
            </header>
            <div className="quantity-grid">
              <label>
                Quantity type
                <select
                  value={quantityKind}
                  onChange={(event) => {
                    if (event.target.value === 'dimensions') {
                      patch({
                        measureMode: 'dimensions',
                        unit: 'Sq.ft',
                        measurementType: 'sqft',
                      });
                    } else if (event.target.value === 'area') {
                      patch({
                        measureMode: 'quantity',
                        unit: 'Sq.ft',
                        measurementType: 'sqft',
                      });
                    } else if (event.target.value === 'nos') {
                      patch({
                        measureMode: 'quantity',
                        unit: 'Nos',
                        measurementType: 'quantity',
                      });
                    } else {
                      patch({
                        measureMode: 'quantity',
                        unit: 'Custom',
                        measurementType: 'quantity',
                      });
                    }
                  }}
                >
                  <option value="dimensions">Dimensions</option>
                  <option value="area">Total area</option>
                  <option value="nos">Nos</option>
                  <option value="other">Other unit</option>
                </select>
              </label>
              {quantityKind === 'dimensions' ? (
                <>
                  <label>
                    Result unit
                    <select
                      value={item.unit ?? 'Sq.ft'}
                      onChange={(event) => {
                        const unit = event.target.value as BoqUnit;
                        patch({
                          unit,
                          measurementType: measurementForUnit(unit),
                        });
                      }}
                    >
                      <option>Sq.ft</option>
                      <option>Sq.m</option>
                      <option>R.ft</option>
                      <option>R.m</option>
                    </select>
                  </label>
                  <label>
                    Dimension unit
                    <select
                      value={item.dimensionUnit ?? 'ft'}
                      onChange={(event) =>
                        patch({
                          dimensionUnit: event.target
                            .value as QuoteItem['dimensionUnit'],
                        })
                      }
                    >
                      {['mm', 'cm', 'ft', 'm'].map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Length
                    <Num
                      value={item.length}
                      onChange={(length) => patch({ length })}
                    />
                  </label>
                  {(item.unit === 'Sq.ft' ||
                    item.unit === 'Sq.m' ||
                    item.measurementType === 'sqft') && (
                    <label>
                      Height
                      <Num
                        value={item.width}
                        onChange={(width) => patch({ width })}
                      />
                    </label>
                  )}
                  <div className="calculated-quantity">
                    <span>Calculated quantity</span>
                    <strong>{itemMeasureLabel(item)}</strong>
                  </div>
                </>
              ) : (
                <>
                  {quantityKind === 'area' && (
                    <label>
                      Area unit
                      <select
                        value={item.unit ?? 'Sq.ft'}
                        onChange={(event) =>
                          patch({
                            unit: event.target.value as BoqUnit,
                            measurementType: 'sqft',
                          })
                        }
                      >
                        {['Sq.ft', 'Sq.m', 'Sq.yd', 'Sq.in'].map((unit) => (
                          <option key={unit}>{unit}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {quantityKind === 'other' && (
                    <>
                      <label>
                        Unit
                        <select
                          value={
                            item.unit ??
                            unitForMeasurement(item.measurementType)
                          }
                          onChange={(event) => {
                            const unit = event.target.value as BoqUnit;
                            patch({
                              unit,
                              measurementType: measurementForUnit(unit),
                            });
                          }}
                        >
                          {BOQ_UNITS.filter(
                            (unit) =>
                              ![
                                'Nos',
                                'Sq.ft',
                                'Sq.m',
                                'Sq.yd',
                                'Sq.in',
                              ].includes(unit),
                          ).map((unit) => (
                            <option key={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      {item.unit === 'Custom' && (
                        <label>
                          Custom unit
                          <Input
                            value={item.customUnit ?? ''}
                            onChange={(event) =>
                              patch({ customUnit: event.target.value })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                  <label>
                    {quantityKind === 'area' ? 'Total area' : 'Quantity'}
                    <Num
                      value={item.quantity}
                      onChange={(quantity) => patch({ quantity })}
                    />
                  </label>
                </>
              )}
            </div>
          </section>
          {canManageFinancials && (
            <section
              className="pricing-editor"
              aria-labelledby={`price-${item.id}`}
            >
              <header>
                <div>
                  <strong id={`price-${item.id}`}>Price</strong>
                  <small>Set the price for each recorded unit.</small>
                </div>
                <output>{inr(total)}</output>
              </header>
              <div className="pricing-grid">
                <label>
                  Calculation
                  <select
                    value={item.pricingMode ?? 'unit'}
                    onChange={(e) =>
                      patch({
                        pricingMode: e.target.value as QuoteItem['pricingMode'],
                      })
                    }
                  >
                    <option value="unit">Quantity × rate</option>
                    <option value="lump-sum">Flat total</option>
                  </select>
                </label>
                <label>
                  {item.pricingMode === 'lump-sum'
                    ? 'Flat amount'
                    : `Rate per ${item.customUnit || item.unit || item.measurementType}`}
                  <Num
                    value={rate}
                    onChange={(v) => patch({ rateOverride: v })}
                  />
                  {item.rateCardId && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        patch({
                          rateSource: 'template',
                          rateOverride: undefined,
                        })
                      }
                    >
                      Use master rate
                    </Button>
                  )}
                </label>
                <div className="price-formula">
                  <span>
                    {item.pricingMode === 'lump-sum'
                      ? `Flat amount ${inr(rate)}`
                      : `${itemMeasure(item).toLocaleString('en-IN')} ${
                          item.customUnit || item.unit || item.measurementType
                        } × ${inr(rate)}`}
                    {item.discount > 0 ? ` − ${inr(item.discount)}` : ''}
                  </span>
                  <strong>{inr(total)}</strong>
                </div>
              </div>
              <details className="advanced-pricing">
                <summary>More pricing options</summary>
                <div>
                  <label>
                    Discount
                    <Num
                      value={item.discount}
                      onChange={(discount) => patch({ discount })}
                    />
                  </label>
                </div>
              </details>
            </section>
          )}
          <label className="item-notes">
            HSN code
            <Input
              value={item.hsnCode ?? ''}
              onChange={(event) => patch({ hsnCode: event.target.value })}
            />
          </label>
          <label className="item-notes">
            Notes
            <textarea
              value={item.notes}
              placeholder="Installation, finish or scope notes"
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </label>
          {canManageFinancials && savings > 0 && (
            <div className="rate-saving savings-only">
              <span>
                You save <strong>{inr(savings)}</strong>
              </span>
            </div>
          )}
          <div className="editor-actions">
            <span>Changes are shared with everyone using this site.</span>
            <Button onClick={() => setEditing(false)}>Done editing</Button>
          </div>
        </div>
      )}
    </article>
  );
}
function Line({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note?: string;
}) {
  return (
    <div className="line">
      <span>
        {label}
        {note && <small>{note}</small>}
      </span>
      <strong>{inr(value)}</strong>
    </div>
  );
}
function Summary({
  p,
  update,
  open,
  close,
  preview,
  download,
}: {
  p: Project;
  update: (f: (p: Project) => Project) => void;
  open: boolean;
  close: () => void;
  preview: () => void;
  download: () => void;
}) {
  const t = quoteTotals(p);
  return (
    <aside className={`summary ${open ? 'panel-open' : 'panel-closed'}`}>
      <header>
        <div className="summary-kicker">
          <small>QUOTATION SUMMARY</small>
          <button onClick={close} aria-label="Hide quotation summary">
            <X />
          </button>
        </div>
        <span>FINAL TOTAL</span>
        <h2>{inr(t.grandTotal)}</h2>
        {t.savings > 0 && (
          <p className="total-savings">You saved {inr(t.savings)}</p>
        )}
      </header>
      <div className="room-breakdown">
        {p.rooms.map((room) => (
          <Line
            key={room.id}
            label={room.name}
            value={roomTotal(room, p.defaultTier)}
          />
        ))}
      </div>
      <section className="summary-totals">
        <Line label="Order total" value={t.interior} />
        {t.fees.map((fee) => (
          <Line
            key={fee.id}
            label={fee.name}
            value={fee.total}
            note={
              fee.method === 'sqft'
                ? `${inr(fee.value)}/sqft`
                : fee.method === 'percentage'
                  ? `${fee.value}% of interior work`
                  : 'Custom amount'
            }
          />
        ))}
      </section>
      <details className="quotation-adjustments">
        <summary>Quotation adjustments</summary>
        <label>
          Flat discount{' '}
          <Num
            value={p.projectDiscount}
            onChange={(value) =>
              update((project) => ({ ...project, projectDiscount: value }))
            }
          />
        </label>
        <small>Kept internal and not itemised on the client quotation.</small>
      </details>
      <footer>
        <span>Grand total</span>
        <strong>{inr(t.grandTotal)}</strong>
      </footer>
      <div className="summary-actions">
        <Button variant="outline" onClick={preview}>
          <ReceiptText />
          View full quotation
        </Button>
        <Button variant="ghost" onClick={download}>
          <Download />
          Download summary
        </Button>
      </div>
    </aside>
  );
}
function Compare({ p, close }: { p: Project; close: () => void }) {
  const vals = (['standard', 'premium', 'luxury'] as Tier[]).map((t) => ({
    t,
    v: quoteTotals(p, t).grandTotal,
  }));
  return (
    <Modal title="Tier investment comparison" close={close}>
      <p>See the incremental investment to upgrade the full project.</p>
      <div className="compare">
        {vals.map((x, i) => (
          <article className={x.t === p.defaultTier ? 'current' : ''} key={x.t}>
            <span>{tl(x.t)}</span>
            <strong>{inr(x.v)}</strong>
            <small>
              {i
                ? `+${inr(x.v - vals[i - 1].v)} from ${tl(vals[i - 1].t)}`
                : 'Base investment'}
            </small>
          </article>
        ))}
      </div>
    </Modal>
  );
}
function Preview({ s }: { s: Store }) {
  const { id } = useParams(),
    go = useNavigate(),
    p = s.projects.find((x) => x.id === id);
  if (!p) return <Navigate to="/projects" />;
  const t = quoteTotals(p),
    toggle = () =>
      s.setProjects(
        s.projects.map((x) =>
          x.id === id ? { ...x, showRates: !x.showRates } : x,
        ),
      );
  async function excel() {
    await exportProjectExcel(p!, s.settings);
  }
  return (
    <div className="preview">
      <div className="preview-bar">
        <Button variant="ghost" onClick={() => go(`/projects/${id}`)}>
          ← Back to builder
        </Button>
        <label>
          Show rates <Switch checked={p.showRates} onCheckedChange={toggle} />
        </label>
        <Button variant="outline" onClick={excel}>
          <FileSpreadsheet />
          Export Excel
        </Button>
        <Button onClick={() => void exportQuotationPdf(p)}>
          <Printer />
          Print / Save PDF
        </Button>
      </div>
      <article className="document">
        <header>
          <b>ND</b>
          <div>
            <span>QUOTATION</span>
            <strong>{s.settings.letterheadName}</strong>
            <small>{s.settings.tagline}</small>
          </div>
          <aside>
            {new Date().toLocaleDateString('en-IN')}
            <small>QT-{p.id.slice(0, 6).toUpperCase()}</small>
          </aside>
        </header>
        <section className="client">
          <div>
            <span>PREPARED FOR</span>
            <strong>{p.clientName}</strong>
            <small>{p.propertyName}</small>
          </div>
          <div>
            <span>PROJECT</span>
            <strong>
              {p.layout} · {p.carpetArea.toLocaleString('en-IN')} sqft
            </strong>
            <small>{tl(p.defaultTier)} specification</small>
          </div>
        </section>
        {p.rooms.map((r) => (
          <section className="quote-room" key={r.id}>
            <header>
              <strong>{r.name}</strong>
              <b>{inr(roomTotal(r, p.defaultTier))}</b>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Scope item</th>
                  <th>Measurement</th>
                  {p.showRates && <th className="num">Rate</th>}
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {r.items
                  .filter((i) => i.enabled && !isCompositeItem(i))
                  .map((i) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.name}</strong>
                        <small>{i.description}</small>
                        {i.discount > 0 && (
                          <em>Special discount -{inr(i.discount)}</em>
                        )}
                      </td>
                      <td>
                        {itemMeasure(i).toLocaleString('en-IN')}{' '}
                        {i.measurementType}
                      </td>
                      {p.showRates && (
                        <td className="num">
                          {inr(itemBaseRate(i, p.defaultTier))}
                        </td>
                      )}
                      <td className="num">
                        <strong>{inr(itemTotal(i, p.defaultTier))}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
        <section className="quote-total">
          <div>
            {t.fees.map((f) => (
              <Line key={f.id} label={f.name} value={f.total} />
            ))}
          </div>
          <div>
            <Line label="Interior work" value={t.interior} />
            <Line label="Subtotal" value={t.subtotal} />
            <p>
              <span>GRAND TOTAL</span>
              <strong>{inr(t.grandTotal)}</strong>
            </p>
          </div>
        </section>
        <footer>
          <div>
            <span>TERMS & CONDITIONS</span>
            <p>{s.settings.terms}</p>
          </div>
          <aside>
            <strong>{s.settings.thankYou}</strong>
            <small>
              {s.settings.website} · {s.settings.email}
            </small>
          </aside>
        </footer>
      </article>
    </div>
  );
}

type ProjectRateRow = {
  key: string;
  room: Room;
  floorName: string;
  item: QuoteItem;
  hasTemplate: boolean;
  parent?: QuoteItem;
};

function ProjectRates({ s }: { s: Store }) {
  const { id } = useParams(),
    go = useNavigate(),
    project = s.projects.find((entry) => entry.id === id),
    [search, setSearch] = useState(''),
    [workType, setWorkType] = useState('All'),
    [floor, setFloor] = useState('All'),
    [space, setSpace] = useState('All'),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [modeDrafts, setModeDrafts] = useState<
      Record<string, QuoteItem['pricingMode']>
    >({}),
    [pending, setPending] = useState<Set<string>>(new Set()),
    [failed, setFailed] = useState<Set<string>>(new Set()),
    [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set()),
    timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}),
    pendingKeys = useRef(new Set<string>()),
    rateInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(
    () => () =>
      Object.values(timers.current).forEach((timer) => clearTimeout(timer)),
    [],
  );

  if (!project) return <Navigate to="/projects" />;
  const floorNames = new Map(
    (project.floors ?? []).map((entry) => [entry.id, entry.name]),
  );
  const rows: ProjectRateRow[] = project.rooms.flatMap((room) =>
    orderedPriceableItems(room)
      .map((item) => ({
      key: `${room.id}:${item.id}`,
      room,
      floorName: floorNames.get(room.floorId ?? '') ?? 'Unassigned',
      item,
      parent: item.parentItemId
        ? room.items.find(
            (candidate) =>
              candidate.id === item.parentItemId && isCompositeItem(candidate),
          )
        : undefined,
      hasTemplate: Boolean(resolveTemplate(item, s.rates)),
      })),
  );
  const workTypes = [
    ...new Set(rows.map((row) => row.item.workType ?? 'Other')),
  ].sort();
  const floors = [...new Set(rows.map((row) => row.floorName))].sort();
  const spaces = [
    ...new Set(
      rows
        .filter((row) => floor === 'All' || row.floorName === floor)
        .map((row) => row.room.name),
    ),
  ].sort();
  const query = search.trim().toLowerCase();
  const visibleRows = rows.filter(
    (row) =>
      (workType === 'All' ||
        (row.item.workType ?? 'Other') === workType ||
        row.parent?.workType === workType) &&
      (floor === 'All' || row.floorName === floor) &&
      (space === 'All' || row.room.name === space) &&
      matchesHierarchySearch(
        row.item,
        row.parent,
        [row.room.name, row.floorName],
        query,
      ),
  );

  const draftRate = (row: ProjectRateRow) => {
    if (Object.prototype.hasOwnProperty.call(drafts, row.key))
      return drafts[row.key];
    if (
      !row.hasTemplate &&
      row.item.rateOverride === undefined &&
      itemBaseRate(row.item, project.defaultTier) === 0
    )
      return '';
    return String(itemBaseRate(row.item, project.defaultTier));
  };
  const pricingMode = (row: ProjectRateRow) =>
    modeDrafts[row.key] ?? row.item.pricingMode ?? 'unit';
  const parsedRate = (value: string) => {
    if (!value.trim()) return undefined;
    const rate = Number(value);
    return Number.isFinite(rate) ? Math.max(0, rate) : undefined;
  };
  const saveRow = async (
    row: ProjectRateRow,
    value: string,
    modeOverride?: QuoteItem['pricingMode'],
  ) => {
    if (pendingKeys.current.has(row.key)) return false;
    clearTimeout(timers.current[row.key]);
    delete timers.current[row.key];
    const rateOverride = parsedRate(value);
    pendingKeys.current.add(row.key);
    setFailed((current) => {
      const next = new Set(current);
      next.delete(row.key);
      return next;
    });
    setPending((current) => new Set(current).add(row.key));
    try {
      await s.setItemPricing(project.id, row.room.id, row.item.id, {
        pricingMode: modeOverride ?? pricingMode(row),
        rateOverride,
        rateSource:
          rateOverride === undefined && row.hasTemplate
            ? 'template'
            : 'project',
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      setModeDrafts((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      return true;
    } catch {
      setFailed((current) => new Set(current).add(row.key));
      return false;
    } finally {
      pendingKeys.current.delete(row.key);
      setPending((current) => {
        const next = new Set(current);
        next.delete(row.key);
        return next;
      });
    }
  };
  const scheduleSave = (row: ProjectRateRow, value: string) => {
    clearTimeout(timers.current[row.key]);
    timers.current[row.key] = setTimeout(() => {
      void saveRow(row, value);
    }, 600);
  };
  const groupKey = (row: ProjectRateRow) =>
    row.parent ? `${row.room.id}:${row.parent.id}` : '';
  const reorderChild = (
    row: ProjectRateRow,
    direction: -1 | 1,
  ) => {
    if (!row.parent) return;
    s.setProjects(
      s.projects.map((candidateProject) =>
        candidateProject.id !== project.id
          ? candidateProject
          : {
              ...candidateProject,
              updatedAt: new Date().toISOString(),
              rooms: candidateProject.rooms.map((candidateRoom) =>
                candidateRoom.id !== row.room.id
                  ? candidateRoom
                  : {
                      ...candidateRoom,
                      items: moveCompositeChild(
                        candidateRoom.items,
                        row.parent!.id,
                        row.item.id,
                        direction,
                      ),
                    },
              ),
            },
      ),
    );
  };

  return (
    <Page
      title="Rates"
      sub={project.propertyName}
      back={{ label: 'Back to builder', onClick: () => go(`/projects/${id}`) }}
    >
      <nav
        className="project-links rates-project-links"
        aria-label="Project workspace"
      >
        <button onClick={() => go(`/projects/${id}`)}>Builder</button>
        <span>Rates</span>
        <button onClick={() => go(`/projects/${id}/revisions`)}>
          Revisions
        </button>
      </nav>
      <section className="rates-toolbar" aria-label="Rate filters">
        <label className="rates-search">
          <span>Search items</span>
          <Input
            type="search"
            value={search}
            placeholder="Search item, description, HSN…"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>Work type</span>
          <select
            value={workType}
            onChange={(event) => setWorkType(event.target.value)}
          >
            <option>All</option>
            {workTypes.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Floor</span>
          <select
            value={floor}
            onChange={(event) => {
              setFloor(event.target.value);
              setSpace('All');
            }}
          >
            <option>All</option>
            {floors.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Space</span>
          <select
            value={space}
            onChange={(event) => setSpace(event.target.value)}
          >
            <option>All</option>
            {spaces.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </label>
      </section>
      <section className="project-rates panel">
        <div className="rates-table-wrap">
          <table className="rates-table">
            <thead>
              <tr>
                <th>Work Type</th>
                <th>Floor</th>
                <th>Space</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Pricing</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const rawRate = draftRate(row);
                const rate = parsedRate(rawRate);
                const mode = pricingMode(row);
                const hasDraft = Object.prototype.hasOwnProperty.call(
                  drafts,
                  row.key,
                );
                const unpriced = rate === undefined && !row.hasTemplate;
                const previewItem = {
                  ...row.item,
                  pricingMode: mode,
                  rateOverride:
                    rate === undefined && row.hasTemplate ? undefined : rate,
                };
                const source = hasDraft
                  ? rate === undefined
                    ? row.hasTemplate
                      ? 'Master'
                      : 'Unset'
                    : 'Override'
                  : row.item.rateOverride !== undefined
                    ? 'Override'
                    : row.hasTemplate
                      ? 'Master'
                      : itemBaseRate(row.item, project.defaultTier) > 0
                        ? 'Override'
                        : 'Unset';
                const unit =
                  row.item.customUnit ||
                  row.item.unit ||
                  unitForMeasurement(row.item.measurementType);
                const showParent =
                  row.parent &&
                  visibleRows.findIndex(
                    (candidate) => candidate.parent?.id === row.parent?.id,
                  ) === index;
                const currentGroupKey = groupKey(row);
                const groupCollapsed =
                  Boolean(row.parent) && collapsedGroups.has(currentGroupKey);
                const groupExpanded = Boolean(query) || !groupCollapsed;
                const showChild = !row.parent || groupExpanded;
                const siblingOrder = row.parent
                  ? orderedCompositeChildren(row.room, row.parent)
                  : [];
                const siblingIndex = siblingOrder.findIndex(
                  (item) => item.id === row.item.id,
                );
                return (
                  <Fragment key={row.key}>
                  {showParent && row.parent && (
                    <tr className="composite-rate-heading">
                      <td>{row.parent.workType ?? 'Other'}</td>
                      <td>{row.floorName}</td>
                      <td>{row.room.name}</td>
                      <td className="rate-item-cell composite-parent-cell">
                        <button
                          type="button"
                          className="composite-rate-toggle"
                          aria-expanded={groupExpanded}
                          onClick={() =>
                            setCollapsedGroups((current) => {
                              const next = new Set(current);
                              if (next.has(currentGroupKey))
                                next.delete(currentGroupKey);
                              else next.add(currentGroupKey);
                              return next;
                            })
                          }
                        >
                          {groupExpanded ? <ChevronDown /> : <ChevronRight />}
                          <span>
                            <strong>{row.parent.name}</strong>
                            <small>
                              {orderedCompositeChildren(row.room, row.parent).length}{' '}
                              components
                            </small>
                          </span>
                        </button>
                      </td>
                      <td className="number-cell">
                        {itemMeasure(row.parent).toLocaleString('en-IN', {
                          maximumFractionDigits: 3,
                        })}
                      </td>
                      <td>
                        {row.parent.customUnit ||
                          row.parent.unit ||
                          unitForMeasurement(row.parent.measurementType)}
                      </td>
                      <td className="composite-empty-cell">—</td>
                      <td className="composite-empty-cell">—</td>
                      <td className="amount-cell">
                        <strong>
                          {inr(
                            compositeTotal(
                              row.parent,
                              row.room,
                              project.defaultTier,
                            ),
                          )}
                        </strong>
                      </td>
                    </tr>
                  )}
                  {showChild && (
                  <tr
                    className={`${row.parent ? 'composite-child-row' : ''} ${!row.item.enabled ? 'rate-row-disabled' : ''}`}
                  >
                    <td>{row.item.workType ?? 'Other'}</td>
                    <td>{row.floorName}</td>
                    <td>{row.room.name}</td>
                    <td className="rate-item-cell">
                      <div className="rate-item-content">
                        <span>
                          <strong>{row.item.name}</strong>
                          {row.item.description && (
                            <small>{row.item.description}</small>
                          )}
                        </span>
                        {row.parent && (
                          <span className="child-order-controls">
                            <button
                              type="button"
                              disabled={siblingIndex <= 0}
                              onClick={() => reorderChild(row, -1)}
                              aria-label={`Move ${row.item.name} up`}
                              title="Move component up"
                            >
                              <ChevronUp />
                            </button>
                            <button
                              type="button"
                              disabled={siblingIndex === siblingOrder.length - 1}
                              onClick={() => reorderChild(row, 1)}
                              aria-label={`Move ${row.item.name} down`}
                              title="Move component down"
                            >
                              <ChevronDown />
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="number-cell">
                      {itemMeasure(row.item).toLocaleString('en-IN', {
                        maximumFractionDigits: 3,
                      })}
                    </td>
                    <td>{unit}</td>
                    <td>
                      <div
                        className="pricing-toggle"
                        aria-label={`Pricing for ${row.item.name}`}
                      >
                        {(['unit', 'lump-sum'] as const).map((entry) => (
                          <button
                            type="button"
                            key={entry}
                            className={mode === entry ? 'active' : ''}
                            disabled={pending.has(row.key)}
                            onClick={async () => {
                              if (mode === entry) return;
                              const previousMode = mode;
                              setModeDrafts((current) => ({
                                ...current,
                                [row.key]: entry,
                              }));
                              const valueToSave =
                                !hasDraft &&
                                row.hasTemplate &&
                                row.item.rateOverride === undefined
                                  ? ''
                                  : rawRate;
                              const saved = await saveRow(
                                row,
                                valueToSave,
                                entry,
                              );
                              if (!saved)
                                setModeDrafts((current) => ({
                                  ...current,
                                  [row.key]: previousMode,
                                }));
                            }}
                          >
                            {entry === 'unit' ? 'Area' : 'Flat'}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="rate-input-cell">
                      <div className="rate-input-wrap">
                        <span>₹</span>
                        <input
                          ref={(element) => {
                            rateInputs.current[row.key] = element;
                          }}
                          inputMode="decimal"
                          value={rawRate}
                          disabled={pending.has(row.key)}
                          placeholder="Unpriced"
                          aria-label={`Rate for ${row.item.name}`}
                          onFocus={(event) => {
                            if (event.currentTarget.value === '0')
                              event.currentTarget.select();
                          }}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value && !/^\d*\.?\d*$/.test(value)) return;
                            setDrafts((current) => ({
                              ...current,
                              [row.key]: value,
                            }));
                            scheduleSave(row, value);
                          }}
                          onBlur={() => {
                            if (
                              Object.prototype.hasOwnProperty.call(
                                drafts,
                                row.key,
                              )
                            )
                              void saveRow(row, rawRate);
                          }}
                          onKeyDown={async (event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            const saved = await saveRow(row, rawRate);
                            if (saved) {
                              const next = visibleRows[index + 1];
                              if (next) rateInputs.current[next.key]?.focus();
                            }
                          }}
                        />
                        <small>
                          {mode === 'unit' ? `/ ${unit}` : 'Total'}
                        </small>
                      </div>
                      <div
                        className={`rate-source ${
                          failed.has(row.key) ? 'failed' : source.toLowerCase()
                        }`}
                      >
                        {pending.has(row.key)
                          ? 'Saving…'
                          : failed.has(row.key)
                            ? 'Not saved'
                            : unpriced
                              ? 'Unpriced'
                              : source}
                        {!pending.has(row.key) &&
                          row.hasTemplate &&
                          row.item.rateOverride !== undefined && (
                            <button
                              type="button"
                              disabled={pending.has(row.key)}
                              onClick={() => {
                                setDrafts((current) => ({
                                  ...current,
                                  [row.key]: '',
                                }));
                                void saveRow(row, '');
                              }}
                            >
                              Use master
                            </button>
                          )}
                      </div>
                    </td>
                    <td className="amount-cell">
                      {unpriced
                        ? '—'
                        : inr(itemTotal(previewItem, project.defaultTier))}
                    </td>
                  </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibleRows.length && (
          <div className="rates-empty">
            <strong>No matching BOQ items</strong>
            <span>Change the search or filters to see more items.</span>
          </div>
        )}
      </section>
    </Page>
  );
}

function Revisions({ s }: { s: Store }) {
  const { id } = useParams(),
    go = useNavigate(),
    [revisionToDelete, setRevisionToDelete] = useState<Revision | null>(null),
    [deleting, setDeleting] = useState(false),
    p = s.projects.find((x) => x.id === id),
    revs = s.revisions
      .filter((r) => r.projectId === id)
      .sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number,
      );
  if (!p) return <Navigate to="/projects" />;
  return (
    <Page
      title="Revision history"
      sub={`${p.propertyName} · restoring never deletes an earlier snapshot.`}
      back={{
        label: 'Back to builder',
        onClick: () => go(`/projects/${id}`),
      }}
    >
      <nav
        className="project-links rates-project-links"
        aria-label="Project workspace"
      >
        <button onClick={() => go(`/projects/${id}`)}>Builder</button>
        {s.canManageFinancials && (
          <button onClick={() => go(`/projects/${id}/rates`)}>Rates</button>
        )}
        <span>Revisions</span>
      </nav>
      <section className="panel revisions">
        {revs.length ? (
          revs.map((r) => (
            <article key={r.id}>
              <b>R{r.number}</b>
              <span>
                <strong>{r.note?.trim() || 'Revision'}</strong>
                <small>
                  {r.authorName || 'Team member'} ·{' '}
                  {new Date(r.createdAt).toLocaleString('en-IN')}
                </small>
              </span>
              {s.canManageFinancials && !r.technicalOnly && (
                <strong>{inr(r.total)}</strong>
              )}
              <div className="revision-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    const restored =
                      s.canManageFinancials && r.technicalOnly
                        ? combineProject(
                            projectTechnical(r.snapshot),
                            projectFinancial(p),
                            s.rates,
                          )
                        : structuredClone(r.snapshot);
                    s.setProjects(
                      s.projects.map((x) =>
                        x.id === id
                          ? {
                              ...restored,
                              updatedAt: new Date().toISOString(),
                            }
                          : x,
                      ),
                    );
                    go(`/projects/${id}`);
                  }}
                >
                  Restore
                </Button>
                {(s.canManageFinancials || r.createdBy === s.user?.uid) && (
                  <Button
                    variant="ghost"
                    className="revision-delete"
                    onClick={() => setRevisionToDelete(r)}
                  >
                    <Trash2 />
                    Delete
                  </Button>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="empty">
            <FileClock />
            <h2>No revisions saved</h2>
            <p>Save one from the project builder.</p>
          </div>
        )}
      </section>
      {revisionToDelete && (
        <Modal
          title="Delete revision"
          close={() => {
            if (!deleting) setRevisionToDelete(null);
          }}
        >
          <div className="delete-confirm">
            <Trash2 />
            <div>
              <strong>
                Delete “{revisionToDelete.note?.trim() || 'Revision'}”?
              </strong>
              <p>
                This removes only this saved revision from the project history.
                The current BOQ and project data will not be changed.
              </p>
            </div>
          </div>
          <div className="actions">
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setRevisionToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await s.setRevisions(
                    s.revisions.filter(
                      (revision) => revision.id !== revisionToDelete.id,
                    ),
                  );
                  setRevisionToDelete(null);
                } catch {
                  // Keep confirmation open so the deletion can be retried.
                } finally {
                  setDeleting(false);
                }
              }}
            >
              <Trash2 />
              {deleting ? 'Deleting…' : 'Delete revision'}
            </Button>
          </div>
        </Modal>
      )}
    </Page>
  );
}
function RateCard({ s }: { s: Store }) {
  const [e, setE] = useState<RateCardItem | null>(null);
  function save(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget),
      r: RateCardItem = {
        id: e?.id || uid(),
        name: String(f.get('name')),
        description: String(f.get('description')),
        unit: String(f.get('unit')) as MeasurementType,
        rates: {
          standard: Number(f.get('standard')),
          premium: Number(f.get('premium')),
          luxury: Number(f.get('luxury')),
        },
        subUnits: e?.subUnits ?? [],
      };
    s.setRates(
      e?.id ? s.rates.map((x) => (x.id === r.id ? r : x)) : [...s.rates, r],
    );
    setE(null);
  }
  return (
    <Page
      title="Global rate card"
      sub="Master pricing for every future and non-overridden project item."
    >
      <section className="panel">
        <SectionHead title={`${s.rates.length} scope items`}>
          <Button
            onClick={() =>
              setE({
                id: '',
                name: '',
                description: '',
                unit: 'sqft',
                rates: { standard: 0, premium: 0, luxury: 0 },
                subUnits: [],
              })
            }
          >
            <Plus />
            Add item
          </Button>
        </SectionHead>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Unit</th>
                <th className="num">Standard</th>
                <th className="num">Premium</th>
                <th className="num">Luxury</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.rates.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <small>{r.description}</small>
                  </td>
                  <td>{r.unit}</td>
                  {(['standard', 'premium', 'luxury'] as Tier[]).map((t) => (
                    <td className="num" key={t}>
                      {inr(r.rates[t])}
                    </td>
                  ))}
                  <td>
                    <Button variant="ghost" onClick={() => setE(r)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {e && (
        <Modal
          title={e.id ? 'Edit rate item' : 'Add rate item'}
          close={() => setE(null)}
        >
          <form className="form-grid" onSubmit={save}>
            <label>
              Item name
              <Input name="name" defaultValue={e.name} required />
            </label>
            <label>
              Unit
              <select name="unit" defaultValue={e.unit}>
                <option>sqft</option>
                <option>rft</option>
                <option>quantity</option>
                <option>flat</option>
              </select>
            </label>
            <label>
              Description
              <Input name="description" defaultValue={e.description} />
            </label>
            {(['standard', 'premium', 'luxury'] as Tier[]).map((t) => (
              <label key={t}>
                {tl(t)}
                <Input
                  type="number"
                  name={t}
                  defaultValue={e.rates[t]}
                  onFocus={(event) => {
                    if (Number(event.currentTarget.value) === 0)
                      event.currentTarget.select();
                  }}
                  onPointerUp={(event) => {
                    if (Number(event.currentTarget.value) !== 0) return;
                    event.preventDefault();
                    event.currentTarget.select();
                  }}
                />
              </label>
            ))}
            <div className="actions">
              {e.id && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    s.setRates(s.rates.filter((x) => x.id !== e.id));
                    setE(null);
                  }}
                >
                  Delete
                </Button>
              )}
              <Button type="submit">Save item</Button>
            </div>
          </form>
        </Modal>
      )}
    </Page>
  );
}
function Fees({ s }: { s: Store }) {
  const [projectId, setProjectId] = useState(s.projects[0]?.id ?? '');
  const project =
    s.projects.find((item) => item.id === projectId) ?? s.projects[0];
  const patchFee = (
    feeId: string,
    patch: {
      method?: FeeMethod;
      value?: number;
      discount?: number;
      enabled?: boolean;
    },
  ) => {
    if (!project) return;
    s.setProjects(
      s.projects.map((item) =>
        item.id === project.id
          ? {
              ...item,
              updatedAt: new Date().toISOString(),
              fees: item.fees.map((fee) =>
                fee.id === feeId ? { ...fee, ...patch } : fee,
              ),
            }
          : item,
      ),
    );
  };
  return (
    <Page
      title="Fee structure"
      sub="Configure each project with per-square-foot, percentage, or flat professional fees."
    >
      <section className="fee-project-bar panel">
        <label>
          Project
          <select
            value={project?.id ?? ''}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {s.projects.map((item) => (
              <option value={item.id} key={item.id}>
                {item.propertyName}
              </option>
            ))}
          </select>
        </label>
        <span>Fees update this quotation immediately.</span>
      </section>
      <div className="fee-editor-grid">
        {(project?.fees ?? []).map((fee) => (
          <article key={fee.id}>
            <header>
              <div>
                <small>PROFESSIONAL FEE</small>
                <h2>{fee.name}</h2>
              </div>
              <Switch
                checked={fee.enabled}
                onCheckedChange={(enabled) => patchFee(fee.id, { enabled })}
              />
            </header>
            <label>
              Calculation
              <select
                value={fee.method}
                onChange={(event) =>
                  patchFee(fee.id, { method: event.target.value as FeeMethod })
                }
              >
                <option value="flat">Custom / Flat amount</option>
                <option value="percentage">Percentage</option>
                <option value="sqft">Per square foot</option>
              </select>
            </label>
            <label>
              {fee.method === 'flat'
                ? 'Amount'
                : fee.method === 'percentage'
                  ? 'Percentage'
                  : 'Rate per sqft'}
              <div className="fee-value">
                <span>{fee.method === 'percentage' ? '%' : '₹'}</span>
                <Num
                  value={fee.value}
                  onChange={(value) => patchFee(fee.id, { value })}
                />
                <b>{fee.method === 'sqft' ? '/ sqft' : ''}</b>
              </div>
            </label>
            <label className="fee-discount">
              Fee discount{' '}
              <Num
                value={fee.discount}
                onChange={(discount) => patchFee(fee.id, { discount })}
              />
            </label>
            <footer>
              <span>Current quotation</span>
              <strong>
                {inr(
                  quoteTotals(project).fees.find((item) => item.id === fee.id)
                    ?.total ?? 0,
                )}
              </strong>
            </footer>
          </article>
        ))}
      </div>
    </Page>
  );
}
function Firm({ s }: { s: Store }) {
  const x = s.settings,
    set = (p: Partial<FirmSettings>) => s.setSettings({ ...x, ...p });
  return (
    <Page
      title="Firm settings"
      sub="Company details flow directly into previews and exports."
    >
      <section className="panel settings-form">
        {(
          [
            ['Firm name', 'firmName'],
            ['Letterhead name', 'letterheadName'],
            ['Tagline', 'tagline'],
            ['GST number', 'gstNumber'],
            ['Address', 'address'],
            ['Phone', 'phone'],
            ['Website', 'website'],
            ['Email', 'email'],
            ['Thank-you message', 'thankYou'],
          ] as const
        ).map(([l, k]) => (
          <label key={k}>
            {l}
            <Input
              value={x[k]}
              onChange={(e) => set({ [k]: e.target.value })}
            />
          </label>
        ))}
        <label className="wide">
          Terms & conditions
          <textarea
            value={x.terms}
            onChange={(e) => set({ terms: e.target.value })}
          />
        </label>
        <fieldset className="wide">
          <legend>Enabled tiers</legend>
          {(['standard', 'premium', 'luxury'] as Tier[]).map((t) => (
            <label key={t}>
              <Switch
                checked={x.enabledTiers.includes(t)}
                onCheckedChange={(on) =>
                  set({
                    enabledTiers: on
                      ? [...x.enabledTiers, t]
                      : x.enabledTiers.filter((y) => y !== t),
                  })
                }
              />
              {tl(t)}
            </label>
          ))}
        </fieldset>
      </section>
    </Page>
  );
}
declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        t: any,
        o?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}
function WebTool({ s }: { s: Store }) {
  useEffect(() => {
    const c = new AbortController(),
      m = document.modelContext;
    if (!m?.registerTool) return;
    void Promise.resolve(
      m.registerTool(
        {
          name: 'list_nebulous_projects',
          title: 'List Nebulous Design projects',
          description:
            'List Firebase-synchronized quotation projects available to the signed-in user.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () =>
            s.projects.map((p) => ({
              id: p.id,
              client: p.clientName,
              property: p.propertyName,
              ...(s.canManageFinancials
                ? { total: quoteTotals(p).grandTotal }
                : {}),
            })),
        },
        { signal: c.signal },
      ),
    ).catch(() => {});
    return () => c.abort();
  }, [s.projects, s.canManageFinancials]);
  return null;
}
function Root() {
  const s = useStore();
  if (!firebaseConfigured)
    return (
      <div className="firebase-config-error">
        <h1>Firebase configuration required</h1>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code> and add the
          Firebase Web App values.
        </p>
        <small>Missing: {missingFirebaseEnvironment.join(', ')}</small>
      </div>
    );
  if (!s.authReady)
    return <div className="boot">Connecting securely to Firebase…</div>;
  if (!s.user) return <AuthScreen s={s} />;
  if (!s.hydrated)
    return <div className="boot">Loading your Firebase workspace…</div>;
  return (
    <>
      <WebTool s={s} />
      <Shell s={s} />
    </>
  );
}
export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted)
    return <div className="boot">Preparing your quotation workspace…</div>;
  return (
    <HashRouter>
      <Root />
    </HashRouter>
  );
}
