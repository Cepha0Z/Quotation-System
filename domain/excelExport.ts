import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { WORK_TYPES, normalizeProject, unitForMeasurement } from './boq';
import { isCompositeItem, orderedCompositeChildren } from './composites';
import {
  itemBaseRate,
  itemMeasure,
  itemTotal,
  quoteTotals,
} from './pricing';
import type { FirmSettings, Project, QuoteItem, Room } from './types';

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
    greenSoft: 'D3E2DC',
    greenPale: 'E2ECE7',
    warm: 'EEE9DE',
    surface: 'F4F7F5',
    surfaceStrong: 'E9EFEC',
    white: 'FFFFFF',
    ink: '18211E',
    muted: '66706C',
    line: '64766F',
    lineSoft: '95A49E',
    headerLine: '71968A',
  },
  numberFormats: {
    currency: '₹#,##0.00;[Red]-₹#,##0.00;₹0.00',
    quantity: '#,##0.###',
  },
  detailColumns: [
    { wch: 9 },
    { wch: 78 },
    { wch: 13 },
    { wch: 10 },
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
    documentTitle: 34,
    brand: 22,
    spacer: 8,
    title: 28,
    metadata: 22,
    section: 29,
    columns: 25,
    floor: 30,
    space: 27,
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
    left: edge('thin', c.headerLine),
    right: edge('thin', c.headerLine),
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
      if (row !== 0 && row !== lastRow && column !== 0 && column !== 6)
        continue;
      const cell = getCell(X, ws, row, column);
      const style = cell.s ?? {};
      const border =
        (style.border as Record<string, unknown> | undefined) ?? {};
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

function mergeRow(
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[],
  row: number,
  endColumn = 6,
) {
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: endColumn } });
}

function mergeLabelRow(
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[],
  row: number,
) {
  merges.push({ s: { r: row, c: 0 }, e: { r: row, c: 5 } });
}

function mergeDescriptionRow(
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[],
  row: number,
) {
  merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 5 } });
}

function scalarText(value: unknown) {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : '';
}

function meaningful(value: unknown) {
  const text = scalarText(value).trim();
  return (
    text.length > 1 && !['n/a', 'na', '-', '—'].includes(text.toLowerCase())
  );
}

function displayOrBlank(value: unknown) {
  return meaningful(value) ? scalarText(value).trim() : '';
}

function baseRows(project: Project, settings: FirmSettings, generatedAt: Date) {
  const contact = [settings.website, settings.email, settings.phone]
    .map(displayOrBlank)
    .filter(Boolean)
    .join('  ·  ');
  const area =
    Number(project.carpetArea) > 0
      ? `${Number(project.carpetArea).toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq.ft`
      : '';
  const metadata = [
    [
      'Project',
      displayOrBlank(project.propertyName),
      'Configuration',
      displayOrBlank(project.layout),
    ],
    [
      'Client',
      displayOrBlank(project.clientName),
      area ? 'Carpet Area' : '',
      area,
    ],
    [
      displayOrBlank(project.propertyType) ? 'Property' : '',
      displayOrBlank(project.propertyType),
      displayOrBlank(project.location) ? 'Location' : '',
      displayOrBlank(project.location),
    ],
  ];
  return [
    [
      'BOQ / COSTING FOR PROJECT',
      '',
      '',
      '',
      '',
      'Date',
      generatedAt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    ],
    [
      displayOrBlank(settings.letterheadName) ||
        displayOrBlank(settings.firmName),
      '',
      '',
      contact,
      '',
      '',
      '',
    ],
    ['', '', '', '', '', '', ''],
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
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 2 } });
  merges.push({ s: { r: 1, c: 3 }, e: { r: 1, c: 6 } });
  for (const row of [3, 4, 5]) {
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 3 } });
    merges.push({ s: { r: row, c: 5 }, e: { r: row, c: 6 } });
  }
  styleRow(X, ws, 0, () => ({
    fill: fill(c.green),
    font: font(15, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: {
      top: edge('medium', c.greenDark),
      bottom: edge('thin', c.greenDark),
      left: edge('medium', c.greenDark),
      right: edge('medium', c.greenDark),
    },
  }));
  getCell(X, ws, 0, 5).s = {
    fill: fill(c.green),
    font: font(9, { bold: true, color: 'DCEAE5' }),
    alignment: { vertical: 'center', horizontal: 'center' },
    border: {
      left: edge('thin', '8FB6AA'),
      top: edge('medium', c.greenDark),
      bottom: edge('thin', c.greenDark),
    },
  };
  getCell(X, ws, 0, 6).s = {
    fill: fill(c.green),
    font: font(10, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: {
      top: edge('medium', c.greenDark),
      right: edge('medium', c.greenDark),
      bottom: edge('thin', c.greenDark),
    },
  };
  styleRow(X, ws, 1, () => ({
    fill: fill(c.green),
    font: font(9, { color: 'DCEAE5' }),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: { bottom: edge('medium', c.greenDark) },
  }));
  getCell(X, ws, 1, 0).s = {
    fill: fill(c.green),
    font: font(10, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: {
      left: edge('medium', c.greenDark),
      bottom: edge('medium', c.greenDark),
    },
  };
  getCell(X, ws, 1, 3).s = {
    fill: fill(c.green),
    font: font(9, { color: 'DCEAE5' }),
    alignment: { vertical: 'center', horizontal: 'right' },
    border: {
      right: edge('medium', c.greenDark),
      bottom: edge('medium', c.greenDark),
    },
  };
  for (const row of [3, 4, 5]) {
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(column === 0 || column === 4 ? c.greenPale : c.surfaceStrong),
      font:
        column === 0 || column === 4
          ? font(9, { bold: true, color: c.greenDark })
          : font(10, { color: c.ink }),
      alignment: { vertical: 'center', horizontal: 'left' },
      border: borders.grid,
    }));
  }
}

function estimateWrappedHeight(text: unknown, widthCharacters = 74) {
  const logicalLines = scalarText(text)
    .split('\n')
    .reduce(
      (count, line) =>
        count + Math.max(1, Math.ceil(line.length / widthCharacters)),
      0,
    );
  return Math.min(300, Math.max(27, logicalLines * 15 + 12));
}

function styleDetailSheet(
  X: typeof import('xlsx-js-style'),
  ws: Worksheet,
  rows: (string | number)[][],
  markers: {
    titleRow: number;
    columnHeaderRows: number[];
    floorRows: number[];
    spaceRows: number[];
    groupRows: number[];
    itemRows: number[];
    childRows: number[];
    spaceSubtotalRows: number[];
    floorSubtotalRows: number[];
    totalRow: number;
  },
) {
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] =
    [];
  mergeRow(merges, markers.titleRow);
  markers.floorRows.forEach((row) =>
    merges.push({ s: { r: row, c: 1 }, e: { r: row, c: 6 } }),
  );
  markers.spaceRows.forEach((row) => mergeRow(merges, row));
  markers.spaceSubtotalRows.forEach((row) => mergeLabelRow(merges, row));
  markers.floorSubtotalRows.forEach((row) => mergeLabelRow(merges, row));
  mergeLabelRow(merges, markers.totalRow);

  const ref = ws['!ref'] as string;
  const range = X.utils.decode_range(ref);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.surface),
      font: font(10),
      alignment: {
        vertical: 'center',
        horizontal:
          column === 1
            ? 'left'
            : column === 0 || column === 2 || column === 3 || column === 4
              ? 'center'
              : 'right',
        wrapText: column === 1,
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

  // Apply hierarchy styling after the base grid pass so the child indent is
  // retained in the serialized workbook rather than overwritten.
  markers.childRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.surface),
      font: font(10),
      alignment: {
        vertical: 'center',
        horizontal:
          column === 1
            ? 'left'
            : column === 0 || column === 2 || column === 3 || column === 4
              ? 'center'
              : 'right',
        indent: column === 1 ? 1 : 0,
        wrapText: column === 1,
      },
      border: {
        ...borders.grid,
        left: column === 0 ? edge('medium', c.headerLine) : borders.grid.left,
      },
      numFmt:
        column === 3 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.quantity
          : (column === 5 || column === 6) && typeof cell.v === 'number'
            ? EXCEL_THEME.numberFormats.currency
            : undefined,
    })),
  );

  applyDocumentHeader(X, ws, merges);

  styleRow(X, ws, markers.titleRow, () => ({
    fill: fill(c.greenDark),
    font: font(13, { bold: true, color: c.white }),
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
    border: borders.total,
  }));
  markers.columnHeaderRows.forEach((row) =>
    styleRow(X, ws, row, () => ({
      fill: fill(c.green),
      font: font(10, { bold: true, color: c.white }),
      alignment: { vertical: 'center', horizontal: 'center', wrapText: false },
      border: borders.header,
    })),
  );
  markers.floorRows.forEach((row) =>
    styleRow(X, ws, row, (column) => ({
      fill: fill(column === 0 ? c.green : c.greenSoft),
      font: font(12, {
        bold: true,
        color: column === 0 ? c.white : c.greenDark,
      }),
      alignment: {
        vertical: 'center',
        horizontal: column === 0 ? 'center' : 'left',
        indent: column === 0 ? 0 : 1,
      },
      border:
        column === 0
          ? borders.header
          : {
              top: edge('medium', c.green),
              bottom: edge('medium', c.green),
              right: column === 6 ? edge('medium', c.green) : undefined,
            },
    })),
  );
  markers.spaceRows.forEach((row) =>
    styleRow(X, ws, row, () => ({
      fill: fill(c.warm),
      font: font(11, { bold: true, color: c.ink }),
      alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
      border: {
        top: edge('thin', c.line),
        bottom: edge('thin', c.line),
        left: edge('medium', c.green),
        right: edge('medium', c.green),
      },
    })),
  );
  markers.groupRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.greenSoft),
      font: font(10, {
        bold: true,
        color: c.greenDark,
      }),
      alignment: {
        vertical: 'center',
        horizontal:
          column === 1
            ? 'left'
            : column === 0 || column === 2 || column === 3 || column === 4
              ? 'center'
              : 'right',
        indent: column === 1 ? 1 : 0,
        wrapText: column === 1,
      },
      border: {
        top: edge('thin', c.headerLine),
        bottom: edge('thin', c.headerLine),
        left: column === 0 ? edge('medium', c.green) : undefined,
        right: column === 6 ? edge('medium', c.green) : undefined,
      },
      numFmt:
        column === 3 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.quantity
          : column === 6 && typeof cell.v === 'number'
            ? EXCEL_THEME.numberFormats.currency
            : undefined,
    })),
  );
  markers.spaceSubtotalRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.surfaceStrong),
      font: font(10, { bold: true }),
      alignment: {
        vertical: 'center',
        horizontal: column === 6 ? 'right' : 'left',
      },
      border: borders.subtotal,
      numFmt:
        column === 6 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.currency
          : undefined,
    })),
  );
  markers.floorSubtotalRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.greenPale),
      font: font(10, { bold: true, color: c.greenDark }),
      alignment: {
        vertical: 'center',
        horizontal: column === 6 ? 'right' : 'left',
      },
      border: borders.floorSubtotal,
      numFmt:
        column === 6 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.currency
          : undefined,
    })),
  );
  styleRow(X, ws, markers.totalRow, (column, cell) => ({
    fill: fill(c.green),
    font: font(12, { bold: true, color: c.white }),
    alignment: {
      vertical: 'center',
      horizontal: column === 6 ? 'right' : 'left',
    },
    border: borders.total,
    numFmt:
      column === 6 && typeof cell.v === 'number'
        ? EXCEL_THEME.numberFormats.currency
        : undefined,
  }));

  ws['!cols'] = [...EXCEL_THEME.detailColumns];
  ws['!rows'] = rows.map((row, index) => ({
    hpt:
      index === 0
        ? EXCEL_THEME.rowHeights.documentTitle
        : index === 1
          ? EXCEL_THEME.rowHeights.brand
          : index === 2 || index === 6
            ? EXCEL_THEME.rowHeights.spacer
            : [3, 4, 5].includes(index)
              ? EXCEL_THEME.rowHeights.metadata
              : index === markers.titleRow
                ? EXCEL_THEME.rowHeights.section
                : markers.columnHeaderRows.includes(index)
                  ? EXCEL_THEME.rowHeights.columns
                  : markers.floorRows.includes(index)
                    ? EXCEL_THEME.rowHeights.floor
                    : markers.spaceRows.includes(index)
                      ? EXCEL_THEME.rowHeights.space
                      : markers.groupRows.includes(index)
                        ? estimateWrappedHeight(row[1], 70)
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
    feeHeaderRow: number;
    feeRows: number[];
    subtotalRow: number;
    discountRow: number;
    projectTotalRow: number;
    notesTitleRow?: number;
    noteRows: number[];
  },
) {
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] =
    [];
  mergeRow(merges, markers.titleRow);
  [
    markers.interiorTotalRow,
    markers.subtotalRow,
    markers.discountRow,
    markers.projectTotalRow,
  ].forEach((row) => mergeLabelRow(merges, row));
  mergeRow(merges, markers.feeSectionRow);
  [
    markers.columnHeaderRow,
    ...markers.categoryRows,
    markers.feeHeaderRow,
    ...markers.feeRows,
  ].forEach((row) => mergeDescriptionRow(merges, row));
  if (markers.notesTitleRow !== undefined)
    mergeRow(merges, markers.notesTitleRow);
  markers.noteRows.forEach((row) => mergeRow(merges, row));

  const ref = ws['!ref'] as string;
  const range = X.utils.decode_range(ref);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.surface),
      font: font(10),
      alignment: {
        vertical: 'center',
        horizontal: column === 6 ? 'right' : 'left',
        wrapText: true,
      },
      border: undefined,
      numFmt:
        column === 6 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.currency
          : undefined,
    }));
  }
  applyDocumentHeader(X, ws, merges);
  styleRow(X, ws, markers.titleRow, () => ({
    fill: fill(c.greenSoft),
    font: font(12, { bold: true, color: c.greenDark }),
    alignment: { vertical: 'center', horizontal: 'left', indent: 1 },
    border: borders.section,
  }));
  for (const row of [markers.columnHeaderRow, markers.feeHeaderRow]) {
    styleRow(X, ws, row, () => ({
      fill: fill(c.green),
      font: font(10, { bold: true, color: c.white }),
      alignment: { vertical: 'center', horizontal: 'center' },
      border: borders.header,
    }));
  }
  markers.categoryRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.surface),
      font: font(10),
      alignment: {
        vertical: 'center',
        horizontal: column === 0 ? 'center' : column === 6 ? 'right' : 'left',
      },
      border: borders.grid,
      numFmt:
        column === 6 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.currency
          : undefined,
    })),
  );
  styleRow(X, ws, markers.interiorTotalRow, (column, cell) => ({
    fill: fill(c.greenPale),
    font: font(10, { bold: true, color: c.greenDark }),
    alignment: {
      vertical: 'center',
      horizontal: column === 6 ? 'right' : 'left',
    },
    border: borders.floorSubtotal,
    numFmt:
      column === 6 && typeof cell.v === 'number'
        ? EXCEL_THEME.numberFormats.currency
        : undefined,
  }));
  styleRow(X, ws, markers.feeSectionRow, () => ({
    fill: fill(c.warm),
    font: font(10, { bold: true, color: c.greenDark }),
    alignment: { vertical: 'center', horizontal: 'left' },
    border: borders.section,
  }));
  markers.feeRows.forEach((row) =>
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.surface),
      font: font(10),
      alignment: {
        vertical: 'center',
        horizontal: column === 0 ? 'center' : column === 6 ? 'right' : 'left',
      },
      border: borders.grid,
      numFmt:
        column === 6 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.currency
          : undefined,
    })),
  );
  for (const row of [markers.subtotalRow, markers.discountRow]) {
    styleRow(X, ws, row, (column, cell) => ({
      fill: fill(c.surfaceStrong),
      font: font(10, { bold: true }),
      alignment: {
        vertical: 'center',
        horizontal: column === 6 ? 'right' : 'left',
      },
      border: borders.subtotal,
      numFmt:
        column === 6 && typeof cell.v === 'number'
          ? EXCEL_THEME.numberFormats.currency
          : undefined,
    }));
  }
  styleRow(X, ws, markers.projectTotalRow, (column, cell) => ({
    fill: fill(c.green),
    font: font(13, { bold: true, color: c.white }),
    alignment: {
      vertical: 'center',
      horizontal: column === 6 ? 'right' : 'left',
    },
    border: borders.total,
    numFmt:
      column === 6 && typeof cell.v === 'number'
        ? EXCEL_THEME.numberFormats.currency
        : undefined,
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
      fill: fill(c.surface),
      font: font(9, { color: c.muted }),
      alignment: { vertical: 'top', horizontal: 'left', wrapText: true },
      border: { bottom: edge('thin', c.lineSoft) },
    })),
  );
  ws['!cols'] = [...EXCEL_THEME.summaryColumns];
  ws['!rows'] = rows.map((row, index) => ({
    hpt:
      index === 0
        ? EXCEL_THEME.rowHeights.documentTitle
        : index === 1
          ? EXCEL_THEME.rowHeights.brand
          : index === 2 || index === 6
            ? EXCEL_THEME.rowHeights.spacer
            : [3, 4, 5].includes(index)
              ? EXCEL_THEME.rowHeights.metadata
              : index === markers.projectTotalRow
                ? EXCEL_THEME.rowHeights.total
                : index === markers.titleRow ||
                    index === markers.feeSectionRow ||
                    index === markers.notesTitleRow
                  ? EXCEL_THEME.rowHeights.section
                  : markers.noteRows.includes(index)
                    ? estimateWrappedHeight(row[0], 105)
                    : index === markers.columnHeaderRow ||
                        index === markers.feeHeaderRow
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
  const sheetPr =
    '<sheetPr><pageSetUpPr fitToPage="1" autoPageBreaks="1"/></sheetPr>';
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
  if (xml.includes('<ignoredErrors'))
    return xml.replace('<ignoredErrors', `${printXml}<ignoredErrors`);
  return xml.replace('</worksheet>', `${printXml}</worksheet>`);
}

function patchNativeExcelFeatures(
  bytes: Uint8Array,
  sheets: {
    name: string;
    lastRow: number;
    repeatHeaderRow?: number;
    fitToHeight: number;
  }[],
  footerText: string,
) {
  const files = unzipSync(bytes);
  const workbookPath = 'xl/workbook.xml';
  let workbookXml = strFromU8(files[workbookPath]);
  workbookXml = workbookXml.replace(
    /<definedNames>[\s\S]*?<\/definedNames>/g,
    '',
  );
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

type DetailEntry =
  | { kind: 'group'; item: QuoteItem; children: QuoteItem[] }
  | { kind: 'item'; item: QuoteItem; parent?: QuoteItem };

function orderedDetailEntries(space: Room, workType: string): DetailEntry[] {
  return space.items
    .filter((item) => !item.parentItemId)
    .flatMap((item): DetailEntry[] => {
      if (!isCompositeItem(item))
        return item.enabled && (item.workType ?? 'Millwork') === workType
          ? [{ kind: 'item', item }]
          : [];
      const children = orderedCompositeChildren(space, item).filter(
        (child) =>
          child.enabled && (child.workType ?? item.workType ?? 'Millwork') === workType,
      );
      if (!children.length) return [];
      return [
        { kind: 'group', item, children },
        ...children.map(
          (child): DetailEntry => ({ kind: 'item', item: child, parent: item }),
        ),
      ];
    });
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
    Author:
      displayOrBlank(settings.letterheadName) ||
      displayOrBlank(settings.firmName),
    Company: displayOrBlank(settings.firmName),
    CreatedDate: generatedAt,
  };

  const discoveredWorkTypes = [
    ...new Set(
      project.rooms.flatMap((space) =>
        space.items
          .filter((item) => item.enabled && item.itemType !== 'composite')
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
                item.enabled &&
                item.itemType !== 'composite' &&
                (item.workType ?? 'Millwork') === workType,
            )
            .reduce(
              (itemSum, item) => itemSum + itemTotal(item, project.defaultTier),
              0,
            ),
        0,
      ),
    ]),
  );

  const summaryRows = baseRows(project, settings, generatedAt);
  const summaryTitleRow = summaryRows.length;
  summaryRows.push(['COST SUMMARY', '', '', '', '', '', '']);
  const summaryHeaderRow = summaryRows.length;
  summaryRows.push(['SL. NO.', 'WORK TYPE', '', '', '', '', 'AMOUNT (₹)']);
  const categoryRows: number[] = [];
  for (const [index, workType] of workTypes.entries()) {
    categoryRows.push(summaryRows.length);
    summaryRows.push([
      index + 1,
      workType,
      '',
      '',
      '',
      '',
      workTypeTotals.get(workType) ?? 0,
    ]);
  }
  const interiorTotalRow = summaryRows.length;
  summaryRows.push([
    'INTERIOR WORKS TOTAL',
    '',
    '',
    '',
    '',
    '',
    totals.interior,
  ]);
  summaryRows.push(['', '', '', '', '', '', '']);
  const feeSectionRow = summaryRows.length;
  summaryRows.push(['INTERIOR / PROFESSIONAL FEES', '', '', '', '', '', '']);
  const feeHeaderRow = summaryRows.length;
  summaryRows.push([
    'SL. NO.',
    'PROFESSIONAL FEE',
    '',
    '',
    '',
    '',
    'AMOUNT (₹)',
  ]);
  const feeRows: number[] = [];
  for (const [index, fee] of totals.fees.entries()) {
    feeRows.push(summaryRows.length);
    summaryRows.push([index + 1, fee.name, '', '', '', '', fee.total]);
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
    feeHeaderRow,
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
  }[] = [{ name: 'Summary', lastRow: summaryRows.length, fitToHeight: 1 }];
  for (const workType of workTypes) {
    const rows = baseRows(project, settings, generatedAt);
    const titleRow = rows.length;
    rows.push([workType.toUpperCase(), '', '', '', '', '', '']);
    const columnHeaderRows: number[] = [];
    const floorRows: number[] = [];
    const spaceRows: number[] = [];
    const groupRows: number[] = [];
    const itemRows: number[] = [];
    const childRows: number[] = [];
    const spaceSubtotalRows: number[] = [];
    const floorSubtotalRows: number[] = [];
    let serial = 1;
    let floorSection = 1;
    for (const floor of project.floors ?? []) {
      const floorSpaces = project.rooms
        .filter((space) => space.floorId === floor.id)
        .map((space) => ({
          space,
          entries: orderedDetailEntries(space, workType),
        }))
        .filter(({ entries }) => entries.length > 0);
      if (!floorSpaces.length) continue;
      floorRows.push(rows.length);
      rows.push([
        String(floorSection).padStart(2, '0'),
        floor.name.toUpperCase(),
        '',
        '',
        '',
        '',
        '',
      ]);
      floorSection += 1;
      let floorTotal = 0;
      for (const { space, entries } of floorSpaces) {
        spaceRows.push(rows.length);
        rows.push([space.name, '', '', '', '', '', '']);
        columnHeaderRows.push(rows.length);
        rows.push([
          'Sl. No.',
          'Particulars',
          'HSN Code',
          'Qty',
          'Unit',
          'Rate (₹)',
          'Amount (₹)',
        ]);
        let spaceTotal = 0;
        for (const entry of entries) {
          if (entry.kind === 'group') {
            const total = entry.children.reduce(
              (sum, child) => sum + itemTotal(child, project.defaultTier),
              0,
            );
            const description = entry.item.description.trim();
            groupRows.push(rows.length);
            rows.push([
              '',
              `${entry.item.name}${description ? `: ${description}` : ''}`,
              entry.item.hsnCode ?? '',
              itemMeasure(entry.item),
              entry.item.customUnit ||
                entry.item.unit ||
                unitForMeasurement(entry.item.measurementType),
              '—',
              total,
            ]);
            continue;
          }
          const { item, parent } = entry;
          const dimensions =
            item.measureMode === 'dimensions'
              ? (item.unit === 'Sq.ft' ||
                item.unit === 'Sq.m' ||
                item.measurementType === 'sqft'
                  ? [
                      item.length ? `${item.length}L` : '',
                      item.width ? `${item.width}H` : '',
                    ]
                  : [item.length ? `${item.length}L` : '']
                )
                  .filter(Boolean)
                  .join(' × ')
              : '';
          const components = item.subUnits
            .filter((component) => component.enabled)
            .map(
              (component) =>
                `${component.name} (₹${component.rate.toLocaleString('en-IN')})`,
            )
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
          if (parent) childRows.push(rows.length);
          rows.push([
            serial,
            particulars,
            item.hsnCode ?? '',
            itemMeasure(item),
            item.customUnit ||
              item.unit ||
              unitForMeasurement(item.measurementType),
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
    rows.push([
      `${workType.toUpperCase()} TOTAL`,
      '',
      '',
      '',
      '',
      '',
      workTypeTotals.get(workType) ?? 0,
    ]);
    const sheet = X.utils.aoa_to_sheet(rows);
    styleDetailSheet(X, sheet, rows, {
      titleRow,
      columnHeaderRows,
      floorRows,
      spaceRows,
      groupRows,
      itemRows,
      childRows,
      spaceSubtotalRows,
      floorSubtotalRows,
      totalRow,
    });
    const sheetName = safeSheetName(workType);
    X.utils.book_append_sheet(workbook, sheet, sheetName);
    nativeSheets.push({
      name: sheetName,
      lastRow: rows.length,
      repeatHeaderRow: columnHeaderRows[0] + 1,
      fitToHeight: rows.length <= 26 ? 1 : 0,
    });
  }

  const raw = new Uint8Array(
    X.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }),
  );
  const bytes = patchNativeExcelFeatures(
    raw,
    nativeSheets,
    displayOrBlank(settings.letterheadName) ||
      displayOrBlank(settings.firmName),
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
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}
