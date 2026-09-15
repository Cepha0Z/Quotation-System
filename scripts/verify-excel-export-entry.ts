import fs from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import * as X from 'xlsx-js-style';
import { createProjectExcelFile } from '../domain/excelExport';
import { itemTotal, quoteTotals } from '../domain/pricing';
import { firmSettings } from '../domain/sample';
import type { Project, QuoteItem } from '../domain/types';

const makeItem = (
  id: string,
  name: string,
  workType: string,
  overrides: Partial<QuoteItem> = {},
): QuoteItem => ({
  id,
  name,
  description:
    'Supply, fabrication and installation as per approved drawings and site measurements.',
  enabled: true,
  measurementType: 'quantity',
  quantity: 1,
  length: 0,
  width: 0,
  height: 0,
  rates: { standard: 1_000, premium: 1_250, luxury: 1_500 },
  discount: 0,
  notes: '',
  workType,
  unit: 'Nos',
  pricingMode: 'unit',
  dimensionUnit: 'ft',
  hsnCode: '',
  measureMode: 'quantity',
  subUnits: [],
  ...overrides,
});

const volumeItems = Array.from({ length: 18 }, (_, index) =>
  makeItem(`volume-${index}`, `Joinery line ${index + 1}`, 'Millwork', {
    quantity: index % 3 === 0 ? 1.5 : index + 1,
    unit: index % 2 === 0 ? 'R.ft' : 'Nos',
    measurementType: index % 2 === 0 ? 'rft' : 'quantity',
    rates: {
      standard: 875 + index * 25,
      premium: 1_100 + index * 25,
      luxury: 1_400 + index * 25,
    },
    hsnCode: index % 4 === 0 ? '94036000' : '',
  }),
);

const project: Project = {
  id: 'excel-qa-project',
  clientName: 'Aria Mehta',
  propertyName: 'Courtyard House',
  layout: '4 BHK',
  carpetArea: 2_487.5,
  defaultTier: 'premium',
  status: 'active',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  projectDiscount: 12_500,
  showRates: true,
  propertyType: 'Villa',
  location: 'Bengaluru',
  notes: '',
  floors: [
    { id: 'custom-floor', name: 'Lower Lounge' },
    { id: 'ground', name: 'Ground Floor' },
    { id: 'first', name: 'First Floor' },
  ],
  rooms: [
    {
      id: 'lower-bedroom',
      name: 'Bedroom',
      floorId: 'custom-floor',
      items: [
        makeItem('long', 'Acoustic feature wall', 'Civil Work', {
          description:
            'Construct a layered acoustic feature wall with concealed support framing, service access, shadow gaps, coordinated electrical cut-outs and final finish preparation to match the approved interior elevation.',
          measurementType: 'sqft',
          measureMode: 'dimensions',
          unit: 'Sq.ft',
          length: 12.75,
          width: 9.5,
          rates: { standard: 410, premium: 525, luxury: 680 },
          hsnCode: '995476',
          notes:
            'Coordinate junctions with skirting and adjacent stone cladding before execution.',
        }),
        makeItem('zero', 'Client-supplied pendant', 'Bought Out', {
          description:
            'Installation allowance for client-supplied decorative pendant.',
          measurementType: 'sqft',
          measureMode: 'quantity',
          unit: 'Sq.ft',
          quantity: 14.47,
          rates: { standard: 0, premium: 0, luxury: 0 },
          hsnCode: '',
        }),
      ],
    },
    {
      id: 'living',
      name: 'Living Room',
      floorId: 'ground',
      items: [
        makeItem('lump', 'Site protection package', 'Civil Work', {
          pricingMode: 'lump-sum',
          measurementType: 'sqft',
          measureMode: 'quantity',
          unit: 'Sq.ft',
          quantity: 32,
          rateOverride: 9_000,
        }),
        makeItem('area-audit', 'Floor tile pricing audit', 'Civil Work', {
          measurementType: 'sqft',
          measureMode: 'quantity',
          unit: 'Sq.ft',
          quantity: 32,
          rateOverride: 9_000,
        }),
        makeItem('components', 'Media console', 'Millwork', {
          measurementType: 'rft',
          measureMode: 'dimensions',
          unit: 'R.ft',
          length: 11.25,
          rates: { standard: 7_500, premium: 9_250, luxury: 12_000 },
          subUnits: [
            {
              id: 'hardware',
              name: 'Hardware package',
              rate: 4_800,
              enabled: true,
            },
            {
              id: 'optional',
              name: 'Optional light',
              rate: 1_200,
              enabled: false,
            },
          ],
        }),
      ],
    },
    {
      id: 'prayer',
      name: 'Prayer Nook',
      floorId: 'ground',
      items: [
        makeItem('stone', 'Stone threshold', 'Flooring', {
          quantity: 2.75,
          unit: 'R.m',
          customUnit: 'R.m',
          rates: { standard: 1_900, premium: 2_250, luxury: 2_800 },
          hsnCode: '6802',
        }),
      ],
    },
    {
      id: 'first-bedroom',
      name: 'Bedroom',
      floorId: 'first',
      items: volumeItems,
    },
  ],
  fees: [
    {
      id: 'design',
      name: 'Design Fee',
      method: 'sqft',
      value: 50,
      discount: 0,
      enabled: true,
    },
    {
      id: 'drawing',
      name: '3D / Drawing',
      method: 'flat',
      value: 35_000,
      discount: 0,
      enabled: true,
    },
    {
      id: 'management',
      name: 'Project Management',
      method: 'percentage',
      value: 6.5,
      discount: 2_500,
      enabled: true,
    },
  ],
};

async function main() {
  const outputDir = path.resolve(
    'outputs/01a08777-ddc9-7ec1-83de-00418b8e5c44',
  );
  await fs.mkdir(outputDir, { recursive: true });
  const generated = await createProjectExcelFile(project, firmSettings, {
    generatedAt: new Date('2026-09-12T00:00:00.000Z'),
  });
  const outputPath = path.join(outputDir, 'I-quotation-refined.xlsx');
  await fs.writeFile(outputPath, generated.bytes);

  const workbook = X.read(generated.bytes, { type: 'array', cellStyles: true });
  const expectedSheets = [
    'Summary',
    'Civil Work',
    'Millwork',
    'Bought Out',
    'Flooring',
  ];
  if (JSON.stringify(workbook.SheetNames) !== JSON.stringify(expectedSheets)) {
    throw new Error(`Unexpected sheet list: ${workbook.SheetNames.join(', ')}`);
  }

  const civilRows = X.utils.sheet_to_json<unknown[]>(
    workbook.Sheets['Civil Work'],
    {
      header: 1,
      raw: true,
    },
  );
  const civilHeaderRows = civilRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row[0] === 'Sl. No.' && row[1] === 'Particulars');
  if (civilHeaderRows.length !== 2) {
    throw new Error(
      'Each Civil Work room must have its own BOQ column header.',
    );
  }
  const civilFloorSections = civilRows.filter(
    (row) => /^\d{2}$/.test(String(row[0] ?? '')) && typeof row[1] === 'string',
  );
  if (
    JSON.stringify(civilFloorSections.map((row) => [row[0], row[1]])) !==
    JSON.stringify([
      ['01', 'LOWER LOUNGE'],
      ['02', 'GROUND FLOOR'],
    ])
  ) {
    throw new Error('Dynamic floor sections or numbering are incorrect.');
  }
  if (civilRows.some((row) => row[1] === 'FIRST FLOOR')) {
    throw new Error(
      'A floor with no Civil Work items was added to the Civil Work sheet.',
    );
  }

  const longItemRow = civilRows.findIndex(
    (row) =>
      typeof row[1] === 'string' && row[1].startsWith('Acoustic feature wall:'),
  );
  if (longItemRow < 0)
    throw new Error('Long Particulars sample row is missing.');
  if (!String(civilRows[longItemRow][1]).includes('12.75L × 9.5H ft')) {
    throw new Error(
      'The exported dimensions do not match the authoritative editor fields.',
    );
  }
  const fixedAmountRow = civilRows.find(
    (row) =>
      typeof row[1] === 'string' &&
      row[1].startsWith('Site protection package'),
  );
  if (
    fixedAmountRow?.[3] !== 32 ||
    fixedAmountRow?.[4] !== 'Sq.ft' ||
    fixedAmountRow?.[5] !== 9_000 ||
    fixedAmountRow?.[6] !== 9_000
  ) {
    throw new Error(
      'Flat-priced items must export the entered amount as their final total.',
    );
  }
  const areaAmountRow = civilRows.find(
    (row) =>
      typeof row[1] === 'string' &&
      row[1].startsWith('Floor tile pricing audit'),
  );
  if (
    areaAmountRow?.[3] !== 32 ||
    areaAmountRow?.[4] !== 'Sq.ft' ||
    areaAmountRow?.[5] !== 9_000 ||
    areaAmountRow?.[6] !== 288_000
  ) {
    throw new Error('Area-priced items must export quantity × unit rate.');
  }
  const boughtOutRows = X.utils.sheet_to_json<unknown[]>(
    workbook.Sheets['Bought Out'],
    { header: 1, raw: true },
  );
  const manualAreaRow = boughtOutRows.find(
    (row) =>
      typeof row[1] === 'string' &&
      row[1].startsWith('Client-supplied pendant'),
  );
  if (manualAreaRow?.[3] !== 14.47 || manualAreaRow?.[4] !== 'Sq.ft') {
    throw new Error(
      'Directly entered total area must be the quantity exported to Excel.',
    );
  }
  const civilSheet = workbook.Sheets['Civil Work'];
  if ((civilSheet['!rows']?.[longItemRow]?.hpt ?? 0) < 60) {
    throw new Error(
      'Long Particulars row did not expand enough for wrapped content.',
    );
  }
  for (const label of [
    'Bedroom subtotal',
    'Lower Lounge subtotal',
    'Living Room subtotal',
    'Ground Floor subtotal',
  ]) {
    if (!civilRows.some((row) => row[0] === label)) {
      throw new Error(`Required subtotal is missing: ${label}.`);
    }
  }

  const findAmount = (sheetName: string, label: string) => {
    const sheet = workbook.Sheets[sheetName];
    const range = X.utils.decode_range(sheet['!ref'] ?? 'A1:A1');
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const first = sheet[X.utils.encode_cell({ r: row, c: 0 })]?.v;
      if (first === label)
        return Number(sheet[X.utils.encode_cell({ r: row, c: 6 })]?.v ?? NaN);
    }
    return Number.NaN;
  };

  const totals = quoteTotals(project);
  const summaryRows = X.utils.sheet_to_json<unknown[]>(
    workbook.Sheets['Summary'],
    { header: 1, raw: true },
  );
  const summaryHeaderRows = summaryRows.filter(
    (row) => row[0] === 'SL. NO.' && row[6] === 'AMOUNT (₹)',
  );
  if (summaryHeaderRows.length !== 2) {
    throw new Error('Summary tables must both include numbered columns.');
  }
  const costSummaryStart = summaryRows.findIndex(
    (row) => row[0] === 'SL. NO.' && row[1] === 'WORK TYPE',
  );
  if (
    costSummaryStart < 0 ||
    summaryRows[costSummaryStart + 1]?.[0] !== 1 ||
    summaryRows[costSummaryStart + 1]?.[1] !== 'Civil Work'
  ) {
    throw new Error('Cost Summary serial numbering is incorrect.');
  }
  const feeSummaryStart = summaryRows.findIndex(
    (row) => row[0] === 'SL. NO.' && row[1] === 'PROFESSIONAL FEE',
  );
  if (
    feeSummaryStart < 0 ||
    summaryRows[feeSummaryStart + 1]?.[0] !== 1 ||
    summaryRows[feeSummaryStart + 1]?.[1] !== 'Design Fee'
  ) {
    throw new Error('Professional fee serial numbering is incorrect.');
  }
  if (findAmount('Summary', 'PROJECT TOTAL') !== totals.grandTotal) {
    throw new Error('Project total does not reconcile.');
  }
  for (const workType of expectedSheets.slice(1)) {
    const expected = project.rooms
      .flatMap((room) => room.items)
      .filter((item) => item.enabled && item.workType === workType)
      .reduce((sum, item) => sum + itemTotal(item, project.defaultTier), 0);
    const actual = findAmount(workType, `${workType.toUpperCase()} TOTAL`);
    if (actual !== expected)
      throw new Error(
        `${workType} total does not reconcile: ${actual} vs ${expected}`,
      );
  }

  const archive = unzipSync(generated.bytes);
  const workbookXml = strFromU8(archive['xl/workbook.xml']);
  if (
    !workbookXml.includes('_xlnm.Print_Area') ||
    !workbookXml.includes('_xlnm.Print_Titles')
  ) {
    throw new Error('Print areas or repeated header rows are missing.');
  }
  const stylesXml = strFromU8(archive['xl/styles.xml']);
  const cellXfsXml =
    stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const cellXfs = [
    ...cellXfsXml.matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g),
  ].map((match) => match[0]);
  const civilSheetXml = strFromU8(archive['xl/worksheets/sheet2.xml']);
  for (let column = 0; column < 7; column += 1) {
    const address = X.utils.encode_cell({ r: longItemRow, c: column });
    const cellTag =
      civilSheetXml.match(new RegExp(`<c[^>]*\\br="${address}"[^>]*>`))?.[0] ??
      '';
    const styleIndex = Number(cellTag.match(/\bs="(\d+)"/)?.[1] ?? 0);
    const borderId = Number(
      cellXfs[styleIndex]?.match(/\bborderId="(\d+)"/)?.[1] ?? 0,
    );
    if (!cellTag || borderId === 0) {
      throw new Error(`Missing item-cell border at ${address}.`);
    }
  }
  for (let index = 0; index < expectedSheets.length; index += 1) {
    const xml = strFromU8(archive[`xl/worksheets/sheet${index + 1}.xml`]);
    if (/<pane\b|state="frozen"/.test(xml)) {
      throw new Error(
        `${expectedSheets[index]} unexpectedly contains frozen panes.`,
      );
    }
    for (const token of [
      'orientation="landscape"',
      'fitToWidth="1"',
      '<pageMargins',
    ]) {
      if (!xml.includes(token))
        throw new Error(`${expectedSheets[index]} is missing ${token}.`);
    }
  }

  const errorPattern =
    /#(?:REF!|VALUE!|DIV\/0!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/;
  for (const sheetName of workbook.SheetNames) {
    const rows = X.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
    });
    if (
      rows.some((row) =>
        row.some(
          (value) =>
            (typeof value === 'string' || typeof value === 'number') &&
            errorPattern.test(String(value)),
        ),
      )
    ) {
      throw new Error(`Spreadsheet error found on ${sheetName}.`);
    }
  }

  const group = makeItem('kitchen-group', 'Kitchen Cabinets', 'Civil Work', {
    itemType: 'composite',
    childrenOrder: ['wardrobe', 'tv-unit'],
    description: 'Complete kitchen cabinetry scope',
    quantity: 5,
    unit: 'Sq.ft',
    measurementType: 'sqft',
    measureMode: 'quantity',
    rates: { standard: 999_999, premium: 999_999, luxury: 999_999 },
  });
  const component = (
    id: string,
    name: string,
    quantity: number,
    unit: QuoteItem['unit'],
    rate: number,
  ) =>
    makeItem(id, name, 'Civil Work', {
      parentItemId: group.id,
      quantity,
      unit,
      measurementType: unit === 'R.ft' ? 'rft' : 'sqft',
      measureMode: 'quantity',
      rates: { standard: rate, premium: rate, luxury: rate },
    });
  const wardrobe = component('wardrobe', 'Wardrobe', 32, 'Sq.ft', 189);
  const tvUnit = component('tv-unit', 'TV Unit', 32, 'Sq.ft', 1_200);
  const bedBack = makeItem('bed-back', 'Bed Back Panel', 'Civil Work', {
    quantity: 32,
    unit: 'Sq.ft',
    measurementType: 'sqft',
    measureMode: 'quantity',
    rates: { standard: 1_100, premium: 1_100, luxury: 1_100 },
  });
  const anotherSimple = makeItem(
    'another-simple',
    'Another Simple Item',
    'Civil Work',
    { rates: { standard: 0, premium: 0, luxury: 0 } },
  );
  const storageGroup = makeItem('storage-group', 'Living Storage', 'Civil Work', {
    itemType: 'composite',
    childrenOrder: ['shelves', 'base-unit'],
    quantity: 1,
    unit: 'Nos',
    rates: { standard: 0, premium: 0, luxury: 0 },
  });
  const shelves = makeItem('shelves', 'Shelves', 'Civil Work', {
    parentItemId: storageGroup.id,
    rates: { standard: 0, premium: 0, luxury: 0 },
  });
  const baseUnit = makeItem('base-unit', 'Base Unit', 'Civil Work', {
    parentItemId: storageGroup.id,
    rates: { standard: 0, premium: 0, luxury: 0 },
  });
  const compositeProject: Project = {
    ...project,
    id: 'composite-export-project',
    defaultTier: 'standard',
    projectDiscount: 0,
    floors: [{ id: 'ground', name: 'Ground Floor' }],
    rooms: [
      {
        id: 'living',
        name: 'Living Room',
        floorId: 'ground',
        items: [bedBack, group, tvUnit, wardrobe, anotherSimple],
      },
      {
        id: 'study',
        name: 'Study',
        floorId: 'ground',
        items: [storageGroup, baseUnit, shelves],
      },
    ],
    fees: [],
  };
  const compositeExport = await createProjectExcelFile(
    compositeProject,
    firmSettings,
    { generatedAt: new Date('2026-09-12T00:00:00.000Z') },
  );
  const compositeWorkbook = X.read(compositeExport.bytes, {
    type: 'array',
    cellStyles: true,
  });
  const compositeRows = X.utils.sheet_to_json<unknown[]>(
    compositeWorkbook.Sheets['Civil Work'],
    { header: 1, raw: true },
  );
  const groupRow = compositeRows.findIndex(
    (row) => row[1] === 'Kitchen Cabinets: Complete kitchen cabinetry scope',
  );
  if (
    groupRow < 0 ||
    compositeRows[groupRow][3] !== 5 ||
    compositeRows[groupRow][4] !== 'Sq.ft' ||
    compositeRows[groupRow][5] !== '—' ||
    compositeRows[groupRow][6] !== 44_448
  )
    throw new Error('Composite parent row or display-only total is incorrect.');
  if (compositeRows[groupRow][0] !== 2)
    throw new Error('Composite parent did not consume a top-level serial number.');
  const exportedNames = compositeRows
    .slice(groupRow + 1, groupRow + 3)
    .map((row) => String(row[1]).split(':')[0]);
  if (
    JSON.stringify(exportedNames) !==
    JSON.stringify([
      'Wardrobe',
      'TV Unit',
    ])
  )
    throw new Error('Composite children did not follow childrenOrder.');
  const exportedChildSerials = compositeRows
    .slice(groupRow + 1, groupRow + 3)
    .map((row) => row[0]);
  if (JSON.stringify(exportedChildSerials) !== JSON.stringify(['2.1', '2.2']))
    throw new Error('Composite child parent.child numbering is incorrect.');
  const nextSimpleRow = compositeRows.find(
    (row) => String(row[1]).startsWith('Another Simple Item'),
  );
  if (nextSimpleRow?.[0] !== 3)
    throw new Error('Top-level numbering leaked across composite children.');
  const compositeSheet = compositeWorkbook.Sheets['Civil Work'];
  const mergedAcrossGroup = (compositeSheet['!merges'] ?? []).some((merge) =>
    merge.s.r === groupRow && merge.e.r === groupRow && merge.s.c <= 1 && merge.e.c >= 5,
  );
  if (mergedAcrossGroup)
    throw new Error('Composite parent must remain a normal unmerged BOQ row.');
  const compositeArchive = unzipSync(compositeExport.bytes);
  const compositeStylesXml = strFromU8(compositeArchive['xl/styles.xml']);
  if (!/indent="2"/.test(compositeStylesXml))
    throw new Error('Composite child hierarchy must use Excel indentation.');
  const storageRow = compositeRows.findIndex((row) =>
    String(row[1]).startsWith('Living Storage'),
  );
  const storageChildren = compositeRows
    .slice(storageRow + 1, storageRow + 3)
    .map((row) => String(row[1]).split(':')[0]);
  if (
    storageRow < 0 ||
    compositeRows[storageRow][0] !== 4 ||
    compositeRows[storageRow + 1][0] !== '4.1' ||
    compositeRows[storageRow + 2][0] !== '4.2' ||
    JSON.stringify(storageChildren) !== JSON.stringify(['Shelves', 'Base Unit'])
  )
    throw new Error('Multiple composite groups did not preserve separate child order.');
  const livingSubtotal = compositeRows.find(
    (row) => row[0] === 'Living Room subtotal',
  );
  if (
    livingSubtotal?.[6] !== 79_648 ||
    quoteTotals(compositeProject).interior !== 79_648
  )
    throw new Error('Composite export double-counted its parent or children.');

  console.log(
    JSON.stringify(
      {
        outputPath,
        sheets: workbook.SheetNames,
        totals,
        bytes: generated.bytes.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
