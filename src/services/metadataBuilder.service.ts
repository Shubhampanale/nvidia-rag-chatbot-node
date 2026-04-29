import { ExcelTable } from "./excelParser.service";

export interface ExcelRowChunkMetadata {
  chunk_id: string;
  table_id: string;
  type: "row";
  table_title: string;
  headers: string[];
  college_name?: string;
  state?: string;
  course?: string;
  category?: string;
  year?: number;
  fees_total?: number;
  cutoff_score?: number;
  college_type?: string;
  city?: string;
  source: "excel";
  sheet_name?: string;
  table_index?: number;
  row_index?: number;
  row_content: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface ExcelRowChunk {
  pageContent: string;
  metadata: ExcelRowChunkMetadata;
}

export interface ExcelTableSummaryChunkMetadata {
  chunk_id: string;
  table_id: string;
  type: "table_summary";
  table_title: string;
  headers: string[];
  state?: string;
  course?: string;
  category?: string;
  year?: number;
  source: "excel";
  sheet_name?: string;
  table_index?: number;
}

export interface ExcelTableSummaryChunk {
  pageContent: string;
  metadata: ExcelTableSummaryChunkMetadata;
}

function normalizeString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s ? s : undefined;
}

function parseIntLoose(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const s = String(value).replace(/,/g, "").trim();
  const m = s.match(/-?\d+/);
  if (!m) return undefined;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseRupees(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const s = String(value).toLowerCase().replace(/,/g, " ").trim();
  if (!s) return undefined;

  const num = (() => {
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return undefined;
    const x = Number(m[0]);
    return Number.isFinite(x) ? x : undefined;
  })();
  if (num === undefined) return undefined;

  // crude lakh/crore support
  if (/\bcr\b|\bcrore\b/.test(s)) return Math.trunc(num * 1e7);
  if (/\blk\b|\blakh\b/.test(s)) return Math.trunc(num * 1e5);

  return Math.trunc(num);
}

function extractYearFromText(text: string): number | undefined {
  const m = text.match(/\b(20\d{2})\b/);
  if (!m) return undefined;
  const y = Number.parseInt(m[1], 10);
  return Number.isFinite(y) ? y : undefined;
}

function extractFromTitle(title: string): {
  state?: string;
  course?: string;
  category?: string;
  year?: number;
} {
  const t = title.toLowerCase();

  const year = extractYearFromText(title);

  const course = (() => {
    const courseMap: Array<[RegExp, string]> = [
      [/\bmbbs\b/i, "MBBS"],
      [/\bbds\b/i, "BDS"],
      [/\bbams\b/i, "BAMS"],
      [/\bbhms\b/i, "BHMS"],
      [/\bbpt(h)?\b/i, "BPTh"],
      [/\bbot(h)?\b/i, "BOTh"],
      [/\bbaslp\b/i, "BASLP"],
      [/\bbp&o\b|\bbpo\b/i, "BP&O"],
    ];
    for (const [re, name] of courseMap) {
      if (re.test(title)) return name;
    }
    return undefined;
  })();

  const category = (() => {
    const categoryMap: Array<[RegExp, string]> = [
      [/\bgeneral\b/i, "General"],
      [/\bobc\b/i, "OBC"],
      [/\bsc\b/i, "SC"],
      [/\bst\b/i, "ST"],
      [/\bews\b/i, "EWS"],
      [/\bpwd\b/i, "PwD"],
      [/\boci\b/i, "OCI"],
    ];
    for (const [re, name] of categoryMap) {
      if (re.test(title)) return name;
    }
    return undefined;
  })();

  const state = (() => {
    // Keep it simple: look for "... <State> ..." with a curated list (can be expanded later)
    const states = [
      "maharashtra",
      "karnataka",
      "tamil nadu",
      "kerala",
      "gujarat",
      "rajasthan",
      "madhya pradesh",
      "uttar pradesh",
      "bihar",
      "telangana",
      "andhra pradesh",
      "west bengal",
      "punjab",
      "haryana",
      "odisha",
      "assam",
      "delhi",
      "chhattisgarh",
      "jharkhand",
      "uttarakhand",
      "himachal pradesh",
      "jammu",
      "kashmir",
      "goa",
    ];
    const hit = states.find((s) => t.includes(s));
    if (!hit) return undefined;
    return hit
      .split(" ")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  })();

  return { state, course, category, year };
}

function normalizeCollegeType(value: unknown): string | undefined {
  const s = normalizeString(value);
  if (!s) return undefined;
  const t = s.toLowerCase();
  if (t.includes("gov")) return "Government";
  if (t.includes("govt")) return "Government";
  if (t.includes("government")) return "Government";
  if (t.includes("private")) return "Private";
  if (t.includes("deemed")) return "Deemed";
  if (t.includes("central")) return "Central";
  return s;
}

function pickFirstKey(row: Record<string, unknown>, keys: string[]): unknown {
  const lowerToKey = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const want of keys) {
    const actual = lowerToKey.get(want.toLowerCase());
    if (actual) return row[actual];
  }
  return undefined;
}

function pickByKeyIncludes(
  row: Record<string, unknown>,
  includesAny: string[],
  includesAll: string[] = []
): unknown {
  const entries = Object.entries(row);
  for (const [k, v] of entries) {
    const kl = k.toLowerCase();
    const anyOk = includesAny.length === 0 || includesAny.some((p) => kl.includes(p));
    const allOk = includesAll.length === 0 || includesAll.every((p) => kl.includes(p));
    if (anyOk && allOk) return v;
  }
  return undefined;
}

function sumFeeLikeColumns(row: Record<string, unknown>): number | undefined {
  let sum = 0;
  let found = 0;

  for (const [k, v] of Object.entries(row)) {
    const kl = k.toLowerCase();
    if (!/(fee|fees|tuition|development)/.test(kl)) continue;
    const n = parseRupees(v);
    if (n === undefined) continue;
    // Guardrails to avoid summing years/serials accidentally.
    if (n <= 0 || n > 50_000_000) continue;
    sum += n;
    found += 1;
  }

  return found > 0 ? sum : undefined;
}

function isJunkCourse(course?: string): boolean {
  if (!course) return false;
  const c = course.toLowerCase().trim();
  return c === "item" || c === "items" || c === "sr. no." || c === "sr no" || c === "sr.no.";
}

export function buildExcelRowChunks(tables: ExcelTable[]): ExcelRowChunk[] {
  let counter = 0;
  const chunks: ExcelRowChunk[] = [];

  for (const table of tables) {
    const titleInfo = extractFromTitle(table.title);
    const table_id = `excel_${table.sheetName}_table_${table.tableIndex}`;

    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex];
      counter += 1;
      const chunk_id = `excel_row_${String(counter).padStart(4, "0")}`;

      const college_name = normalizeString(
        pickFirstKey(row, ["College Name", "College", "Institute", "Institute Name"])
      );
      const city = normalizeString(pickFirstKey(row, ["City", "Town"]));
      const state = normalizeString(pickFirstKey(row, ["State"])) ?? titleInfo.state;
      const courseFromRow = normalizeString(pickFirstKey(row, ["Course"]));
      const course = (courseFromRow && !isJunkCourse(courseFromRow) ? courseFromRow : undefined) ?? titleInfo.course;
      const category =
        normalizeString(pickFirstKey(row, ["Category", "Reservation Category"])) ??
        titleInfo.category;
      const year =
        parseIntLoose(pickFirstKey(row, ["Year"])) ??
        titleInfo.year ??
        extractYearFromText(table.title);

      const tuition_fee = parseRupees(
        pickFirstKey(row, [
          "Annual Tuition fee per annum Rs.",
          "Tuition Fee",
          "Tuition Fees",
          "Annual Tuition Fee",
          "Annual Tuition fee",
          "Tuition fee per annum",
        ]) ??
          pickByKeyIncludes(row, ["tuition"], ["fee"])
      );
      const development_fee = parseRupees(
        pickFirstKey(row, [
          "Development Fee per annum Rs.",
          "Development Fee",
          "Development fee per annum",
        ]) ?? pickByKeyIncludes(row, ["development"], ["fee"])
      );

      const feesDirect = parseRupees(
        pickFirstKey(row, ["Fees", "Total Fees", "Fees Total", "Fee", "Tuition Fees", "Total Fee", "Total fee"])
      );
      const fees_total =
        (tuition_fee !== undefined || development_fee !== undefined
          ? (tuition_fee ?? 0) + (development_fee ?? 0)
          : undefined) ??
        feesDirect ??
        sumFeeLikeColumns(row);

      const cutoff_score = parseIntLoose(
        pickFirstKey(row, ["Cutoff", "Cutoff Score", "Score", "Marks", "NEET Marks"])
      );
      const college_type = normalizeCollegeType(
        pickFirstKey(row, ["Type", "College Type", "Institute Type"])
      );

      const looksLikeTableHeaderRow =
        Boolean(courseFromRow && isJunkCourse(courseFromRow)) &&
        !college_name &&
        !fees_total &&
        !cutoff_score &&
        !tuition_fee &&
        !development_fee;
      if (looksLikeTableHeaderRow) continue;

      const metadata: ExcelRowChunkMetadata = {
        chunk_id,
        table_id,
        type: "row",
        table_title: table.title,
        headers: table.headers,
        college_name,
        state,
        course,
        category,
        year,
        fees_total,
        cutoff_score,
        college_type,
        city,
        sheet_name: table.sheetName,
        table_index: table.tableIndex,
        row_index: rowIndex + 1,
        source: "excel",
        row_content: row,
        raw: row,
      };

      const kv = [
        ["type", "row"],
        ["table_id", table_id],
        ["table_title", table.title],
        ["sheet_name", table.sheetName],
        ["row_index", rowIndex + 1],
        ["headers", table.headers.join(" | ")],
        ["college_name", college_name],
        ["city", city],
        ["state", state],
        ["course", course],
        ["category", category],
        ["year", year],
        ["tuition_fee", tuition_fee],
        ["development_fee", development_fee],
        ["fees_total", fees_total],
        ["cutoff_score", cutoff_score],
        ["college_type", college_type],
        ["row_content", JSON.stringify(row)],
      ]
        .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");

      chunks.push({
        pageContent: kv,
        metadata,
      });
    }
  }

  return chunks;
}

function buildFeeBreakdownLines(
  rows: Array<Record<string, unknown>>,
  limit: number
): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const course = normalizeString(pickFirstKey(row, ["Course"])) ?? normalizeString(pickByKeyIncludes(row, [], ["course"]));
    if (course && isJunkCourse(course)) continue;
    const tuition = parseRupees(pickByKeyIncludes(row, ["tuition"], ["fee"]));
    const development = parseRupees(pickByKeyIncludes(row, ["development"], ["fee"]));
    const fees_total = sumFeeLikeColumns(row);

    if (!course) continue;
    if (tuition === undefined && development === undefined && fees_total === undefined) continue;

    const parts: string[] = [];
    if (tuition !== undefined) parts.push(`₹${tuition} tuition`);
    if (development !== undefined) parts.push(`₹${development} development`);
    if (tuition === undefined && development === undefined && fees_total !== undefined) parts.push(`₹${fees_total} total`);

    out.push(`- ${course}: ${parts.join(" + ")}`);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildExcelTableSummaryChunks(tables: ExcelTable[]): ExcelTableSummaryChunk[] {
  let counter = 0;
  const summaries: ExcelTableSummaryChunk[] = [];

  for (const table of tables) {
    counter += 1;
    const table_id = `excel_${table.sheetName}_table_${table.tableIndex}`;
    const titleInfo = extractFromTitle(table.title);

    const lines = buildFeeBreakdownLines(table.rows, 12);
    const descriptionParts = [
      `Table title: ${table.title}`,
      titleInfo.state ? `State: ${titleInfo.state}` : undefined,
      titleInfo.year ? `Year: ${titleInfo.year}` : undefined,
      titleInfo.course ? `Course: ${titleInfo.course}` : undefined,
      titleInfo.category ? `Category: ${titleInfo.category}` : undefined,
      `Sheet: ${table.sheetName}`,
      `Table index: ${table.tableIndex}`,
    ].filter(Boolean) as string[];

    const summaryText = [
      `type: table_summary`,
      `table_id: ${table_id}`,
      ...descriptionParts,
      `headers: ${table.headers.join(" | ")}`,
      lines.length ? `Includes:` : undefined,
      ...lines,
    ]
      .filter(Boolean)
      .join("\n");

    summaries.push({
      pageContent: summaryText,
      metadata: {
        chunk_id: `excel_table_${String(counter).padStart(4, "0")}`,
        table_id,
        type: "table_summary",
        table_title: table.title,
        headers: table.headers,
        state: titleInfo.state,
        year: titleInfo.year,
        course: titleInfo.course,
        category: titleInfo.category,
        sheet_name: table.sheetName,
        table_index: table.tableIndex,
        source: "excel",
      },
    });
  }

  return summaries;
}
