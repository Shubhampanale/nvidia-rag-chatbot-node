import fs from "fs";
import path from "path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { createEmbeddings } from "./embeddings.service";
import { config } from "../config/env";

export const GLOBAL_STORE_NAME = "global";

export async function ingestPDF(
  filePath: string,
  documentId: string
): Promise<number> {
  // 1. Load PDF
  const loader = new PDFLoader(filePath, { splitPages: true });
  const rawDocs = await loader.load();

  if (rawDocs.length === 0) {
    throw new Error("PDF appears to be empty or could not be parsed");
  }

  console.log(`[INGEST] Loaded ${rawDocs.length} pages from PDF`);

  // 2. Split into chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: config.chunkSize,
    chunkOverlap: config.chunkOverlap,
    separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
  });

  const docs = await splitter.splitDocuments(rawDocs);
  console.log(`[INGEST] Split into ${docs.length} chunks`);

  // 3. Tag each chunk with documentId + clean metadata
  docs.forEach((doc, index) => {
    doc.metadata.documentId = documentId;
    doc.metadata.chunkIndex = index;
    doc.metadata.pageNumber = doc.metadata.loc?.pageNumber ?? "unknown";
  });

  // 4. Embed with "passage" type and store in GLOBAL FAISS store
  const embeddings = createEmbeddings("passage");

  const globalStorePath = path.join(config.vectorStoreDir, GLOBAL_STORE_NAME);
  fs.mkdirSync(globalStorePath, { recursive: true });

  let vectorStore: FaissStore;

  if (fs.existsSync(path.join(globalStorePath, "docstore.json"))) {
    // Load existing global store and add new documents
    console.log(`[INGEST] Loading existing global store...`);
    vectorStore = await FaissStore.load(globalStorePath, embeddings);
    await vectorStore.addDocuments(docs);
  } else {
    // Create new global store
    console.log(`[INGEST] Creating new global store...`);
    vectorStore = await FaissStore.fromDocuments(docs, embeddings);
  }

  await vectorStore.save(globalStorePath);

  console.log(`[INGEST] Global vector store saved to ${globalStorePath} (${docs.length} new chunks)`);
  return docs.length;
}

export async function loadGlobalVectorStore(
  inputType: "passage" | "query" = "query"
): Promise<FaissStore> {
  const globalStorePath = path.join(config.vectorStoreDir, GLOBAL_STORE_NAME);

  if (!fs.existsSync(path.join(globalStorePath, "docstore.json"))) {
    throw new Error(`Global vector store not found at ${globalStorePath}. Please ingest documents first.`);
  }

  const embeddings = createEmbeddings(inputType);
  const vectorStore = await FaissStore.load(globalStorePath, embeddings);

  console.log(`[INGEST] Loaded global vector store with input_type="${inputType}"`);
  return vectorStore;
}

// Backwards-compatible wrapper (optional, can be removed later)
export async function loadVectorStore(
  _documentId: string,
  inputType: "passage" | "query" = "query"
): Promise<FaissStore> {
  return loadGlobalVectorStore(inputType);
}

