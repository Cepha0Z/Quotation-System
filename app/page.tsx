'use client';
import { useEffect, useRef, useState } from 'react';
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
  Building2,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Download,
  DoorOpen,
  FileClock,
  FileSpreadsheet,
  Gauge,
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
import {
  inr,
  itemBaseRate,
  itemMeasure,
  itemReferenceRate,
  itemSavings,
  itemTotal,
  quoteTotals,
  roomTotal,
} from '@/domain/pricing';
import {
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
import {
  migrateLegacyStorage,
  projectRepository,
  rateCardRepository,
  revisionRepository,
  settingsRepository,
} from '@/storage/repositories';
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
  hydrated: boolean;
  saveState: 'loading' | 'saving' | 'saved' | 'error';
  storageError: string | null;
  projects: Project[];
  setProjects: (v: Project[]) => void;
  deleteProject: (projectId: string) => Promise<void>;
  deleteRoom: (projectId: string, roomId: string) => Promise<void>;
  rates: RateCardItem[];
  setRates: (v: RateCardItem[]) => void;
  settings: FirmSettings;
  setSettings: (v: FirmSettings) => void;
  revisions: Revision[];
  setRevisions: (v: Revision[]) => void;
};
function useStore(): Store {
  const [projects, sp] = useState<Project[]>([]),
    [rates, sr] = useState<RateCardItem[]>([]),
    [settings, ss] = useState(ds),
    [revisions, sv] = useState<Revision[]>([]),
    [ready, setReady] = useState(false),
    [saveState, setSaveState] = useState<Store['saveState']>('loading'),
    [storageError, setStorageError] = useState<string | null>(null),
    timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}),
    pendingWrites = useRef<Record<string, () => Promise<void>>>({});

  const flushWrite = async (key: string) => {
    const write = pendingWrites.current[key];
    if (!write) return;
    delete pendingWrites.current[key];
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    try {
      await write();
      if (!Object.keys(pendingWrites.current).length) setSaveState('saved');
    } catch {
      setSaveState('error');
      setStorageError(
        'Changes are available for this session, but could not be saved on this device.',
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
    let active = true;
    void (async () => {
      try {
        await migrateLegacyStorage();
        const [savedProjects, savedRates, savedSettings, savedRevisions] =
          await Promise.all([
            projectRepository.list(),
            rateCardRepository.list(),
            settingsRepository.get(),
            revisionRepository.list(),
          ]);
        const initialProjects = savedProjects.map(normalizeProject);
        const initialRates = savedRates.length
          ? [
              ...savedRates,
              ...dr.filter(
                (template) =>
                  !savedRates.some(
                    (saved) =>
                      saved.name.toLowerCase() === template.name.toLowerCase(),
                  ),
              ),
            ]
          : dr;
        const initialSettings = normalizeFirmSettings(savedSettings);
        const seedWrites: Promise<void>[] = [];
        if (JSON.stringify(savedProjects) !== JSON.stringify(initialProjects))
          seedWrites.push(projectRepository.saveAll(initialProjects));
        if (JSON.stringify(savedRates) !== JSON.stringify(initialRates))
          seedWrites.push(rateCardRepository.saveAll(initialRates));
        if (
          !savedSettings ||
          JSON.stringify(savedSettings) !== JSON.stringify(initialSettings)
        )
          seedWrites.push(settingsRepository.save(initialSettings));
        await Promise.all(seedWrites);
        if (!active) return;
        sp(initialProjects);
        sr(initialRates);
        ss(initialSettings);
        sv(savedRevisions);
        setSaveState('saved');
      } catch {
        if (!active) return;
        sp([]);
        sr(dr);
        ss(ds);
        sv([]);
        setSaveState('error');
        setStorageError(
          'Local saving is unavailable. You can keep working, but changes may not remain after closing the app.',
        );
      } finally {
        if (active) setReady(true);
      }
    })();
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
      document.removeEventListener('visibilitychange', flushPending);
      window.removeEventListener('pagehide', flushPending);
    };
  }, []);
  return {
    hydrated: ready,
    saveState,
    storageError,
    projects,
    setProjects: (v) => {
      sp(v);
      if (ready) queueWrite('projects', () => projectRepository.saveAll(v));
    },
    deleteProject: async (projectId) => {
      sp((current) => current.filter((project) => project.id !== projectId));
      if (!ready) return;
      setSaveState('saving');
      try {
        await flushWrite('projects');
        await projectRepository.delete(projectId);
        setSaveState('saved');
      } catch {
        setSaveState('error');
        setStorageError(
          'The project was removed here, but could not be deleted from this device.',
        );
      }
    },
    deleteRoom: async (projectId, roomId) => {
      sp((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                updatedAt: new Date().toISOString(),
                rooms: project.rooms.filter((room) => room.id !== roomId),
              }
            : project,
        ),
      );
      if (!ready) return;
      setSaveState('saving');
      try {
        await flushWrite('projects');
        await projectRepository.deleteRoom(projectId, roomId);
        setSaveState('saved');
      } catch {
        setSaveState('error');
        setStorageError(
          'The room was removed here, but could not be deleted from this device.',
        );
      }
    },
    rates,
    setRates: (v) => {
      sr(v);
      if (ready) queueWrite('rates', () => rateCardRepository.saveAll(v));
    },
    settings,
    setSettings: (v) => {
      ss(v);
      if (ready) queueWrite('settings', () => settingsRepository.save(v));
    },
    revisions,
    setRevisions: (v) => {
      sv(v);
      if (ready) queueWrite('revisions', () => revisionRepository.saveAll(v));
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
          {nav.map(([to, label, I]) => (
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
            <strong>Nebulous Design</strong>
            <small>Local workspace</small>
          </span>
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
              ? 'Loading local data'
              : s.saveState === 'saving'
                ? 'Saving…'
                : s.saveState === 'error'
                  ? 'Saving unavailable'
                  : 'Saved locally'}
          </span>
        </header>
        {s.storageError && (
          <div className="storage-error" role="status">
            {s.storageError}
          </div>
        )}
        <Routes>
          <Route path="/dashboard" element={<Dashboard s={s} />} />
          <Route path="/projects" element={<Projects s={s} />} />
          <Route path="/projects/:id" element={<Builder s={s} />} />
          <Route path="/projects/:id/preview" element={<Preview s={s} />} />
          <Route path="/projects/:id/revisions" element={<Revisions s={s} />} />
          <Route path="/rate-card" element={<RateCard s={s} />} />
          <Route path="/fees" element={<Fees s={s} />} />
          <Route path="/settings" element={<Firm s={s} />} />
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </div>
    </div>
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
  children: React.ReactNode;
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
      fees: [
        {
          id: uid(),
          name: 'Design Fee',
          method: 'sqft',
          value: 50,
          discount: 0,
          enabled: true,
        },
        {
          id: uid(),
          name: '3D / Drawing',
          method: 'flat',
          value: 35000,
          discount: 0,
          enabled: true,
        },
        {
          id: uid(),
          name: 'Site Supervision',
          method: 'flat',
          value: 45000,
          discount: 0,
          enabled: true,
        },
      ],
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
        <Modal title={`Create project · ${step} of 4`} close={close}>
          <div className="setup-progress">
            <span style={{ width: `${step * 25}%` }} />
          </div>
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
            <div className="setup-list">
              <p>Add, rename and order every floor used by the project.</p>
              {floors.map((floor, index) => (
                <div key={floor.id}>
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
                    }}
                  >
                    <ChevronUp />
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
                    }}
                  >
                    <ChevronDown />
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={floors.length === 1}
                    onClick={() =>
                      setFloors(floors.filter((x) => x.id !== floor.id))
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <div className="preset-row">
                {FLOOR_SUGGESTIONS.filter(
                  (name) => !floors.some((floor) => floor.name === name),
                ).map((name) => (
                  <Button
                    key={name}
                    variant="outline"
                    onClick={() => setFloors([...floors, { id: uid(), name }])}
                  >
                    {name}
                  </Button>
                ))}
                <Button
                  onClick={() =>
                    setFloors([...floors, { id: uid(), name: 'New Floor' }])
                  }
                >
                  <Plus /> Add floor
                </Button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-setup">
              {floors.map((floor) => (
                <section key={floor.id}>
                  <h3>{floor.name}</h3>
                  <div className="space-chips">
                    {(spaces[floor.id] ?? []).map((name, index) => (
                      <button
                        key={`${name}-${index}`}
                        onClick={() =>
                          setSpaces({
                            ...spaces,
                            [floor.id]: (spaces[floor.id] ?? []).filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        {name}
                        <X />
                      </button>
                    ))}
                  </div>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      addSpace(floor.id, e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">+ Add space…</option>
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
                    }}
                  />
                </section>
              ))}
            </div>
          )}
          {step === 4 && (
            <div className="setup-review">
              <p>
                <strong>{details.layout}</strong> is only a starting reference.
                Bedrooms and all other spaces remain fully editable after
                creation.
              </p>
              {floors.map((floor) => (
                <section key={floor.id}>
                  <h3>{floor.name}</h3>
                  <p>
                    {(spaces[floor.id] ?? []).join(' · ') || 'No spaces yet'}
                  </p>
                </section>
              ))}
            </div>
          )}
          <div className="actions">
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
                Continue
              </Button>
            ) : (
              <Button onClick={create}>Create & open BOQ</Button>
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
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <main className="page">
      <header className="page-title">
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
      </div>
      <section className="panel">
        <SectionHead title="Recent projects">
          <NewProject s={s} />
        </SectionHead>
        <ProjectTable projects={s.projects.slice(0, 5)} />
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
        <ProjectTable projects={s.projects} />
      </section>
    </Page>
  );
}
function ProjectTable({ projects }: { projects: Project[] }) {
  const go = useNavigate();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Layout</th>
            <th>Tier</th>
            <th>Updated</th>
            <th className="num">Value</th>
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
              <td>
                <em className="pill">{tl(p.defaultTier)}</em>
              </td>
              <td>{new Date(p.updatedAt).toLocaleDateString('en-IN')}</td>
              <td className="num">
                <strong>{inr(quoteTotals(p).grandTotal)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const fresh = (r?: RateCardItem): QuoteItem => ({
  id: uid(),
  rateCardId: r?.id,
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
  const XModule = await import('xlsx-js-style');
  const X = (XModule.default ?? XModule) as typeof import('xlsx-js-style');
  const totals = quoteTotals(project);
  const wb = X.utils.book_new();
  wb.Props = {
    Title: `Quotation for ${project.clientName}`,
    Subject: project.propertyName,
    Author: settings.letterheadName,
    Company: settings.firmName,
  };
  const line = 'C8CCC9';
  const softLine = 'E2E4E2';
  const ink = '222725';
  const muted = '68706C';
  const floorFill = 'E7ECE9';
  const spaceFill = 'F4F1EA';
  const totalFill = 'ECEFEA';
  const headerFill = 'F0F1EF';
  const currencyFormat = '₹#,##0.00;[Red]-₹#,##0.00';
  const quantityFormat = '#,##0.00';
  const baseRows = () => [
    [settings.letterheadName, '', '', '', '', '', ''],
    [
      [settings.website, settings.email].filter(Boolean).join(' · '),
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    ['', '', '', '', '', '', ''],
    ['BOQ / COSTING FOR PROJECT', '', '', '', '', '', ''],
    [`${project.clientName} · ${project.propertyName}`, '', '', '', '', '', ''],
    [
      `${project.layout} · ${project.carpetArea.toLocaleString('en-IN')} sq.ft · ${tl(project.defaultTier)} · ${new Date().toLocaleDateString('en-IN')}`,
      '',
      '',
      '',
      '',
      '',
      '',
    ],
    ['', '', '', '', '', '', ''],
  ];
  const styleSheet = (
    ws: Record<string, unknown>,
    rows: (string | number)[][],
    options: {
      floorRows?: number[];
      spaceRows?: number[];
      itemRows?: number[];
      subtotalRows?: number[];
      grandTotalRows?: number[];
      headerRows?: number[];
      mergedRows?: number[];
    } = {},
  ) => {
    const floorRows = options.floorRows ?? [];
    const spaceRows = options.spaceRows ?? [];
    const itemRows = options.itemRows ?? [];
    const subtotalRows = options.subtotalRows ?? [];
    const grandTotalRows = options.grandTotalRows ?? [];
    const headerRows = options.headerRows ?? [];
    const mergedRows = options.mergedRows ?? [0, 1, 3, 4, 5];
    const ref = ws['!ref'] as string;
    const range = X.utils.decode_range(ref);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = 0; c <= 6; c += 1) {
        const address = X.utils.encode_cell({ r, c });
        const cell =
          (ws[address] as Record<string, unknown> | undefined) ??
          ((ws[address] = { t: 's', v: '' }) as Record<string, unknown>);
        cell.s = {
          fill: { fgColor: { rgb: 'FFFFFF' } },
          font: { name: 'Century Gothic', sz: 10, color: { rgb: ink } },
          alignment: {
            vertical: itemRows.includes(r) ? 'top' : 'center',
            horizontal:
              c === 0 || c === 2 || c === 4
                ? 'center'
                : c >= 3
                  ? 'right'
                  : 'left',
            wrapText: true,
          },
          border:
            itemRows.includes(r) || headerRows.includes(r)
              ? {
                  top: { style: 'thin', color: { rgb: softLine } },
                  bottom: { style: 'thin', color: { rgb: softLine } },
                  left: { style: 'thin', color: { rgb: softLine } },
                  right: { style: 'thin', color: { rgb: softLine } },
                }
              : { bottom: { style: 'hair', color: { rgb: softLine } } },
        };
        if (c === 3 && typeof cell.v === 'number')
          (cell.s as Record<string, unknown>).numFmt = quantityFormat;
        if ((c === 5 || c === 6) && typeof cell.v === 'number')
          (cell.s as Record<string, unknown>).numFmt = currencyFormat;
      }
    }
    mergedRows.forEach((r) => {
      const cell = ws[X.utils.encode_cell({ r, c: 0 })] as Record<
        string,
        unknown
      >;
      if (!cell) return;
      cell.s = {
        fill: { fgColor: { rgb: 'FFFFFF' } },
        font: {
          name: 'Century Gothic',
          sz: r === 0 ? 17 : r === 3 ? 13 : 10,
          bold: r === 0 || r === 3 || r === 4,
          color: { rgb: ink },
        },
        alignment: {
          vertical: 'center',
          horizontal: r === 3 ? 'center' : 'left',
          wrapText: true,
        },
        border: {
          bottom: { style: r === 3 ? 'medium' : 'hair', color: { rgb: line } },
        },
      };
    });
    headerRows.forEach((r) => {
      for (let c = 0; c <= 6; c += 1) {
        const cell = ws[X.utils.encode_cell({ r, c })] as Record<
          string,
          unknown
        >;
        cell.s = {
          fill: { fgColor: { rgb: headerFill } },
          font: {
            name: 'Century Gothic',
            sz: 10,
            bold: true,
            color: { rgb: ink },
          },
          alignment: {
            vertical: 'center',
            horizontal: 'center',
            wrapText: true,
          },
          border: {
            top: { style: 'medium', color: { rgb: line } },
            bottom: { style: 'medium', color: { rgb: line } },
            left: { style: 'thin', color: { rgb: line } },
            right: { style: 'thin', color: { rgb: line } },
          },
        };
      }
    });
    floorRows.forEach((r) => {
      for (let c = 0; c <= 6; c += 1) {
        const cell = ws[X.utils.encode_cell({ r, c })] as Record<
          string,
          unknown
        >;
        cell.s = {
          fill: { fgColor: { rgb: floorFill } },
          font: {
            name: 'Century Gothic',
            sz: 11,
            bold: true,
            color: { rgb: ink },
          },
          alignment: {
            vertical: 'center',
            horizontal: c === 6 ? 'right' : 'left',
          },
          border: { bottom: { style: 'medium', color: { rgb: line } } },
          numFmt: c === 6 ? currencyFormat : undefined,
        };
      }
    });
    spaceRows.forEach((r) => {
      for (let c = 0; c <= 6; c += 1) {
        const cell = ws[X.utils.encode_cell({ r, c })] as Record<
          string,
          unknown
        >;
        cell.s = {
          fill: { fgColor: { rgb: spaceFill } },
          font: {
            name: 'Century Gothic',
            sz: 10,
            bold: true,
            color: { rgb: ink },
          },
          alignment: {
            vertical: 'center',
            horizontal: c === 6 ? 'right' : 'left',
          },
          border: { bottom: { style: 'thin', color: { rgb: line } } },
          numFmt: c === 6 ? currencyFormat : undefined,
        };
      }
    });
    subtotalRows.forEach((r) => {
      for (let c = 0; c <= 6; c += 1) {
        const cell = ws[X.utils.encode_cell({ r, c })] as Record<
          string,
          unknown
        >;
        cell.s = {
          fill: { fgColor: { rgb: 'FFFFFF' } },
          font: {
            name: 'Century Gothic',
            sz: 10,
            bold: true,
            color: { rgb: ink },
          },
          alignment: {
            vertical: 'center',
            horizontal: c === 6 ? 'right' : 'left',
          },
          border: { top: { style: 'thin', color: { rgb: line } } },
          numFmt: c === 6 ? currencyFormat : undefined,
        };
      }
    });
    grandTotalRows.forEach((r) => {
      for (let c = 0; c <= 6; c += 1) {
        const cell = ws[X.utils.encode_cell({ r, c })] as Record<
          string,
          unknown
        >;
        cell.s = {
          fill: { fgColor: { rgb: totalFill } },
          font: {
            name: 'Century Gothic',
            sz: 11,
            bold: true,
            color: { rgb: ink },
          },
          alignment: {
            vertical: 'center',
            horizontal: c === 6 ? 'right' : 'left',
          },
          border: {
            top: { style: 'double', color: { rgb: line } },
            bottom: { style: 'medium', color: { rgb: line } },
          },
          numFmt: c === 6 ? currencyFormat : undefined,
        };
      }
    });
    ws['!cols'] = [
      { wch: 8 },
      { wch: 64 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 18 },
    ];
    ws['!rows'] = rows.map((row, r) => ({
      hpt: itemRows.includes(r)
        ? Math.min(
            104,
            Math.max(42, String(row[1] ?? '').split('\n').length * 17 + 18),
          )
        : r === 0
          ? 28
          : floorRows.includes(r)
            ? 25
            : spaceRows.includes(r)
              ? 23
              : 20,
    }));
    ws['!merges'] = mergedRows.map((r) => ({ s: { r, c: 0 }, e: { r, c: 6 } }));
    ws['!freeze'] = {
      xSplit: 0,
      ySplit: 8,
      topLeftCell: 'A9',
      activePane: 'bottomLeft',
      state: 'frozen',
    };
    ws['!margins'] = {
      left: 0.3,
      right: 0.3,
      top: 0.45,
      bottom: 0.45,
      header: 0.2,
      footer: 0.2,
    };
    ws['!pageSetup'] = {
      orientation: 'portrait',
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    };
  };
  const discoveredWorkTypes = [
    ...new Set(
      project.rooms.flatMap((space) =>
        space.items
          .filter((item) => item.enabled)
          .map((item) => item.workType ?? 'Millwork'),
      ),
    ),
  ];
  const workTypes = [
    ...WORK_TYPES.filter((workType) => discoveredWorkTypes.includes(workType)),
    ...discoveredWorkTypes.filter(
      (workType) =>
        !WORK_TYPES.includes(workType as (typeof WORK_TYPES)[number]),
    ),
  ];
  const workTypeTotals = new Map(
    workTypes.map((workType) => [
      workType,
      project.rooms.reduce(
        (sum, space) =>
          sum +
          space.items
            .filter(
              (item) =>
                item.enabled && (item.workType ?? 'Millwork') === workType,
            )
            .reduce(
              (itemSum, item) => itemSum + itemTotal(item, project.defaultTier),
              0,
            ),
        0,
      ),
    ]),
  );
  const summaryRows: (string | number)[][] = [
    ...baseRows(),
    ['Work Type', '', '', '', '', '', 'Amount'],
    ...workTypes.map((workType) => [
      workType,
      '',
      '',
      '',
      '',
      '',
      workTypeTotals.get(workType) ?? 0,
    ]),
    ['', '', '', '', '', '', ''],
    ['Interior Work', '', '', '', '', '', totals.interior],
    ...totals.fees.map((fee) => [fee.name, '', '', '', '', '', fee.total]),
    ['Subtotal', '', '', '', '', '', totals.subtotal],
    ['Project discount', '', '', '', '', '', -totals.discount],
    ['PROJECT TOTAL', '', '', '', '', '', totals.grandTotal],
    ['', '', '', '', '', '', ''],
    [settings.quotationNotes, '', '', '', '', '', ''],
    [settings.terms, '', '', '', '', '', ''],
  ];
  const summaryHeaderRow = 7;
  const summaryGrandRow = summaryRows.length - 4;
  const summaryWs = X.utils.aoa_to_sheet(summaryRows);
  styleSheet(summaryWs, summaryRows, {
    headerRows: [summaryHeaderRow],
    subtotalRows: [summaryGrandRow - 2, summaryGrandRow - 1],
    grandTotalRows: [summaryGrandRow],
    mergedRows: [0, 1, 3, 4, 5, summaryRows.length - 2, summaryRows.length - 1],
  });
  X.utils.book_append_sheet(wb, summaryWs, 'Summary');

  const usedSheetNames = new Set<string>(['Summary']);
  const safeSheetName = (workType: string) => {
    const base =
      workType
        .replace(/[\\/?*\[\]:]/g, ' & ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 31) || 'BOQ';
    let name = base;
    let suffix = 2;
    while (usedSheetNames.has(name)) {
      const marker = ` ${suffix}`;
      name = `${base.slice(0, 31 - marker.length)}${marker}`;
      suffix += 1;
    }
    usedSheetNames.add(name);
    return name;
  };
  workTypes.forEach((workType) => {
    const rows: (string | number)[][] = [
      ...baseRows(),
      ['Sl.no', 'Particulars', 'HSN Code', 'Qty', 'Unit', 'Rate', 'Amount'],
    ];
    const floorRows: number[] = [];
    const spaceRows: number[] = [];
    const itemRows: number[] = [];
    const subtotalRows: number[] = [];
    let serial = 1;
    (project.floors ?? []).forEach((floor) => {
      const floorSpaces = project.rooms
        .filter((space) => space.floorId === floor.id)
        .map((space) => ({
          space,
          items: space.items.filter(
            (item) =>
              item.enabled && (item.workType ?? 'Millwork') === workType,
          ),
        }))
        .filter(({ items }) => items.length > 0);
      if (!floorSpaces.length) return;
      floorRows.push(rows.length);
      rows.push(['', floor.name.toUpperCase(), '', '', '', '', '']);
      let floorTotal = 0;
      floorSpaces.forEach(({ space, items }) => {
        spaceRows.push(rows.length);
        rows.push(['', space.name, '', '', '', '', '']);
        let spaceTotal = 0;
        items.forEach((item) => {
          const dimensions =
            item.measureMode === 'dimensions'
              ? [
                  item.length ? `${item.length}L` : '',
                  item.width ? `${item.width}D` : '',
                  item.height ? `${item.height}H` : '',
                ]
                  .filter(Boolean)
                  .join(' × ')
              : '';
          const components = item.subUnits
            .filter((component) => component.enabled)
            .map((component) => `${component.name} (${inr(component.rate)})`)
            .join(', ');
          const particulars = [
            `${item.name}${item.description ? `: ${item.description}` : ''}`,
            dimensions
              ? `Size: ${dimensions} ${item.dimensionUnit ?? 'ft'}`
              : '',
            components ? `Components: ${components}` : '',
            item.notes ?? '',
          ]
            .filter(Boolean)
            .join('\n');
          const amount = itemTotal(item, project.defaultTier);
          itemRows.push(rows.length);
          rows.push([
            serial,
            particulars,
            item.hsnCode ?? '',
            item.pricingMode === 'lump-sum' ? 1 : itemMeasure(item),
            item.customUnit ||
              item.unit ||
              unitForMeasurement(item.measurementType),
            itemBaseRate(item, project.defaultTier),
            amount,
          ]);
          serial += 1;
          spaceTotal += amount;
        });
        subtotalRows.push(rows.length);
        rows.push(['', `${space.name} subtotal`, '', '', '', '', spaceTotal]);
        floorTotal += spaceTotal;
      });
      subtotalRows.push(rows.length);
      rows.push(['', `${floor.name} subtotal`, '', '', '', '', floorTotal]);
      rows.push(['', '', '', '', '', '', '']);
    });
    const totalRow = rows.length;
    rows.push([
      '',
      `${workType.toUpperCase()} TOTAL`,
      '',
      '',
      '',
      '',
      workTypeTotals.get(workType) ?? 0,
    ]);
    const ws = X.utils.aoa_to_sheet(rows);
    styleSheet(ws, rows, {
      floorRows,
      spaceRows,
      itemRows,
      subtotalRows,
      grandTotalRows: [totalRow],
      headerRows: [7],
    });
    X.utils.book_append_sheet(wb, ws, safeSheetName(workType));
  });
  const filename = `${project.propertyName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-quotation.xlsx`;
  if (saveBytes) {
    const data = X.write(wb, {
      bookType: 'xlsx',
      type: 'array',
      compression: true,
    });
    await saveBytes(filename, new Uint8Array(data));
    return;
  }
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const data = X.write(wb, {
      bookType: 'xlsx',
      type: 'base64',
      compression: true,
    });
    await shareNativeFile(
      filename,
      data,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return;
  }
  const data = X.write(wb, {
    bookType: 'xlsx',
    type: 'array',
    compression: true,
  });
  const url = URL.createObjectURL(
    new Blob([data], {
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
function Builder({ s }: { s: Store }) {
  const { id } = useParams(),
    go = useNavigate(),
    p = s.projects.find((x) => x.id === id),
    [rid, setRid] = useState(p?.rooms[0]?.id ?? ''),
    [roomModal, setRoomModal] = useState(false),
    [itemModal, setItemModal] = useState(false),
    [compare, setCompare] = useState(false),
    [projectActions, setProjectActions] = useState(false),
    [renameModal, setRenameModal] = useState(false),
    [renameValue, setRenameValue] = useState(''),
    [deleteProject, setDeleteProject] = useState(false),
    [revisionModal, setRevisionModal] = useState(false),
    [revisionNote, setRevisionNote] = useState(''),
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
    visibleRooms = p.rooms.filter(
      (space) => !selectedFloorId || space.floorId === selectedFloorId,
    ),
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
    space.items.filter(
      (item) =>
        selectedWorkType === 'All' || item.workType === selectedWorkType,
    );
  const roomWorkTypeTotal = (space: Room) =>
    roomWorkTypeItems(space).reduce(
      (sum, item) => sum + itemTotal(item, p.defaultTier),
      0,
    );
  const workTypeOptions = ['All', ...WORK_TYPES];
  const selectedFloor = projectFloors.find(
    (floor) => floor.id === selectedFloorId,
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
  function saveRev(note: string) {
    const project = p!;
    const prior = s.revisions.filter((r) => r.projectId === project.id);
    s.setRevisions([
      ...s.revisions,
      {
        id: uid(),
        projectId: project.id,
        number: prior.length + 1,
        createdAt: new Date().toISOString(),
        total: tot.grandTotal,
        note,
        snapshot: structuredClone(project),
      },
    ]);
    setRevisionModal(false);
    setRevisionNote('');
  }
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
            <button onClick={() => setCompare(true)}>Compare</button>
            <button onClick={() => go(`/projects/${id}/revisions`)}>
              Revisions
            </button>
            <button onClick={() => go(`/projects/${id}/preview`)}>
              Preview
            </button>
          </nav>
          <Button
            variant="outline"
            className="save-revision"
            onClick={() => setRevisionModal(true)}
          >
            <Save />
            Save revision
          </Button>
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
                <button
                  onClick={() => {
                    setProjectActions(false);
                    setCompare(true);
                  }}
                >
                  <BarChart3 />
                  Compare tiers
                </button>
                <button onClick={() => go(`/projects/${id}/revisions`)}>
                  <FileClock />
                  Revision history
                </button>
                <button onClick={() => go(`/projects/${id}/preview`)}>
                  <ReceiptText />
                  Quotation preview
                </button>
                <span />
                <button
                  onClick={() => {
                    setRenameValue(p.propertyName);
                    setRenameModal(true);
                    setProjectActions(false);
                  }}
                >
                  <Pencil />
                  Rename project
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
              value={selectedFloorId}
              onChange={(event) => {
                const floorId = event.target.value;
                setSelectedFloorId(floorId);
                setRid(
                  p.rooms.find((space) => !floorId || space.floorId === floorId)
                    ?.id ?? '',
                );
                setMobileSpaceDetail(false);
              }}
            >
              <option value="">All Floors</option>
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
            <small>{selectedFloor?.name ?? 'All floors'}</small>
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
                <b>{inr(roomWorkTypeTotal(space))}</b>
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
        className={`builder-grid ${roomsOpen ? 'rooms-open' : 'rooms-closed'} ${summaryOpen ? 'summary-open' : 'summary-closed'} ${mobileSpaceDetail ? 'mobile-detail-open' : 'mobile-detail-closed'}`}
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
                <b>{inr(roomWorkTypeTotal(r))}</b>
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
                        {selectedWorkType} ·{' '}
                        {selectedFloor?.name ?? 'All floors'}
                      </p>
                    </div>
                  </div>
                  <span>
                    <strong>{inr(roomWorkTypeTotal(room))}</strong>
                    <small>Visible items</small>
                  </span>
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
                        <Button size="lg" onClick={() => setItemModal(true)}>
                          <Plus /> Add BOQ Item
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => setItemModal(true)}
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
                    roomFilteredItems(room).map((item, i) => (
                      <Item
                        key={item.id}
                        item={item}
                        p={p}
                        currentRoomId={room.id}
                        editing={editingItemId === item.id}
                        setEditing={(value) =>
                          setEditingItemId(value ? item.id : null)
                        }
                        patch={(x) => patchItem(item.id, x)}
                        duplicate={() =>
                          update((q) => ({
                            ...q,
                            rooms: q.rooms.map((r) =>
                              r.id === room.id
                                ? {
                                    ...r,
                                    items: [
                                      ...r.items,
                                      {
                                        ...structuredClone(item),
                                        id: uid(),
                                        name: item.name + ' copy',
                                      },
                                    ],
                                  }
                                : r,
                            ),
                          }))
                        }
                        remove={() =>
                          update((q) => ({
                            ...q,
                            rooms: q.rooms.map((r) =>
                              r.id === room.id
                                ? {
                                    ...r,
                                    items: r.items.filter(
                                      (x) => x.id !== item.id,
                                    ),
                                  }
                                : r,
                            ),
                          }))
                        }
                        move={(dest) =>
                          update((q) => ({
                            ...q,
                            rooms: q.rooms.map((r) =>
                              r.id === room.id
                                ? {
                                    ...r,
                                    items: r.items.filter(
                                      (x) => x.id !== item.id,
                                    ),
                                  }
                                : r.id === dest
                                  ? {
                                      ...r,
                                      items: [
                                        ...r.items,
                                        structuredClone(item),
                                      ],
                                    }
                                  : r,
                            ),
                          }))
                        }
                        order={(d) =>
                          update((q) => ({
                            ...q,
                            rooms: q.rooms.map((r) => {
                              if (r.id !== room.id) return r;
                              const a = [...r.items],
                                j = i + d;
                              if (j < 0 || j >= a.length) return r;
                              [a[i], a[j]] = [a[j], a[i]];
                              return { ...r, items: a };
                            }),
                          }))
                        }
                      />
                    ))
                  )}
                  {roomFilteredItems(room).length > 0 && (
                    <Button
                      className="add-item"
                      variant="outline"
                      size="lg"
                      onClick={() => setItemModal(true)}
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
        <Summary
          p={p}
          update={update}
          open={summaryOpen}
          close={() => setSummaryOpen(false)}
          preview={() => go(`/projects/${id}/preview`)}
          download={() => void exportProjectExcel(p, s.settings)}
        />
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
                    floorId: selectedFloorId || projectFloors[0]?.id,
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
                  floorId: selectedFloorId || projectFloors[0]?.id,
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
                    <strong>{inr(floorTotal)}</strong>
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
                          <strong>
                            {inr(roomTotal(space, p.defaultTier))}
                          </strong>
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
        <Modal title="Add an item" close={() => setItemModal(false)}>
          <div className="picker">
            {s.rates.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  update((q) => ({
                    ...q,
                    rooms: q.rooms.map((x) =>
                      x.id === room.id
                        ? {
                            ...x,
                            items: [
                              ...x.items,
                              {
                                ...fresh(r),
                                workType:
                                  selectedWorkType === 'All'
                                    ? 'Millwork'
                                    : selectedWorkType,
                              },
                            ],
                          }
                        : x,
                    ),
                  }));
                  setItemModal(false);
                }}
              >
                <strong>{r.name}</strong>
                <small>{r.description}</small>
                <span>
                  {inr(r.rates[p.defaultTier])} / {r.unit}
                </span>
              </button>
            ))}
            <button
              onClick={() => {
                update((q) => ({
                  ...q,
                  rooms: q.rooms.map((x) =>
                    x.id === room.id
                      ? {
                          ...x,
                          items: [
                            ...x.items,
                            {
                              ...fresh(),
                              workType:
                                selectedWorkType === 'All'
                                  ? 'Other'
                                  : selectedWorkType,
                            },
                          ],
                        }
                      : x,
                  ),
                }));
                setItemModal(false);
              }}
            >
              <strong>Custom item</strong>
              <small>Project-specific scope</small>
            </button>
          </div>
        </Modal>
      )}
      {compare && <Compare p={p} close={() => setCompare(false)} />}
      {renameModal && (
        <Modal title="Rename project" close={() => setRenameModal(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = renameValue.trim();
              if (!name) return;
              update((q) => ({ ...q, propertyName: name }));
              setRenameModal(false);
            }}
          >
            <div className="form-grid single-column">
              <label>
                Property name
                <Input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
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
      {revisionModal && (
        <Modal title="Save revision" close={() => setRevisionModal(false)}>
          <div className="form-grid single-column">
            <label>
              Revision note (optional)
              <Input
                autoFocus
                value={revisionNote}
                onChange={(event) => setRevisionNote(event.target.value)}
                placeholder="For example: Client requested changes"
              />
            </label>
          </div>
          <div className="actions">
            <Button variant="outline" onClick={() => setRevisionModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveRev(revisionNote)}>Save revision</Button>
          </div>
        </Modal>
      )}
      {deleteProject && (
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
  return (
    <Input
      type="number"
      min="0"
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    />
  );
}
function itemMeasureLabel(item: QuoteItem) {
  if (item.pricingMode === 'lump-sum' || item.unit === 'Lump Sum')
    return 'Lump sum';
  const quantity = itemMeasure(item).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
  return `${quantity} ${item.customUnit || item.unit || unitForMeasurement(item.measurementType)}`;
}
function Item({
  item,
  p,
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
  currentRoomId: string;
  editing: boolean;
  setEditing: (value: boolean) => void;
  patch: (x: Partial<QuoteItem>) => void;
  duplicate: () => void;
  remove: () => void;
  move: (x: string) => void;
  order: (d: number) => void;
}) {
  const [more, setMore] = useState(false),
    menuRef = useRef<HTMLDivElement>(null),
    rate = itemBaseRate(item, p.defaultTier),
    referenceRate = itemReferenceRate(item, p.defaultTier),
    original =
      itemMeasure(item) * referenceRate +
      item.subUnits
        .filter((subUnit) => subUnit.enabled)
        .reduce((sum, subUnit) => sum + subUnit.rate, 0),
    total = itemTotal(item, p.defaultTier),
    savings = itemSavings(item, p.defaultTier);
  useEffect(() => {
    if (!more) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMore(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [more]);
  return (
    <article className={'item ' + (!item.enabled ? 'off' : '')}>
      <header onClick={() => !editing && setEditing(true)}>
        <div className="item-title">
          <figure className="item-image">
            <img src={itemImage(item.name)} alt="" aria-hidden="true" />
          </figure>
          <Switch
            checked={item.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
            onClick={(event) => event.stopPropagation()}
          />
          <span className="item-copy">
            <strong>{item.name}</strong>
            <small>{item.description || 'No description'}</small>
            <span className="item-measure-summary">
              {itemMeasureLabel(item)}
            </span>
          </span>
        </div>
        <span className="item-total">
          <strong>{inr(total)}</strong>
          {savings > 0 && (
            <small>
              <s>{inr(original)}</s> · save {inr(savings)}
            </small>
          )}
        </span>
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
        <div className="item-actions-wrap" ref={menuRef}>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={(event) => {
              event.stopPropagation();
              setMore(!more);
            }}
            aria-label={`Actions for ${item.name}`}
            aria-expanded={more}
          >
            <MoreHorizontal />
          </Button>
          {more && (
            <div className="context-menu item-context-menu" role="menu">
              <Button
                variant="ghost"
                onClick={() => {
                  duplicate();
                  setMore(false);
                }}
              >
                <Copy /> Duplicate here
              </Button>
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
              <Button
                variant="ghost"
                onClick={() => {
                  patch({ enabled: !item.enabled });
                  setMore(false);
                }}
              >
                {item.enabled ? 'Disable item' : 'Enable item'}
              </Button>
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
              <Input
                value={item.description}
                placeholder="Add description"
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
          </div>
          <div className="measure">
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
            <label>
              Unit
              <select
                value={item.unit ?? unitForMeasurement(item.measurementType)}
                onChange={(e) => {
                  const unit = e.target.value as BoqUnit;
                  patch({
                    unit,
                    measurementType: measurementForUnit(unit),
                    pricingMode: unit === 'Lump Sum' ? 'lump-sum' : 'unit',
                  });
                }}
              >
                {[
                  'Nos',
                  'Sq.ft',
                  'Sq.m',
                  'R.ft',
                  'R.m',
                  'Kg',
                  'Ltr',
                  'Set',
                  'Lot',
                  'Lump Sum',
                  'Custom',
                ].map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            {item.unit === 'Custom' && (
              <label>
                Custom unit
                <Input
                  value={item.customUnit ?? ''}
                  onChange={(e) => patch({ customUnit: e.target.value })}
                />
              </label>
            )}
            <label>
              Pricing
              <select
                value={item.pricingMode ?? 'unit'}
                onChange={(e) =>
                  patch({
                    pricingMode: e.target.value as QuoteItem['pricingMode'],
                  })
                }
              >
                <option value="unit">Unit rate</option>
                <option value="lump-sum">Lump sum</option>
              </select>
            </label>
            <label>
              Quantity
              <Num
                value={item.quantity}
                onChange={(quantity) => patch({ quantity })}
              />
            </label>
            <label>
              Measurement basis
              <select
                value={item.measureMode ?? 'quantity'}
                onChange={(e) =>
                  patch({
                    measureMode: e.target.value as QuoteItem['measureMode'],
                  })
                }
              >
                <option value="quantity">Entered quantity</option>
                <option value="dimensions">Calculate from dimensions</option>
              </select>
            </label>
            <label>
              Dimension unit
              <select
                value={item.dimensionUnit ?? 'ft'}
                onChange={(e) =>
                  patch({
                    dimensionUnit: e.target.value as QuoteItem['dimensionUnit'],
                  })
                }
              >
                {['mm', 'cm', 'ft', 'm'].map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label>
              Optional length
              <Num
                value={item.length}
                onChange={(length) => patch({ length })}
              />
            </label>
            <label>
              Optional width / depth
              <Num value={item.width} onChange={(width) => patch({ width })} />
            </label>
            <label>
              Optional height
              <Num
                value={item.height}
                onChange={(height) => patch({ height })}
              />
            </label>
            <label>
              Tier
              <select
                value={item.tierOverride ?? ''}
                onChange={(e) =>
                  patch({
                    tierOverride: (e.target.value || undefined) as
                      | Tier
                      | undefined,
                  })
                }
              >
                <option value="">Project · {tl(p.defaultTier)}</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
                <option value="luxury">Luxury</option>
              </select>
            </label>
            <label>
              Project rate /{' '}
              {item.customUnit || item.unit || item.measurementType}
              <Num value={rate} onChange={(v) => patch({ rateOverride: v })} />
            </label>
            <label>
              Discount
              <Num
                value={item.discount}
                onChange={(v) => patch({ discount: v })}
              />
            </label>
            <div className="formula">
              {itemMeasure(item).toLocaleString('en-IN')}{' '}
              {item.customUnit || item.unit || item.measurementType} ×{' '}
              {inr(rate)}
            </div>
          </div>
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
          {item.rateOverride !== undefined &&
            item.rateOverride < referenceRate && (
              <div className="rate-saving">
                <span>
                  Original rate{' '}
                  <strong>
                    {inr(referenceRate)} /{' '}
                    {item.customUnit || item.unit || item.measurementType}
                  </strong>
                </span>
                <span>
                  Project rate{' '}
                  <strong>
                    {inr(item.rateOverride)} /{' '}
                    {item.customUnit || item.unit || item.measurementType}
                  </strong>
                </span>
                <span>
                  You save <strong>{inr(savings)}</strong>
                </span>
              </div>
            )}
          {(item.rateOverride !== undefined || item.tierOverride) && (
            <p className="override">
              Project-specific override · global rate card unchanged
            </p>
          )}
          <div className="editor-actions">
            <span>Changes are saved locally as you edit.</span>
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
                  .filter((i) => i.enabled)
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
function Revisions({ s }: { s: Store }) {
  const { id } = useParams(),
    go = useNavigate(),
    p = s.projects.find((x) => x.id === id),
    revs = s.revisions
      .filter((r) => r.projectId === id)
      .sort((a, b) => b.number - a.number);
  if (!p) return <Navigate to="/projects" />;
  return (
    <Page
      title="Revision history"
      sub={`${p.propertyName} · restoring never deletes an earlier snapshot.`}
    >
      <section className="panel revisions">
        {revs.length ? (
          revs.map((r) => (
            <article key={r.id}>
              <b>R{r.number}</b>
              <span>
                <strong>Revision {r.number}</strong>
                <small>
                  {new Date(r.createdAt).toLocaleString('en-IN')} ·{' '}
                  {r.note || 'No note'}
                </small>
              </span>
              <strong>{inr(r.total)}</strong>
              <Button
                variant="outline"
                onClick={() => {
                  s.setProjects(
                    s.projects.map((x) =>
                      x.id === id
                        ? {
                            ...structuredClone(r.snapshot),
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
                <Input type="number" name={t} defaultValue={e.rates[t]} />
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
            'List locally saved quotation projects and current totals.',
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
              total: quoteTotals(p).grandTotal,
            })),
        },
        { signal: c.signal },
      ),
    ).catch(() => {});
    return () => c.abort();
  }, [s.projects]);
  return null;
}
function Root() {
  const s = useStore();
  if (!s.hydrated)
    return <div className="boot">Loading your saved workspace…</div>;
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
