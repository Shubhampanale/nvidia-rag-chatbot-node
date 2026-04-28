import fs from "fs";
import path from "path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { createEmbeddings } from "./embeddings.service";
import { config } from "../config/env";

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

  // 4. Embed with "passage" type and store in FAISS
  const embeddings = createEmbeddings("passage");

  const storePath = path.join(config.vectorStoreDir, documentId);
  fs.mkdirSync(storePath, { recursive: true });

  console.log(`[INGEST] Embedding ${docs.length} chunks with NVIDIA passage embeddings...`);
  const vectorStore = await FaissStore.fromDocuments(docs, embeddings);
  await vectorStore.save(storePath);

  console.log(`[INGEST] Vector store saved to ${storePath}`);
  return docs.length;
}

export async function loadVectorStore(
  documentId: string,
  inputType: "passage" | "query" = "query"
): Promise<FaissStore> {
  const storePath = path.join(config.vectorStoreDir, documentId);

  if (!fs.existsSync(storePath)) {
    throw new Error(`Vector store not found for documentId: ${documentId}`);
  }

  const embeddings = createEmbeddings(inputType);
  const vectorStore = await FaissStore.load(storePath, embeddings);

  console.log(`[INGEST] Loaded vector store for documentId: ${documentId} with input_type="${inputType}"`);
  return vectorStore;
}