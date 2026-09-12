import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { WORK_TYPES, normalizeProject, unitForMeasurement } from './boq';
import { itemBaseRate, itemMeasure, itemTotal, quoteTotals } from './pricing';
import type { FirmSettings, Project } from './types';

type Cell = {
  v?: unknown;
  t?: string;
  s?: Record<string, unknown>;
};

type Worksheet = Record<string, unknown>;

type BorderStyle = 'hair' | 'thin' | 'medium' | 'double';

const EXCEL_THEME = {
  font: 'Aptos',
  colors: {
    green: '0B4A3F',
    greenDark: '07382F',
    greenSoft: 'E5EFEA',
    greenPale: 'F1F6F3',
    warm: 'F7F4EE',
    white: 'FFFFFF',
    ink: '18211E',
    muted: '66706C',
    line: 'B8C0BC',
    lineSoft: 'D9DEDB',
  },
  numberFormats: {
    currency: '₹#,##0.00;[Red]-₹#,##0.00;₹0.00',
    quantity: '#,##0.##',
  },
  detailColumns: [
    { wch: 7 },
    { wch: 72 },
    { wch: 13 },
    { wch: 11 },
    { wch: 11 },
    { wch: 16 },
    { wch: 19 },
  ],
  summaryColumns: [
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 21 },
  ],
  rowHeights: {
    company: 30,
    contact: 20,
    spacer: 10,
    title: 28,
    metadata: 22,
    section: 27,
    columns: 25,
    floor: 29,
    space: 25,
    subtotal: 23,
    floorSubtotal: 25,
    total: 31,
    notes: 22,
  },
} as const;

const c = EXCEL_THEME.colors;

const edge = (style: BorderStyle, color: string = c.line) => ({
  style,
  color: { rgb: color },
});

const borders = {
  grid: {
    top: edge('thin', c.lineSoft),
    bottom: edge('thin', c.lineSoft),
    left: edge('thin', c.lineSoft),
    right: edge('thin', c.lineSoft),
  },
  header: {
    top: edge('medium', c.greenDark),
    bottom: edge('medium', c.greenDark),
    left: edge('thin', c.white),
    right: edge('thin', c.white),
  },
  section: {
    top: edge('medium', c.green),
    bottom: edge('medium', c.green),
    left: edge('thin', c.green),
    right: edge('thin', c.green),
  },
  subtotal: {
    top: edge('medium', c.line),
    bottom: edge('medium', c.line),
    left: edge('thin', c.lineSoft),
    right: edge('thin', c.lineSoft),
  },
  floorSubtotal: {
    top: edge('medium', c.green),
    bottom: edge('medium', c.green),
    left: edge('thin', c.green),
    right: edge('thin', c.green),
  },
  total: {
    top: edge('double', c.greenDark),
    bottom: edge('medium', c.greenDark),
    left: edge('medium', c.greenDark),
    right: edge('medium', c.greenDark),
  },
} as const;

const fill = (rgb: string) => ({ fgColor: { rgb } });

function font(
  size: number,
  options: { bold?: boolean; color?: string; italic?: boolean } = {},
) {
  return {
    name: EXCEL_THEME.font,
    sz: size,
    bold: options.bold,
    italic: options.italic,
    color: { rgb: options.color ?? c.ink },
  };
}

function getCell(
  X: typeof import('xlsx-js-style'),
  ws: Worksheet,
  row: number,
  column: number,
) {
  const address = X.utils.encode_cell({ r: row, c: column });
  const existing = ws[address] as Cell | undefined;
  if (existing) return existing;
  const cell: Cell = { t: 's', v: '' };
  ws[address] = cell;
  return cell;
}

function styleRow(
  X: typeof import('xlsx-js-style'),
  ws: Worksheet,
  row: number,
  styleForColumn: (column: number, cell: Cell) => Record<string, unknown>,
) {
  for (let column = 0; column < 7; column += 1) {
    const cell = getCell(X, ws, row, column);
    cell.s = styleForColumn(column, cell);
  }
}

function applyOuterFrame(
  X: typeof import('xlsx-js-style'),
  ws: Worksheet,
  lastRow: number,
) {
  for (let row = 0; row <= lastRow; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      if (row !== 0 && row !== lastRow && column !== 0 && column !== 6) continue;
      const cell = getCell(X, ws, row, column);
      const style = cell.s ?? {};
      const border = (style.border as Record<string, unknown> | undefined) ?? {};
      cell.s = {
        ...style,
        border: {
          ...border,
          ...(row === 0 ? { top: edge('medium', c.greenDark) } : {}),
          ...(row === lastRow ? { bottom: edge('medium', c.greenDark) } : {}),
          ...(column === 0 ? { left: edge('medium', c.greenDark) } : {}),
          ...(column === 6 ? { right: edge('medium', c.greenDark) } : {}),
        },
      };
    }
  }
}

function mergeRow(merges: { s: { r: number; c: number }; e: { r: number; c: number } }[], row: number, endColumn = 6) {
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: endColumn } });
}

function mergeLabelRow(
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[],
  row: number,
) {
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: 5 } });
}

function scalarText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function meaningful(value: unknown) {
  const text = scalarText(value).trim();
  return text.length > 1 && !['n/a', 'na', '-', '—'].includes(text.toLowerCase());
}

function displayOrBlank(value: unknown) {
  return meaningful(value) ? scalarText(value).trim() : '';
}

function baseRows(project: Project, settings: FirmSettings, generatedAt: Date) {
  const contact = [settings.website, settings.email, settings.phone]
    .map(displayOrBlank)
    .filter(Boolean)
    .join('  ·  ');
  const propertyDescription = [project.propertyType, project.location]
    .map(displayOrBlank)
    .filter(Boolean)
    .join(' · ');
  const area = Number(project.carpetArea) > 0
    ? `${Number(project.carpetArea).toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq.ft`
    : '';
  const metadata = [
    ['Project', displayOrBlank(project.propertyName), 'Quotation date', generatedAt.toLocaleDateString('en-IN')],
    ['Client', displayOrBlank(project.clientName), 'Configuration', displayOrBlank(project.layout)],
    [propertyDescription ? 'Property' : '', propertyDescription, area ? 'Carpet area' : '', area],
  ];
  return [
    [displayOrBlank(settings.letterheadName) || displayOrBlank(settings.firmName), '', '', '', '', '', ''],
    [contact, '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['BOQ / COSTING FOR PROJECT', '', '', '', '', '', ''],
    ...metadata.map(([leftLabel, leftValue, rightLabel, rightValue]) => [
      leftValue ? leftLabel : '',
      leftValue,
      '',
      '',
      rightValue ? rightLabel : '',
      rightValue,
      '',
    ]),
    ['', '', '', '', '', '', ''],
  ] as (string | number)[][];
}

function applyDocumentHeader(
  X: typeof import('xlsx-js-style'),
  ws: Worksheet,
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[],
) {
  [0, 1, 3].forEach((row) => mergeRow(merges, row));
  for (const row of [4, 5, 6]) {
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 3 } });
    merges.push({ s: { r: row, c: 5 }, e: { r: row, c: 6 } });
  }
  styleRow(X, ws, 0, () => ({
    fill: fill(c.green),
    font: font(16, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: 'center' },
    border: { bottom: edge('thin', c.greenDark) },
  }));
  styleRow(X, ws, 1, () => ({
    fill: fill(c.green),
    font: font(9, { color: 'DCEAE5' }),
    alignment: { vertical: 'center', horizontal: 'center' },
    border: { bottom: edge('medium', c.greenDark) },
  }));
  styleRow(X, ws, 3, () => ({
    fill: fill(c.white),
    font: font(14, { bold: true, color: c.greenDark }),
    alignment: { vertical: 'center', horizontal: 'center' },
    border: {
      top: edge('medium', c.green),
      bottom: edge('medium', c.green),
    },
  }));
  for (const row of [4, 5, 6]) {
    styleRow(X, ws, row, (column) => ({
      fill: fill(c.white),
      font:
        column === 0 || column === 4
          ? font(9, { bold: true, color: c.muted })
          : font(10, { color: c.ink }),
      alignment: {
        vertical: 'center',
        horizontal: column === 0 || column === 4 ? 'left' : column >= 5 ? 'right' : 'left',
      },
      border: { bottom: edge('thin', c.lineSoft) },
    }));
  }
}

function estimateWrappedHeight(text: unknown, widthCharacters = 68) {
  const logicalLines = scalarText(text)
    .split('\n')
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / widthCharacters)), 0);
  return Math.min(300, Math.max(32, logicalLines * 15 + 12));
}

function styleDetailSheet(
  X: typeof import('xlsx-js-style'),
  ws: Worksheet,
  rows: (string | number)[][],
  markers: {
    titleRow: number;
    columnHeaderRow: number;
    floorRows: number[];
    spaceRows: number[];
    itemRows: number[];
    spaceSubtotalRows: number[];
    floorSubtotalRows: number[];
    totalRow: number;
  },
) {
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  mergeRow(merges, markers.titleRow);
  markers.floorRows.forEach((row) => mergeRow(merges, row));
  markers.spaceRows.forEach((row) => mergeRow(merges, row));
  markers.spaceSubtotalRows.forEach((row) => mergeLabelRow(merges, row));
  markers.floorSubtotalRows.forEach((row) => mergeLabelRow(merges, row));
  mergeLabelRow(merges, markers.totalRow);

  const ref = ws['!ref'] as string;
  const range = X.utils.decode_range(ref);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.white),
      font: font(10),
      alignment: {
        vertical: 'center',
        horizontal:
          column === 1 ? 'left' : column === 0 || column === 2 || column === 4 ? 'center' : 'right',
        wrapText: column === 1,
        indent: column === 1 && markers.itemRows.includes(row) ? 1 : 0,
      },
      border: markers.itemRows.includes(row) ? borders.grid : undefined,
      numFmt:
        column === 3 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.quantity
          : column === 2 && typeof cell.v === 'string' && cell.v
            ? '@'
          : (column === 5 || column === 6) && typeof cell.v === 'number'
            ? EXCEL_THEME.numberFormats.currency
            : undefined,
    }));
  }

  applyDocumentHeader(X, ws, merges);

  styleRow(X, ws, markers.titleRow, () => ({
    fill: fill(c.greenPale),
    font: font(13, { bold: true, color: c.greenDark }),
    alignment: { vertical: 'center', horizontal: 'center' },
    border: borders.section,
  }));
  styleRow(X, ws, markers.columnHeaderRow, () => ({
    fill: fill(c.green),
    font: font(10, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: 'center', wrapText: false },
    border: borders.header,
  }));
  markers.floorRows.forEach((row) =>
    styleRow(X, ws, row, () => ({
      fill: fill(c.greenSoft),
      font: font(12, { bold: true, color: c.greenDark }),
      alignment: { vertical: 'center', horizontal: 'center' },
      border: borders.section,
    })),
  );
  markers.spaceRows.forEach((row) =>
    styleRow(X, ws, row, () => ({
      fill: fill(c.warm),
      font: font(10, { bold: true, color: c.ink }),
      alignment: { vertical: 'center', horizontal: 'center' },
      border: borders.grid,
    })),
  );
  markers.spaceSubtotalRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.white),
      font: font(10, { bold: true }),
      alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
      border: borders.subtotal,
      numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
    })),
  );
  markers.floorSubtotalRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.greenPale),
      font: font(10, { bold: true, color: c.greenDark }),
      alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
      border: borders.floorSubtotal,
      numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
    })),
  );
  styleRow(X, ws, markers.totalRow, (column, cell) => ({
    fill: fill(c.green),
    font: font(12, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
    border: borders.total,
    numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
  }));

  ws['!cols'] = [...EXCEL_THEME.detailColumns];
  ws['!rows'] = rows.map((row, index) => ({
    hpt:
      index === 0
        ? EXCEL_THEME.rowHeights.company
        : index === 1
          ? EXCEL_THEME.rowHeights.contact
          : index === 2 || index === 7
            ? EXCEL_THEME.rowHeights.spacer
            : index === 3
              ? EXCEL_THEME.rowHeights.title
              : [4, 5, 6].includes(index)
                ? EXCEL_THEME.rowHeights.metadata
                : index === markers.titleRow
                  ? EXCEL_THEME.rowHeights.section
                  : index === markers.columnHeaderRow
                    ? EXCEL_THEME.rowHeights.columns
                    : markers.floorRows.includes(index)
                      ? EXCEL_THEME.rowHeights.floor
                      : markers.spaceRows.includes(index)
                        ? EXCEL_THEME.rowHeights.space
                        : markers.itemRows.includes(index)
                          ? estimateWrappedHeight(row[1])
                          : markers.floorSubtotalRows.includes(index)
                            ? EXCEL_THEME.rowHeights.floorSubtotal
                            : index === markers.totalRow
                              ? EXCEL_THEME.rowHeights.total
                              : EXCEL_THEME.rowHeights.subtotal,
  }));
  ws['!merges'] = merges;
  applyOuterFrame(X, ws, rows.length - 1);
}

function splitExistingNotes(settings: FirmSettings) {
  return [settings.quotationNotes, settings.terms]
    .flatMap((value) => String(value ?? '').split(/(?<=[.!?])\s+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function styleSummarySheet(
  X: typeof import('xlsx-js-style'),
  ws: Worksheet,
  rows: (string | number)[][],
  markers: {
    titleRow: number;
    columnHeaderRow: number;
    categoryRows: number[];
    interiorTotalRow: number;
    feeSectionRow: number;
    feeRows: number[];
    subtotalRow: number;
    discountRow: number;
    projectTotalRow: number;
    notesTitleRow?: number;
    noteRows: number[];
  },
) {
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  mergeRow(merges, markers.titleRow);
  [
    markers.columnHeaderRow,
    ...markers.categoryRows,
    markers.interiorTotalRow,
    markers.feeSectionRow,
    ...markers.feeRows,
    markers.subtotalRow,
    markers.discountRow,
    markers.projectTotalRow,
  ].forEach((row) => mergeLabelRow(merges, row));
  if (markers.notesTitleRow !== undefined) mergeRow(merges, markers.notesTitleRow);
  markers.noteRows.forEach((row) => mergeRow(merges, row));

  const ref = ws['!ref'] as string;
  const range = X.utils.decode_range(ref);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.white),
      font: font(10),
      alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left', wrapText: true },
      border: undefined,
      numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
    }));
  }
  applyDocumentHeader(X, ws, merges);
  styleRow(X, ws, markers.titleRow, () => ({
    fill: fill(c.greenPale),
    font: font(12, { bold: true, color: c.greenDark }),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: borders.section,
  }));
  styleRow(X, ws, markers.columnHeaderRow, () => ({
    fill: fill(c.green),
    font: font(10, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: 'center' },
    border: borders.header,
  }));
  markers.categoryRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.white),
      font: font(10),
      alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
      border: borders.grid,
      numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
    })),
  );
  styleRow(X, ws, markers.interiorTotalRow, (column, cell) => ({
    fill: fill(c.greenPale),
    font: font(10, { bold: true, color: c.greenDark }),
    alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
    border: borders.floorSubtotal,
    numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
  }));
  styleRow(X, ws, markers.feeSectionRow, () => ({
    fill: fill(c.warm),
    font: font(10, { bold: true, color: c.greenDark }),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: borders.section,
  }));
  markers.feeRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.white),
      font: font(10),
      alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
      border: borders.grid,
      numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
    })),
  );
  for (const row of [markers.subtotalRow, markers.discountRow]) {
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.white),
      font: font(10, { bold: true }),
      alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
      border: borders.subtotal,
      numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
    }));
  }
  styleRow(X, ws, markers.projectTotalRow, (column, cell) => ({
    fill: fill(c.green),
    font: font(13, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: column === 6 ? 'right' : 'left' },
    border: borders.total,
    numFmt: column === 6 && typeof cell.v === 'number' ? EXCEL_THEME.numberFormats.currency : undefined,
  }));
  if (markers.notesTitleRow !== undefined) {
    styleRow(X, ws, markers.notesTitleRow, () => ({
      fill: fill(c.warm),
      font: font(10, { bold: true, color: c.greenDark }),
      alignment: { vertical: 'center', horizontal: 'left' },
      border: borders.section,
    }));
  }
  markers.noteRows.forEach((row) =>
    styleRow(X, ws, row, () => ({
      fill: fill(c.white),
      font: font(9, { color: c.muted }),
      alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
      border: { bottom: edge('thin', c.lineSoft) },
    })),
  );
  ws['!cols'] = [...EXCEL_THEME.summaryColumns];
  ws['!rows'] = rows.map((row, index) => ({
    hpt:
      index === 0
        ? EXCEL_THEME.rowHeights.company
        : index === 1
          ? EXCEL_THEME.rowHeights.contact
          : index === 2 || index === 7
            ? EXCEL_THEME.rowHeights.spacer
            : index === 3
              ? EXCEL_THEME.rowHeights.title
              : [4, 5, 6].includes(index)
                ? EXCEL_THEME.rowHeights.metadata
                : index === markers.projectTotalRow
                  ? EXCEL_THEME.rowHeights.total
                  : index === markers.titleRow || index === markers.feeSectionRow || index === markers.notesTitleRow
                    ? EXCEL_THEME.rowHeights.section
                    : markers.noteRows.includes(index)
                      ? estimateWrappedHeight(row[0], 105)
                      : index === markers.columnHeaderRow
                        ? EXCEL_THEME.rowHeights.columns
                        : EXCEL_THEME.rowHeights.subtotal,
  }));
  ws['!merges'] = merges;
  applyOuterFrame(X, ws, rows.length - 1);
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formulaSheetName(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function patchWorksheetXml(
  xml: string,
  footerText: string,
  fitToHeight: number,
) {
  const sheetPr = '<sheetPr><pageSetUpPr fitToPage="1" autoPageBreaks="1"/></sheetPr>';
  if (/<sheetPr[\s>]/.test(xml)) {
    xml = xml.replace(/<sheetPr[^>]*\/>|<sheetPr[\s\S]*?<\/sheetPr>/, sheetPr);
  } else {
    xml = xml.replace(/(<worksheet[^>]*>)/, `$1${sheetPr}`);
  }
  const sheetViews = '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  xml = xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/, sheetViews);
  xml = xml
    .replace(/<printOptions[^>]*\/>/g, '')
    .replace(/<pageMargins[^>]*\/>/g, '')
    .replace(/<pageSetup[^>]*\/>/g, '')
    .replace(/<headerFooter[\s\S]*?<\/headerFooter>/g, '');
  const printXml =
    '<printOptions horizontalCentered="1" gridLines="0" headings="0"/>' +
    '<pageMargins left="0.3" right="0.3" top="0.45" bottom="0.45" header="0.2" footer="0.25"/>' +
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="${fitToHeight}" horizontalDpi="300" verticalDpi="300"/>` +
    `<headerFooter><oddFooter>&amp;L${xmlEscape(footerText)}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>`;
  if (xml.includes('<ignoredErrors')) return xml.replace('<ignoredErrors', `${printXml}<ignoredErrors`);
  return xml.replace('</worksheet>', `${printXml}</worksheet>`);
}

function patchNativeExcelFeatures(
  bytes: Uint8Array,
  sheets: { name: string; lastRow: number; repeatHeaderRow?: number; fitToHeight: number }[],
  footerText: string,
) {
  const files = unzipSync(bytes);
  const workbookPath = 'xl/workbook.xml';
  let workbookXml = strFromU8(files[workbookPath]);
  workbookXml = workbookXml.replace(/<definedNames>[\s\S]*?<\/definedNames>/g, '');
  const definedNames = sheets.flatMap((sheet, index) => {
    const formulaName = xmlEscape(formulaSheetName(sheet.name));
    const names = [
      `<definedName name="_xlnm.Print_Area" localSheetId="${index}">${formulaName}!$A$1:$G$${sheet.lastRow}</definedName>`,
    ];
    if (sheet.repeatHeaderRow) {
      names.push(
        `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">${formulaName}!$${sheet.repeatHeaderRow}:$${sheet.repeatHeaderRow}</definedName>`,
      );
    }
    return names;
  });
  workbookXml = workbookXml.replace(
    '</workbook>',
    `<definedNames>${definedNames.join('')}</definedNames></workbook>`,
  );
  files[workbookPath] = strToU8(workbookXml);
  sheets.forEach((sheet, index) => {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const xml = strFromU8(files[path]);
    files[path] = strToU8(
      patchWorksheetXml(xml, footerText, sheet.fitToHeight),
    );
  });
  return zipSync(files, { level: 6 });
}

export async function createProjectExcelFile(
  sourceProject: Project,
  settings: FirmSettings,
  options: { generatedAt?: Date } = {},
) {
  const XModule = await import('xlsx-js-style');
  const X = (XModule.default ?? XModule) as typeof import('xlsx-js-style');
  const project = normalizeProject(sourceProject);
  const generatedAt = options.generatedAt ?? new Date();
  const totals = quoteTotals(project);
  const workbook = X.utils.book_new();
  workbook.Props = {
    Title: `BOQ / Costing${meaningful(project.propertyName) ? ` for ${project.propertyName}` : ''}`,
    Subject: displayOrBlank(project.propertyName),
    Author: displayOrBlank(settings.letterheadName) || displayOrBlank(settings.firmName),
    Company: displayOrBlank(settings.firmName),
    CreatedDate: generatedAt,
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
      (workType) => !WORK_TYPES.includes(workType as (typeof WORK_TYPES)[number]),
    ),
  ];
  const workTypeTotals = new Map(
    workTypes.map((workType) => [
      workType,
      project.rooms.reduce(
        (sum, space) =>
          sum +
          space.items
            .filter((item) => item.enabled && (item.workType ?? 'Millwork') === workType)
            .reduce((itemSum, item) => itemSum + itemTotal(item, project.defaultTier), 0),
        0,
      ),
    ]),
  );

  const summaryRows = baseRows(project, settings, generatedAt);
  const summaryTitleRow = summaryRows.length;
  summaryRows.push(['COST SUMMARY', '', '', '', '', '', '']);
  const summaryHeaderRow = summaryRows.length;
  summaryRows.push(['WORK TYPE', '', '', '', '', '', 'AMOUNT']);
  const categoryRows: number[] = [];
  for (const workType of workTypes) {
    categoryRows.push(summaryRows.length);
    summaryRows.push([workType, '', '', '', '', '', workTypeTotals.get(workType) ?? 0]);
  }
  const interiorTotalRow = summaryRows.length;
  summaryRows.push(['INTERIOR WORKS TOTAL', '', '', '', '', '', totals.interior]);
  summaryRows.push(['', '', '', '', '', '', '']);
  const feeSectionRow = summaryRows.length;
  summaryRows.push(['INTERIOR / PROFESSIONAL FEES', '', '', '', '', '', '']);
  const feeRows: number[] = [];
  for (const fee of totals.fees) {
    feeRows.push(summaryRows.length);
    summaryRows.push([fee.name, '', '', '', '', '', fee.total]);
  }
  const subtotalRow = summaryRows.length;
  summaryRows.push(['SUBTOTAL', '', '', '', '', '', totals.subtotal]);
  const discountRow = summaryRows.length;
  summaryRows.push(['PROJECT DISCOUNT', '', '', '', '', '', -totals.discount]);
  const projectTotalRow = summaryRows.length;
  summaryRows.push(['PROJECT TOTAL', '', '', '', '', '', totals.grandTotal]);
  const existingNotes = splitExistingNotes(settings);
  const noteRows: number[] = [];
  let notesTitleRow: number | undefined;
  if (existingNotes.length) {
    summaryRows.push(['', '', '', '', '', '', '']);
    notesTitleRow = summaryRows.length;
    summaryRows.push(['NOTES', '', '', '', '', '', '']);
    for (const note of existingNotes) {
      noteRows.push(summaryRows.length);
      summaryRows.push([`• ${note}`, '', '', '', '', '', '']);
    }
  }
  const summarySheet = X.utils.aoa_to_sheet(summaryRows);
  styleSummarySheet(X, summarySheet, summaryRows, {
    titleRow: summaryTitleRow,
    columnHeaderRow: summaryHeaderRow,
    categoryRows,
    interiorTotalRow,
    feeSectionRow,
    feeRows,
    subtotalRow,
    discountRow,
    projectTotalRow,
    notesTitleRow,
    noteRows,
  });
  X.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const usedSheetNames = new Set<string>(['Summary']);
  const safeSheetName = (workType: string) => {
    const base =
      workType
        .replace(/[\\/?*:[\]]/g, ' & ')
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

  const nativeSheets: {
    name: string;
    lastRow: number;
    repeatHeaderRow?: number;
    fitToHeight: number;
  }[] = [
    { name: 'Summary', lastRow: summaryRows.length, fitToHeight: 1 },
  ];
  for (const workType of workTypes) {
    const rows = baseRows(project, settings, generatedAt);
    const titleRow = rows.length;
    rows.push([workType.toUpperCase(), '', '', '', '', '', '']);
    const columnHeaderRow = rows.length;
    rows.push(['Sl.no', 'Particulars', 'HSN Code', 'Qty', 'Unit', 'Rate', 'Amount']);
    const floorRows: number[] = [];
    const spaceRows: number[] = [];
    const itemRows: number[] = [];
    const spaceSubtotalRows: number[] = [];
    const floorSubtotalRows: number[] = [];
    let serial = 1;
    for (const floor of project.floors ?? []) {
      const floorSpaces = project.rooms
        .filter((space) => space.floorId === floor.id)
        .map((space) => ({
          space,
          items: space.items.filter(
            (item) => item.enabled && (item.workType ?? 'Millwork') === workType,
          ),
        }))
        .filter(({ items }) => items.length > 0);
      if (!floorSpaces.length) continue;
      floorRows.push(rows.length);
      rows.push([floor.name.toUpperCase(), '', '', '', '', '', '']);
      let floorTotal = 0;
      for (const { space, items } of floorSpaces) {
        spaceRows.push(rows.length);
        rows.push([space.name, '', '', '', '', '', '']);
        let spaceTotal = 0;
        for (const item of items) {
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
            .map((component) => `${component.name} (₹${component.rate.toLocaleString('en-IN')})`)
            .join(', ');
          const particulars = [
            `${item.name}${item.description ? `: ${item.description}` : ''}`,
            dimensions ? `Size: ${dimensions} ${item.dimensionUnit ?? 'ft'}` : '',
            components ? `Components: ${components}` : '',
            item.notes ?? '',
          ]
            .filter(Boolean)
            .join('  ·  ');
          const amount = itemTotal(item, project.defaultTier);
          itemRows.push(rows.length);
          rows.push([
            serial,
            particulars,
            item.hsnCode ?? '',
            item.pricingMode === 'lump-sum' ? 1 : itemMeasure(item),
            item.customUnit || item.unit || unitForMeasurement(item.measurementType),
            itemBaseRate(item, project.defaultTier),
            amount,
          ]);
          serial += 1;
          spaceTotal += amount;
        }
        spaceSubtotalRows.push(rows.length);
        rows.push([`${space.name} subtotal`, '', '', '', '', '', spaceTotal]);
        floorTotal += spaceTotal;
      }
      floorSubtotalRows.push(rows.length);
      rows.push([`${floor.name} subtotal`, '', '', '', '', '', floorTotal]);
      rows.push(['', '', '', '', '', '', '']);
    }
    const totalRow = rows.length;
    rows.push([`${workType.toUpperCase()} TOTAL`, '', '', '', '', '', workTypeTotals.get(workType) ?? 0]);
    const sheet = X.utils.aoa_to_sheet(rows);
    styleDetailSheet(X, sheet, rows, {
      titleRow,
      columnHeaderRow,
      floorRows,
      spaceRows,
      itemRows,
      spaceSubtotalRows,
      floorSubtotalRows,
      totalRow,
    });
    const sheetName = safeSheetName(workType);
    X.utils.book_append_sheet(workbook, sheet, sheetName);
    nativeSheets.push({
      name: sheetName,
      lastRow: rows.length,
      repeatHeaderRow: columnHeaderRow + 1,
      fitToHeight: rows.length <= 26 ? 1 : 0,
    });
  }

  const raw = new Uint8Array(
    X.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }),
  );
  const bytes = patchNativeExcelFeatures(
    raw,
    nativeSheets,
    displayOrBlank(settings.letterheadName) || displayOrBlank(settings.firmName),
  );
  const projectFileName = displayOrBlank(project.propertyName) || 'project';
  const filename = `${projectFileName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'project'}-quotation.xlsx`;
  return {
    filename,
    bytes,
    sheetNames: nativeSheets.map((sheet) => sheet.name),
    totals: {
      ...totals,
      workTypes: Object.fromEntries(workTypeTotals),
    },
  };
}

export function excelBytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
