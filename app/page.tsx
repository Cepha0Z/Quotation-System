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
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Download,
  FileClock,
  FileSpreadsheet,
  Gauge,
  Menu,
  MoreHorizontal,
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
import {
  firmSettings as ds,
  rateCard as dr,
  sampleProject,
} from '@/domain/sample';
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
import type {
  FirmSettings,
  FeeMethod,
  MeasurementType,
  Project,
  QuoteItem,
  RateCardItem,
  Revision,
  Tier,
} from '@/domain/types';
import {
  projectRepository,
  rateCardRepository,
  revisionRepository,
  settingsRepository,
} from '@/storage/repositories';
const uid = () => crypto.randomUUID(),
  tl = (t: Tier) => t[0].toUpperCase() + t.slice(1);
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
type Store = {
  hydrated: boolean;
  projects: Project[];
  setProjects: (v: Project[]) => void;
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
    [ready, setReady] = useState(false);
  useEffect(() => {
    const savedProjects = projectRepository.list([]);
    const initialProjects = savedProjects.length
      ? savedProjects.map((project) =>
          project.propertyName === 'Sharma Residence'
            ? {
                ...project,
                fees: project.fees.map((fee) =>
                  fee.name === 'Design Fee' && fee.discount === 20000
                    ? { ...fee, discount: 0 }
                    : fee,
                ),
              }
            : project,
        )
      : [sampleProject];
    sp(initialProjects);
    projectRepository.saveAll(initialProjects);
    const savedRates = rateCardRepository.list([]);
    const initialRates = savedRates.length ? savedRates : dr;
    sr(initialRates);
    if (!savedRates.length) rateCardRepository.saveAll(initialRates);
    const initialSettings = settingsRepository.get(ds);
    ss(initialSettings);
    settingsRepository.save(initialSettings);
    sv(revisionRepository.list());
    setReady(true);
  }, []);
  return {
    hydrated: ready,
    projects,
    setProjects: (v) => {
      sp(v);
      if (ready) projectRepository.saveAll(v);
    },
    rates,
    setRates: (v) => {
      sr(v);
      if (ready) rateCardRepository.saveAll(v);
    },
    settings,
    setSettings: (v) => {
      ss(v);
      if (ready) settingsRepository.save(v);
    },
    revisions,
    setRevisions: (v) => {
      sv(v);
      if (ready) revisionRepository.saveAll(v);
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
          <b>IX</b>
          <span>
            <strong>INTERIX</strong>
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
            <strong>Interix Studio</strong>
          </div>
          <span className="saved">● Saved locally</span>
        </header>
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
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section className="modal">
        <header>
          <div>
            <small>INTERIX</small>
            <h2>{title}</h2>
          </div>
          <Button variant="ghost" size="icon-lg" onClick={close}>
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
    go = useNavigate();
  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p: Project = {
        id: uid(),
        clientName: String(f.get('client')),
        propertyName: String(f.get('property')),
        layout: String(f.get('layout')),
        carpetArea: Number(f.get('area')) || 0,
        defaultTier: String(f.get('tier')) as Tier,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        rooms: [],
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
    setOpen(false);
    go('/projects/' + p.id);
  }
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <Plus />
        New Project
      </Button>
      {open && (
        <Modal title="Create new project" close={() => setOpen(false)}>
          <form className="form-grid" onSubmit={create}>
            <label>
              Client Name
              <Input name="client" required placeholder="Arjun Sharma" />
            </label>
            <label>
              Property Name
              <Input name="property" required placeholder="Sharma Residence" />
            </label>
            <label>
              Layout
              <select name="layout" defaultValue="4 BHK">
                {['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK', 'Other'].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Carpet Area
              <Input name="area" type="number" defaultValue="2400" />
            </label>
            <label>
              Default Tier
              <select name="tier" defaultValue="premium">
                {s.settings.enabledTiers.map((t) => (
                  <option value={t} key={t}>
                    {tl(t)}
                  </option>
                ))}
              </select>
            </label>
            <div className="actions">
              <Button
                variant="outline"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">Create & open builder</Button>
            </div>
          </form>
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
  measurementType: r?.unit ?? 'sqft',
  quantity: 1,
  length: 8,
  width: 4,
  height: 0,
  rates: r?.rates ?? { standard: 1000, premium: 1500, luxury: 2000 },
  discount: 0,
  notes: '',
  subUnits: r?.subUnits ?? [],
});

async function exportProjectExcel(project: Project, settings: FirmSettings) {
  const X = await import('xlsx-js-style');
  const totals = quoteTotals(project);
  const rows: (string | number)[][] = [
    [settings.letterheadName],
    [settings.address],
    [],
    [`QUOTATION FOR ${project.clientName.toUpperCase()}`],
    [
      `${project.propertyName}  ·  ${project.layout}  ·  ${project.carpetArea.toLocaleString('en-IN')} sqft  ·  ${tl(project.defaultTier)}`,
    ],
    [
      `Quotation date: ${new Date().toLocaleDateString('en-IN')}  ·  Reference: QT-${project.id.slice(0, 6).toUpperCase()}`,
    ],
    [],
  ];
  const roomHeaderRows: number[] = [],
    tableHeaderRows: number[] = [],
    moneyRows: number[] = [];
  project.rooms.forEach((room) => {
    roomHeaderRows.push(rows.length);
    rows.push([
      room.name.toUpperCase(),
      '',
      '',
      '',
      '',
      '',
      roomTotal(room, project.defaultTier),
    ]);
    tableHeaderRows.push(rows.length);
    rows.push([
      'Item',
      'Description',
      'Measurement',
      'Tier',
      'Rate',
      'Discount',
      'Total',
    ]);
    room.items
      .filter((item) => item.enabled)
      .forEach((item) => {
        moneyRows.push(rows.length);
        rows.push([
          item.name,
          item.description,
          `${itemMeasure(item).toLocaleString('en-IN')} ${item.measurementType}`,
          tl(item.tierOverride ?? project.defaultTier),
          itemBaseRate(item, project.defaultTier),
          item.discount ? -item.discount : 0,
          itemTotal(item, project.defaultTier),
        ]);
      });
    rows.push([]);
  });
  const summaryStart = rows.length;
  rows.push(
    ['FINANCIAL SUMMARY'],
    ['Interior Work', '', '', '', '', '', totals.interior],
    ...totals.fees.map((fee) => [
      fee.name,
      '',
      '',
      '',
      '',
      fee.original - fee.total ? -(fee.original - fee.total) : '',
      fee.total,
    ]),
    ['Subtotal', '', '', '', '', '', totals.subtotal],
    ['GRAND TOTAL', '', '', '', '', '', totals.grandTotal],
    [],
    [settings.quotationNotes],
    [settings.terms],
  );
  const ws = X.utils.aoa_to_sheet(rows);
  const deep = '173A31',
    warm = 'F4F1EA',
    line = 'D9DDD8',
    accent = 'B77850',
    charcoal = '26332E';
  ws['!cols'] = [
    { wch: 24 },
    { wch: 38 },
    { wch: 18 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 19 },
  ];
  ws['!rows'] = rows.map((_, i) => ({
    hpt: i === 0 ? 31 : roomHeaderRows.includes(i) ? 25 : 21,
  }));
  ws['!merges'] = [
    0,
    1,
    3,
    4,
    5,
    summaryStart,
    rows.length - 2,
    rows.length - 1,
  ].map((r) => ({ s: { r, c: 0 }, e: { r, c: r === summaryStart ? 6 : 6 } }));
  ws['!freeze'] = {
    xSplit: 0,
    ySplit: 7,
    topLeftCell: 'A8',
    activePane: 'bottomLeft',
    state: 'frozen',
  };
  ws['!autofilter'] = { ref: `A${tableHeaderRows[0] + 1}:G${rows.length}` };
  ws['!margins'] = {
    left: 0.35,
    right: 0.35,
    top: 0.5,
    bottom: 0.5,
    header: 0.2,
    footer: 0.2,
  };
  ws['!pageSetup'] = {
    orientation: 'landscape',
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  const range = X.utils.decode_range(ws['!ref']!);
  for (let r = range.s.r; r <= range.e.r; r++)
    for (let c = 0; c <= 6; c++) {
      const cell = ws[X.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = {
        font: { name: 'Aptos', sz: 10, color: { rgb: charcoal } },
        alignment: {
          vertical: 'center',
          horizontal: c >= 4 ? 'right' : 'left',
          wrapText: true,
        },
        border: { bottom: { style: 'hair', color: { rgb: line } } },
      };
      if (c >= 4 && typeof cell.v === 'number')
        cell.s.numFmt = '₹#,##0;[Red]-₹#,##0';
    }
  ws.A1.s = {
    font: { name: 'Aptos Display', sz: 22, bold: true, color: { rgb: deep } },
    alignment: { vertical: 'center' },
  };
  ws.A2.s = {
    font: { name: 'Aptos', sz: 9, color: { rgb: '65716C' } },
    alignment: { vertical: 'center' },
  };
  ws.A4.s = {
    font: {
      name: 'Aptos Display',
      sz: 16,
      bold: true,
      color: { rgb: charcoal },
    },
    alignment: { vertical: 'center' },
  };
  ws.A5.s = {
    font: { name: 'Aptos', sz: 11, bold: true, color: { rgb: accent } },
    alignment: { vertical: 'center' },
  };
  roomHeaderRows.forEach((r) => {
    for (let c = 0; c <= 6; c++) {
      const cell =
        ws[X.utils.encode_cell({ r, c })] ??
        (ws[X.utils.encode_cell({ r, c })] = { t: 's', v: '' });
      cell.s = {
        fill: { fgColor: { rgb: warm } },
        font: { name: 'Aptos', sz: 11, bold: true, color: { rgb: deep } },
        alignment: {
          vertical: 'center',
          horizontal: c === 6 ? 'right' : 'left',
        },
        border: { bottom: { style: 'medium', color: { rgb: accent } } },
        numFmt: c === 6 ? '₹#,##0' : undefined,
      };
    }
  });
  tableHeaderRows.forEach((r) => {
    for (let c = 0; c <= 6; c++) {
      const cell = ws[X.utils.encode_cell({ r, c })];
      cell.s = {
        fill: { fgColor: { rgb: deep } },
        font: { name: 'Aptos', sz: 9, bold: true, color: { rgb: 'FFFFFF' } },
        alignment: {
          vertical: 'center',
          horizontal: c >= 4 ? 'right' : 'left',
        },
        border: { bottom: { style: 'thin', color: { rgb: deep } } },
      };
    }
  });
  for (let r = summaryStart; r <= summaryStart + 6; r++) {
    for (let c = 0; c <= 6; c++) {
      const cell = ws[X.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = {
        font: {
          name: 'Aptos',
          sz: r === summaryStart + 6 ? 13 : 10,
          bold:
            r === summaryStart ||
            r === summaryStart + 5 ||
            r === summaryStart + 6,
          color: { rgb: r === summaryStart ? 'FFFFFF' : deep },
        },
        fill:
          r === summaryStart
            ? { fgColor: { rgb: deep } }
            : r === summaryStart + 6
              ? { fgColor: { rgb: warm } }
              : undefined,
        alignment: {
          vertical: 'center',
          horizontal: c === 6 ? 'right' : 'left',
        },
        border: {
          bottom: {
            style: r === summaryStart + 6 ? 'medium' : 'thin',
            color: { rgb: r === summaryStart + 6 ? accent : line },
          },
        },
        numFmt: c === 6 ? '₹#,##0;[Red]-₹#,##0' : undefined,
      };
    }
  }
  const wb = X.utils.book_new();
  wb.Props = {
    Title: `Quotation for ${project.clientName}`,
    Subject: project.propertyName,
    Author: settings.letterheadName,
    Company: settings.firmName,
  };
  X.utils.book_append_sheet(wb, ws, 'Quotation');
  X.writeFile(
    wb,
    `${project.propertyName.replace(/\s+/g, '-')}-quotation.xlsx`,
    { compression: true },
  );
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
    [deleteProject, setDeleteProject] = useState(false),
    [editingItemId, setEditingItemId] = useState<string | null>(null),
    [roomsOpen, setRoomsOpen] = useState(() => window.innerWidth > 1100),
    [summaryOpen, setSummaryOpen] = useState(() => window.innerWidth > 1100);
  if (!p && !s.hydrated)
    return <div className="boot">Preparing your quotation workspace…</div>;
  if (!p) return <Navigate to="/projects" />;
  const room = p.rooms.find((r) => r.id === rid) ?? p.rooms[0],
    update = (fn: (p: Project) => Project) =>
      s.setProjects(
        s.projects.map((x) =>
          x.id === id ? { ...fn(x), updatedAt: new Date().toISOString() } : x,
        ),
      ),
    tot = quoteTotals(p);
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
  function saveRev() {
    const note = prompt('Revision note (optional)') ?? '',
      prior = s.revisions.filter((r) => r.projectId === p.id);
    s.setRevisions([
      ...s.revisions,
      {
        id: uid(),
        projectId: p.id,
        number: prior.length + 1,
        createdAt: new Date().toISOString(),
        total: tot.grandTotal,
        note,
        snapshot: structuredClone(p),
      },
    ]);
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
          <Button variant="outline" className="save-revision" onClick={saveRev}>
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
                    const name = prompt('Rename project', p.propertyName);
                    if (name?.trim())
                      update((q) => ({ ...q, propertyName: name.trim() }));
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
      <div
        className={`builder-grid ${roomsOpen ? 'rooms-open' : 'rooms-closed'} ${summaryOpen ? 'summary-open' : 'summary-closed'}`}
      >
        <aside className={`rooms ${roomsOpen ? 'panel-open' : 'panel-closed'}`}>
          <header>
            <b>ROOMS</b>
            <button onClick={() => setRoomsOpen(false)} aria-label="Hide rooms">
              <PanelLeftClose />
            </button>
          </header>
          {p.rooms.map((r, i) => (
            <article
              key={r.id}
              className={r.id === room?.id ? 'selected' : ''}
              onClick={() => setRid(r.id)}
            >
              <button>
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.items.filter((x) => x.enabled).length} enabled
                  </small>
                </span>
                <b>{inr(roomTotal(r, p.defaultTier))}</b>
              </button>
              <div>
                <button
                  disabled={!i}
                  onClick={(e) => {
                    e.stopPropagation();
                    update((q) => {
                      const a = [...q.rooms];
                      [a[i - 1], a[i]] = [a[i], a[i - 1]];
                      return { ...q, rooms: a };
                    });
                  }}
                >
                  <ChevronUp />
                </button>
                <button
                  disabled={i === p.rooms.length - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    update((q) => {
                      const a = [...q.rooms];
                      [a[i + 1], a[i]] = [a[i], a[i + 1]];
                      return { ...q, rooms: a };
                    });
                  }}
                >
                  <ChevronDown />
                </button>
              </div>
            </article>
          ))}
          <Button variant="ghost" size="lg" onClick={() => setRoomModal(true)}>
            <Plus />
            Add room
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
                <span>
                  {room.items.filter((item) => item.enabled).length} of{' '}
                  {room.items.length} components enabled
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
              <header>
                <div>
                  <small>SELECTED ROOM</small>
                  <h2>{room.name}</h2>
                </div>
                <span>
                  <strong>{inr(roomTotal(room, p.defaultTier))}</strong>
                  <small>Room total</small>
                </span>
              </header>
              {room.items.map((item, i) => (
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
                              items: r.items.filter((x) => x.id !== item.id),
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
                              items: r.items.filter((x) => x.id !== item.id),
                            }
                          : r.id === dest
                            ? {
                                ...r,
                                items: [...r.items, structuredClone(item)],
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
              ))}
              <Button
                className="add-item"
                variant="outline"
                size="lg"
                onClick={() => setItemModal(true)}
              >
                <Plus />
                Add item to {room.name}
              </Button>
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
                  const r = { id: uid(), name, items: [] };
                  update((q) => ({ ...q, rooms: [...q.rooms, r] }));
                  setRid(r.id);
                  setRoomModal(false);
                }}
              >
                {name}
              </Button>
            ))}
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
                        ? { ...x, items: [...x.items, fresh(r)] }
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
                      ? { ...x, items: [...x.items, fresh()] }
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
                s.setProjects(
                  s.projects.filter((project) => project.id !== p.id),
                );
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
function QuickMeasure({
  item,
  patch,
}: {
  item: QuoteItem;
  patch: (x: Partial<QuoteItem>) => void;
}) {
  if (item.measurementType === 'flat')
    return <span className="quick-measure flat-measure">Flat amount</span>;
  const field = (
    label: string,
    value: number,
    key: keyof QuoteItem,
    unit = '',
  ) => (
    <label>
      <span>{label}</span>
      <Input
        aria-label={`${item.name} ${label}`}
        type="number"
        min="0"
        value={value}
        onChange={(event) => patch({ [key]: Number(event.target.value) || 0 })}
      />
      {unit && <b>{unit}</b>}
    </label>
  );
  return (
    <div className="quick-measure">
      {item.measurementType === 'sqft' && (
        <>
          {field('Length', item.length, 'length', 'ft')}
          <i>×</i>
          {field('Width', item.width, 'width', 'ft')}
          <em>{itemMeasure(item).toLocaleString('en-IN')} sqft</em>
        </>
      )}
      {item.measurementType === 'rft' && (
        <>
          {field('Length', item.length, 'length', 'ft')}
          <em>{itemMeasure(item).toLocaleString('en-IN')} rft</em>
        </>
      )}
      {item.measurementType === 'quantity' && (
        <>
          {field('Quantity', item.quantity, 'quantity')}
          <em>{itemMeasure(item).toLocaleString('en-IN')} units</em>
        </>
      )}
    </div>
  );
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
      <header>
        <div className="item-title">
          <Switch
            checked={item.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
          />
          <span>
            <strong>{item.name}</strong>
            <small>{item.description || 'No description'}</small>
            <QuickMeasure item={item} patch={patch} />
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
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Done' : 'Edit'}
        </Button>
        <div className="item-actions-wrap" ref={menuRef}>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => setMore(!more)}
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
              Measurement
              <select
                value={item.measurementType}
                onChange={(e) =>
                  patch({ measurementType: e.target.value as MeasurementType })
                }
              >
                <option value="sqft">Square feet</option>
                <option value="rft">Running feet</option>
                <option value="quantity">Quantity</option>
                <option value="flat">Flat amount</option>
              </select>
            </label>
            {item.measurementType === 'sqft' && (
              <>
                <label>
                  Length (ft)
                  <Num
                    value={item.length}
                    onChange={(v) => patch({ length: v })}
                  />
                </label>
                <label>
                  Width (ft)
                  <Num
                    value={item.width}
                    onChange={(v) => patch({ width: v })}
                  />
                </label>
              </>
            )}
            {item.measurementType === 'rft' && (
              <label>
                Length (ft)
                <Num
                  value={item.length}
                  onChange={(v) => patch({ length: v })}
                />
              </label>
            )}
            {item.measurementType === 'quantity' && (
              <label>
                Quantity
                <Num
                  value={item.quantity}
                  onChange={(v) => patch({ quantity: v })}
                />
              </label>
            )}
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
              Project rate / {item.measurementType}
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
              {itemMeasure(item).toLocaleString('en-IN')} {item.measurementType}{' '}
              × {inr(rate)}
            </div>
          </div>
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
                    {inr(referenceRate)} / {item.measurementType}
                  </strong>
                </span>
                <span>
                  Project rate{' '}
                  <strong>
                    {inr(item.rateOverride)} / {item.measurementType}
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
}: {
  p: Project;
  update: (f: (p: Project) => Project) => void;
  open: boolean;
  close: () => void;
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
    await exportProjectExcel(p, s.settings);
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
        <Button onClick={() => window.print()}>
          <Printer />
          Print / Save PDF
        </Button>
      </div>
      <article className="document">
        <header>
          <b>IX</b>
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
              {s.settings.email} · {s.settings.phone}
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
          name: 'list_interix_projects',
          title: 'List Interix projects',
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
