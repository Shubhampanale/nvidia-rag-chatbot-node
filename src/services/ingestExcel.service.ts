import fs from "fs";
import path from "path";
import { Document } from "@langchain/core/documents";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { config } from "../config/env";
import { createEmbeddings } from "./embeddings.service";
import { parseExcelTables } from "./excelParser.service";
import {
  buildExcelRowChunks,
  buildExcelTableSummaryChunks,
} from "./metadataBuilder.service";

export const EXCEL_TABLE_ROUTER_STORE_NAME = "excel_table_router";
export const EXCEL_TABLE_ROWS_DIR_NAME = "excel_table_rows";

function safeDirName(input: string): string {
  return input.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function ingestExcel(filePath: string, workbookId: string): Promise<number> {
  const tables = parseExcelTables(filePath);
  if (tables.length === 0) {
    throw new Error("No tables detected in Excel workbook (check merged title rows and headers)");
  }

  const summaryChunks = buildExcelTableSummaryChunks(tables);
  const rowChunks = buildExcelRowChunks(tables);
  if (summaryChunks.length === 0) {
    throw new Error("No tables detected to build summaries");
  }
  if (rowChunks.length === 0) {
    throw new Error("No data rows detected in Excel tables");
  }

  // 1) Router store (table-level)
  const routerDocs = summaryChunks.map((c, index) => {
    const doc = new Document({
      pageContent: c.pageContent,
      metadata: {
        ...c.metadata,
        workbookId,
        chunkIndex: index,
      },
    });
    return doc;
  });

  const embeddings = createEmbeddings("passage");
  const routerPath = path.join(config.vectorStoreDir, EXCEL_TABLE_ROUTER_STORE_NAME);
  fs.mkdirSync(routerPath, { recursive: true });

  let routerStore: FaissStore;
  if (fs.existsSync(path.join(routerPath, "docstore.json"))) {
    routerStore = await FaissStore.load(routerPath, embeddings);
    await routerStore.addDocuments(routerDocs);
  } else {
    routerStore = await FaissStore.fromDocuments(routerDocs, embeddings);
  }
  await routerStore.save(routerPath);

  // 2) Row stores (per table_id)
  const rowsDir = path.join(config.vectorStoreDir, EXCEL_TABLE_ROWS_DIR_NAME);
  fs.mkdirSync(rowsDir, { recursive: true });

  const rowsByTable = new Map<string, Document[]>();
  for (let i = 0; i < rowChunks.length; i += 1) {
    const c = rowChunks[i];
    const tid = c.metadata.table_id;
    if (!rowsByTable.has(tid)) rowsByTable.set(tid, []);
    rowsByTable.get(tid)!.push(
      new Document({
        pageContent: c.pageContent,
        metadata: {
          ...c.metadata,
          workbookId,
          chunkIndex: i,
        },
      })
    );
  }

  for (const [tableId, docs] of rowsByTable.entries()) {
    const tablePath = path.join(rowsDir, safeDirName(tableId));
    fs.mkdirSync(tablePath, { recursive: true });
    let tableStore: FaissStore;
    if (fs.existsSync(path.join(tablePath, "docstore.json"))) {
      tableStore = await FaissStore.load(tablePath, embeddings);
      await tableStore.addDocuments(docs);
    } else {
      tableStore = await FaissStore.fromDocuments(docs, embeddings);
    }
    await tableStore.save(tablePath);
  }

  console.log(
    `[INGEST_EXCEL] Saved router store (${routerDocs.length} tables) and ${rowsByTable.size} per-table row stores (${rowChunks.length} rows)`
  );
  return routerDocs.length + rowChunks.length;
}

export async function loadExcelTableVectorStore(
  inputType: "passage" | "query" = "query"
): Promise<FaissStore> {
  const storePath = path.join(config.vectorStoreDir, EXCEL_TABLE_ROUTER_STORE_NAME);
  if (!fs.existsSync(path.join(storePath, "docstore.json"))) {
    throw new Error(
      `Excel table vector store not found at ${storePath}. Please ingest an Excel file first.`
    );
  }

  const embeddings = createEmbeddings(inputType);
  return FaissStore.load(storePath, embeddings);
}
