import fs from "fs";
import path from "path";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { config } from "../config/env";
import {
  EXCEL_TABLE_ROUTER_STORE_NAME,
  EXCEL_TABLE_ROWS_DIR_NAME,
  loadExcelTableVectorStore,
} from "./ingestExcel.service";
import { createEmbeddings } from "./embeddings.service";

export interface RetrievedExcelRow {
  table_id: string;
  table_title: string;
  sheet_name: string;
  row_index: number;
  row: Record<string, unknown>;
  pageContent?: string;
  score?: number;
}

export interface ExcelTableRetrievalResult {
  table_id: string;
  table_title: string;
  sheet_name: string;
  rows: RetrievedExcelRow[];
  router_score?: number;
  best_row_score?: number;
}

type RouterDoc = {
  pageContent: string;
  metadata: Record<string, unknown>;
};

const normalizeText = (s: string): string => {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
};

const safeDirName = (input: string): string => {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_");
};

const loadRouterDocsFromDisk = (): RouterDoc[] => {
  const routerPath = path.join(config.vectorStoreDir, EXCEL_TABLE_ROUTER_STORE_NAME);
  const docstorePath = path.join(routerPath, "docstore.json");
  if (!fs.existsSync(docstorePath)) return [];

  const raw = JSON.parse(fs.readFileSync(docstorePath, "utf8"));
  const entries = Array.isArray(raw) ? raw[0] : [];
  if (!Array.isArray(entries)) return [];

  const docs: RouterDoc[] = [];
  for (const item of entries) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const doc = item[1] as RouterDoc;
    if (!doc?.pageContent || !doc?.metadata) continue;
    docs.push(doc);
  }
  return docs;
};

const pickBestLexicalTable = (query: string, routerDocs: RouterDoc[]): RouterDoc | null => {
  const qn = normalizeText(query);

  // 1) Exact title match
  for (const d of routerDocs) {
    const title = String(d.metadata?.table_title ?? d.metadata?.table_title ?? d.metadata?.table_title ?? "");
    if (!title) continue;
    if (normalizeText(title) === qn) return d;
  }

  // 2) Near-exact: query contains title, or title contains query (when query is long enough)
  let best: { doc: RouterDoc; score: number } | null = null;
  for (const d of routerDocs) {
    const title = String(d.metadata?.table_title ?? "");
    const sheet = String(d.metadata?.sheet_name ?? "");
    const headers = Array.isArray(d.metadata?.headers) ? (d.metadata.headers as string[]) : [];
    const hay = normalizeText([title, sheet, headers.join(" ")].filter(Boolean).join(" "));
    if (!hay) continue;

    let score = 0;
    const tn = normalizeText(title);
    if (qn.includes(tn) && tn.length >= 10) score += 3;
    if (tn.includes(qn) && qn.length >= 10) score += 2;

    // token overlap
    const qTokens = new Set(qn.split(" ").filter((t) => t.length > 2));
    const hTokens = new Set(hay.split(" ").filter((t) => t.length > 2));
    let inter = 0;
    for (const t of qTokens) if (hTokens.has(t)) inter += 1;
    const denom = Math.max(1, Math.min(qTokens.size, hTokens.size));
    score += inter / denom;

    if (!best || score > best.score) best = { doc: d, score };
  }

  if (best && best.score >= 1.6) return best.doc;
  return null;
};

const pickBestSemanticTable = async (
  query: string
): Promise<{ doc: RouterDoc; score: number } | null> => {
  try {
    const routerStore = await loadExcelTableVectorStore("query");
    const hits = await routerStore.similaritySearchWithScore(query, 5);
    const summaries = hits
      .filter(([doc]) => doc.metadata?.type === "table_summary")
      .sort((a, b) => a[1] - b[1]);
    const best = summaries[0] as any;
    if (!best) return null;
    const doc = best[0];
    const score = best[1];
    return { doc: { pageContent: doc.pageContent, metadata: doc.metadata ?? {} }, score };
  } catch {
    return null;
  }
};

const loadRowStoreForTable = async (tableId: string): Promise<FaissStore | null> => {
  const rowsDir = path.join(config.vectorStoreDir, EXCEL_TABLE_ROWS_DIR_NAME);
  const tablePath = path.join(rowsDir, safeDirName(tableId));
  if (!fs.existsSync(path.join(tablePath, "docstore.json"))) return null;

  const embeddings = createEmbeddings("query");
  return FaissStore.load(tablePath, embeddings);
};

export async function retrieveExcelTableRows(
  query: string,
  opts?: { topKRows?: number }
): Promise<ExcelTableRetrievalResult | null> {
  const topKRows = opts?.topKRows ?? 8;
  const routerDocs = loadRouterDocsFromDisk();
  if (routerDocs.length === 0) return null;

  // Route to a table (lexical first, then semantic)
  const lexical = pickBestLexicalTable(query, routerDocs);
  const semantic = lexical ? null : await pickBestSemanticTable(query);
  const routed = lexical ?? semantic?.doc ?? null;
  if (!routed) return null;

  const table_id = String(routed.metadata?.table_id ?? "");
  const table_title = String(routed.metadata?.table_title ?? "");
  const sheet_name = String(routed.metadata?.sheet_name ?? "");
  if (!table_id || !table_title || !sheet_name) return null;

  const rowStore = await loadRowStoreForTable(table_id);
  if (!rowStore) return null;

  const hits = await rowStore.similaritySearchWithScore(query, topKRows);
  const bestRowScore = hits[0]?.[1];
  const rows: RetrievedExcelRow[] = hits
    .map(([doc, score]) => {
      const meta = (doc.metadata ?? {}) as any;
      const row = (meta.row_content ?? meta.raw ?? {}) as Record<string, unknown>;
      return {
        table_id: String(meta.table_id ?? table_id),
        table_title: String(meta.table_title ?? table_title),
        sheet_name: String(meta.sheet_name ?? sheet_name),
        row_index: Number(meta.row_index ?? 0),
        row,
        pageContent: doc.pageContent,
        score,
      };
    })
    .filter((r) => r.table_id === table_id)
    .slice(0, topKRows);

  if (rows.length === 0) return null;

  return {
    table_id,
    table_title,
    sheet_name,
    rows,
    router_score: semantic?.score,
    best_row_score: bestRowScore,
  };
}
