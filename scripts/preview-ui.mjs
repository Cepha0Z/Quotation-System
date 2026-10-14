// Isolated, in-memory UI review. Never connects to Firebase or serves production data.
// Run: node scripts/preview-ui.mjs, then http://127.0.0.1:4174
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import path from 'node:path';

const fixture = `
function useStore(): Store {
  const [rates, setRates] = useState(dr);
  const [settings, setSettings] = useState(ds);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [projects, setProjects] = useState<Project[]>(() => [{
    id: 'review', propertyName: 'Courtyard Residence', clientName: 'Sample client',
    layout: '4 BHK', carpetArea: 2400, defaultTier: 'standard', status: 'active',
    createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
    projectDiscount: 0, showRates: true, fees: createDefaultFees(),
    floors: [{ id: 'ground', name: 'Ground Floor' }, { id: 'first', name: 'First Floor' }],
    rooms: [{ id: 'living', name: 'Living Room', floorId: 'ground', items: [
      ...dr.slice(0, 3).map((r, i) => ({ id: 'item-' + i, rateCardId: r.id,
        name: r.name, description: r.description, rates: r.rates, enabled: true,
        measurementType: 'sqft', measureMode: 'dimensions', length: 8, width: 4,
        height: 4, quantity: 1, unit: 'Sq.ft', dimensionUnit: 'ft', discount: 0,
        pricingMode: 'unit', rateSource: 'template', workType: 'Millwork', notes: '', subUnits: [] }))
    ] }, { id: 'kitchen', name: 'Kitchen', floorId: 'ground', items: [] },
    { id: 'bedroom', name: 'Master Bedroom', floorId: 'first', items: [] }]
  }]);
  const employee = new URLSearchParams(window.location.search).has('employee');
  return {
    authReady: true, hydrated: true, saveState: 'saved', storageError: null,
    user: { uid: 'preview', email: 'preview@example.invalid', displayName: 'UI review (local only)', role: employee ? 'employee' : 'admin' },
    canManageFinancials: !employee, projects, setProjects,
    saveProjectsNow: async (next) => setProjects(next),
    deleteProject: async (id) => setProjects(projects.filter(p => p.id !== id)),
    deleteRoom: async (id, rid) => setProjects(projects.map(p => p.id === id ? { ...p, rooms: p.rooms.filter(r => r.id !== rid) } : p)),
    rates, setRates, settings, setSettings, revisions,
    setRevisions: async (next) => setRevisions(next),
    setItemPricing: async (pid, rid, iid, pricing) => setProjects(projects.map(p => p.id === pid ? { ...p, rooms: p.rooms.map(r => r.id === rid ? { ...r, items: r.items.map(i => i.id === iid ? { ...i, ...pricing } : i) } : r) } : p)),
    signIn: async () => {}, signUp: async () => {}, signOut: async () => {},
    localMigration: null, migrateLocal: async () => 0,
  };
}
`;

const server = await createServer({
  configFile: false,
  define: { 'process.env': '{}' },
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { '@': process.cwd() } },
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  plugins: [
    react(),
    {
      name: 'isolated-ui-review',
      resolveId(id) {
        if (id === '/review.tsx' || id === path.resolve('work/review.tsx'))
          return path.resolve('work/review.tsx');
      },
      async load(id) {
        if (id !== path.resolve('work/review.tsx')) return;
        const source = await fs.readFile('app/page.tsx', 'utf8');
        return (
          source
            .replace(
              /function useStore\(\): Store \{[\s\S]*?\nconst nav =/,
              fixture + '\nconst nav =',
            )
            .replace('if (!firebaseConfigured)', 'if (false)')
            .replace('<WebTool s={s} />', '')
            .replaceAll('Synced to Firebase', 'Local UI review — not synced') +
          '\nimport { createRoot } from "react-dom/client"; const reviewHost = document.getElementById("root")! as HTMLElement & { reviewRoot?: ReturnType<typeof createRoot> }; reviewHost.reviewRoot ??= createRoot(reviewHost); reviewHost.reviewRoot.render(<Home />);'
        );
      },
      configureServer(server) {
        server.watcher.add(path.resolve('app/page.tsx'));
        server.watcher.on('change', (file) => {
          if (file !== path.resolve('app/page.tsx')) return;
          const module = server.moduleGraph.getModuleById(
            path.resolve('work/review.tsx'),
          );
          if (module) server.moduleGraph.invalidateModule(module);
          server.ws.send({ type: 'full-reload' });
        });
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.split('?')[0] !== '/') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(
            await server.transformIndexHtml(
              '/',
              '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BOQ UI review · local fixture</title><link rel="stylesheet" href="/app/globals.css"></head><body><div id="root"></div><script type="module" src="/review.tsx"></script></body></html>',
            ),
          );
        });
      },
    },
  ],
});
await server.listen();
console.log(
  'UI review: http://127.0.0.1:4174/#/projects/review (add ?employee for employee UI)',
);
