import * as XLSX from "xlsx";

export interface ExcelTable {
  title: string;
  headers: string[];
  rows: Array<Record<string, unknown>>;
  sheetName: string;
  tableIndex: number; // 1-based index within the sheet
  titleRow: number; // 0-based worksheet row index where merged title is found
}

const isCellEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
};

const getRowValues = (
  ws: XLSX.WorkSheet,
  rowIndex: number,
  colStart: number,
  colEnd: number
): unknown[] => {
  const out: unknown[] = [];
  for (let c = colStart; c <= colEnd; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    const cell = ws[addr] as XLSX.CellObject | undefined;
    out.push(cell?.v);
  }
  return out;
};

const isRowEmpty = (values: unknown[]): boolean => {
  return values.every((v) => isCellEmpty(v));
};

const normalizeHeader = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s;
};

const getMergedTitleRows = (
  ws: XLSX.WorkSheet,
  colEnd: number
): Array<{ row: number; title: string }> => {
  const merges = (ws["!merges"] || []) as XLSX.Range[];
  const candidates: Array<{ row: number; title: string }> = [];

  for (const m of merges) {
    if (m.s.r !== m.e.r) continue; // only single-row merges

    const spansFullWidth = m.s.c === 0 && m.e.c === colEnd;
    const spansMostlyWidth =
      m.e.c - m.s.c >= Math.max(2, Math.floor((colEnd + 1) * 0.7));

    if (!spansFullWidth && !spansMostlyWidth) continue;

    const addr = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
    const cell = ws[addr] as XLSX.CellObject | undefined;
    const title = String(cell?.v ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;

    candidates.push({ row: m.s.r, title });
  }

  // ensure stable ordering & unique row indices
  const seen = new Set<number>();
  return candidates
    .sort((a, b) => a.row - b.row)
    .filter((x) => {
      if (seen.has(x.row)) return false;
      seen.add(x.row);
      return true;
    });
};

const findNextNonEmptyRow = (
  ws: XLSX.WorkSheet,
  fromRow: number,
  toRow: number,
  colEnd: number
): number | null => {
  for (let r = fromRow; r <= toRow; r += 1) {
    const values = getRowValues(ws, r, 0, colEnd);
    if (!isRowEmpty(values)) return r;
  }
  return null;
};

const getHeaderColumns = (
  ws: XLSX.WorkSheet,
  headerRow: number,
  colEnd: number
): Array<{ header: string; col: number }> => {
  const cols: Array<{ header: string; col: number }> = [];
  for (let c = 0; c <= colEnd; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = ws[addr] as XLSX.CellObject | undefined;
    const h = normalizeHeader(cell?.v);
    if (!h) continue;
    cols.push({ header: h, col: c });
  }
  return cols;
};

export const parseExcelTables = (filePath: string): ExcelTable[] => {
  const wb = XLSX.readFile(filePath, {
    cellDates: true,
    dense: false,
  });

  const tables: ExcelTable[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    const range = XLSX.utils.decode_range(ws["!ref"]);
    const colEnd = range.e.c;
    const rowEnd = range.e.r;

    const titleRows = getMergedTitleRows(ws, colEnd);
    if (titleRows.length === 0) continue;

    const titleRowSet = new Set(titleRows.map((t) => t.row));

    for (let i = 0; i < titleRows.length; i += 1) {
      const { row: titleRow, title } = titleRows[i];
      const nextTitleRow = titleRows[i + 1]?.row ?? rowEnd + 1;

      const headerRow =
        findNextNonEmptyRow(ws, titleRow + 1, Math.min(nextTitleRow - 1, rowEnd), colEnd) ??
        null;
      if (headerRow === null) continue;

      const headerCols = getHeaderColumns(ws, headerRow, colEnd);
      const headerValues = headerCols.map((hc) => hc.header);

      // require at least 2 headers to be considered a table
      if (headerValues.length < 2) continue;

      const headers = headerValues;

      const rows: Array<Record<string, unknown>> = [];
      for (let r = headerRow + 1; r <= rowEnd && r < nextTitleRow; r += 1) {
        if (titleRowSet.has(r)) break;

        const values = getRowValues(ws, r, 0, colEnd);
        if (isRowEmpty(values)) break;

        const rowObj: Record<string, unknown> = {};
        let nonEmptyCount = 0;

        for (const hc of headerCols) {
          const c = hc.col;
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell = ws[addr] as XLSX.CellObject | undefined;
          const v = cell?.v;
          if (!isCellEmpty(v)) nonEmptyCount += 1;
          rowObj[hc.header] = v ?? "";
        }

        if (nonEmptyCount === 0) break;
        rows.push(rowObj);
      }

      if (rows.length === 0) continue;

      tables.push({
        title,
        headers,
        rows,
        sheetName,
        tableIndex: i + 1,
        titleRow,
      });
    }
  }

  return tables;
};
