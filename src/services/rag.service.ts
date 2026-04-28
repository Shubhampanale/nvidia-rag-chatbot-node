import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { createLLM } from "./llm.service";
import { loadVectorStore } from "./ingest.service";
import { ChatMessage, RAGContext } from "../types";
import { NvidiaClient } from "../utils/nvidia.client";

// ─── Prompts ────────────────────────────────────────────────────────────────

// Stage 1: Just clean + summarize the raw chunks — NO LLM, pure text processing
function buildCleanContext(docs: RAGContext[]): string {
  return docs
    .map((doc, i) => {
      const page = doc.metadata?.pageNumber ?? "?";
      const text = doc.pageContent
        .replace(/\s+/g, " ")        // collapse whitespace
        .replace(/[^\x20-\x7E]/g, "") // strip non-ASCII garbage from PDF parse
        .trim();
      return `[${i + 1}] (p.${page}) ${text}`;
    })
    .filter((chunk) => chunk.length > 20) // drop empty/junk chunks
    .join("\n");
}

// Stage 2: Minimal system prompt — only what Gemma needs, nothing extra
const SYSTEM_PROMPT = `You are a document assistant. Answer using ONLY the context provided. If unsure, say "Not found in document."`;
const SYSTEM_RAG_FORMAT_PROMPT = `
You are a document assistant.

Rules:
- Answer ONLY from the provided context
- Keep the answer clear and well formatted
- Use bullet points if helpful
- If the answer is not in the context, say: "Not found in document."
`;
function formatHistory(history: ChatMessage[]) {
  return history.slice(-4).map((m) =>  // max 2 turns to save tokens
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );
}

function extractSources(docs: RAGContext[]): string[] {
  return [
    ...new Set(
      docs
        .map((d) => d.metadata?.pageNumber)
        .filter(Boolean)
        .map((p) => `Page ${p}`)
    ),
  ];
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateRAGResponse(
  question: string,
  documentId: string
): Promise<{ answer: string; sources: string[]; chunks: string }> {

  // 1. Retrieve
  const vectorStore = await loadVectorStore(documentId, "query");
  const retriever = vectorStore.asRetriever({ k: 3 });
  const relevantDocs = await retriever.invoke(question);

  if (!relevantDocs.length) {
    return {
      answer: "No relevant content found in the document.",
      sources: [],
      chunks: "",
    };
  }

  // 2. Clean context
  const context = buildCleanContext(relevantDocs as RAGContext[]);
  const sources = extractSources(relevantDocs as RAGContext[]);

  console.log("context::", context)

  // 3. Minimal prompt (ONLY system + human)
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_RAG_FORMAT_PROMPT],
    ["human", `Context:\n${context}\n\nQuestion: ${question}`],
  ]);

  const llm = createLLM();
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());

  // 4. Call LLM
  //using langchain invoke model
  // const answer = await chain.invoke({});

  //using nvidia cliend invoke model
  const nvidiaClient = new NvidiaClient();

  const answer = await nvidiaClient.chat({
    messages: [
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  return {
    answer: answer.trim(),
    sources,
    chunks: context,
  };
}