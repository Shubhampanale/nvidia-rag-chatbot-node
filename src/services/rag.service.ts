import { RAGContext } from "../types";
import { config } from "../config/env";
import { NvidiaClient } from "../utils/nvidia.client";
import { loadGlobalVectorStore } from "./ingest.service";

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────

const SYSTEM_RAG_PROMPT = `You are a document assistant.

Rules:
- Answer ONLY from the provided context
- Keep the answer clear and well formatted
- Use bullet points if helpful
- If the answer is not in the context, say: "NOT_FOUND_IN_CONTEXT"`;

export const fallbackPrompt = `
MEDICO – AI COUNSELLOR (INDIA)

Role: Medical Admission Counsellor (CutoffMantra)
Scope: India MBBS & Allied Health only
Link: https://cutoffmantra.appristine.in/signin

RULES:
- Be short, simple, structured
- No greetings or repeated intro
- Reply in user language (EN/HI/MR)
- Always guide next step

STRICT NO:
- No cutoff prediction
- No rank/marks estimation
- No seat probability or trends

IF PREDICTION ASKED:
- Do NOT calculate
- Redirect only: https://cutoffmantra.appristine.in/signin

BEHAVIOR:
- Answer only main intent
- Keep response practical
- No long explanations
`;

export const greetingPrompt = `
MEDICO – AI COUNSELLOR (INDIA)

You are Medico, an AI Medical Admission Counsellor for CutoffMantra.

When user greets (hi, hello, hey):
- Respond warmly and briefly
- Introduce yourself in 1 line
- Mention you help with MBBS & Allied Health admissions in India
- Ask what guidance they need (counselling, college, fees, choice filling)

RULES:
- Keep it very short (2–4 lines max)
- No long explanation
- No cutoff prediction or numbers
- Be friendly and student-focused
`;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function buildCleanContext(docs: RAGContext[]): string {
  return docs
    .map((doc, i) => {
      const page = doc.metadata?.pageNumber ?? "?";
      const text = doc.pageContent
        .replace(/\s+/g, " ")
        .replace(/[^\x20-\x7E]/g, "")
        .trim();

      return `[${i + 1}] (p.${page}) ${text}`;
    })
    .filter((chunk) => chunk.length > 20)
    .join("\n");
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

// ─────────────────────────────────────────────────────────────
// Model Calls (Separated)
// ─────────────────────────────────────────────────────────────

async function callRagModel(question: string, context: string) {
  const client = new NvidiaClient();

  const res = await client.chat({
    messages: [
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    systemPrompt: SYSTEM_RAG_PROMPT,
  });

  return res.trim();
}

async function callFallbackModel(question: string) {
  const client = new NvidiaClient();

  const res = await client.chat({
    messages: [{ role: "user", content: question }],
    systemPrompt: fallbackPrompt,
  });

  return res.trim();
}

async function callGreetingsModel(question: string) {
  const client = new NvidiaClient();

  const res = await client.chat({
    messages: [{ role: "user", content: question }],
    systemPrompt: greetingPrompt,
  });

  return res.trim();
}

function isLowIntentQuery(query: string): boolean {
  const q = query.toLowerCase().trim();

  const greetings = [
    "hi", "hello", "hey", "good morning", "good evening"
  ];

  return greetings.includes(q) || q.length < 4;
}
// ─────────────────────────────────────────────────────────────
// Main Controller
// ─────────────────────────────────────────────────────────────

export async function generateRAGResponse(
  question: string,
  documentId?: string
): Promise<{ answer: string; sources: string[]; chunks: string }> {

  if (isLowIntentQuery(question)) {
    const answer = await callGreetingsModel(question);

    return {
      answer,
      sources: [],
      chunks: "",
    };
  }

  // 1. Load vector store
  const vectorStore = await loadGlobalVectorStore("query");

  const k = documentId ? 10 : 3;

  let resultsWithScores = await vectorStore.similaritySearchWithScore(
    question,
    k
  );

  // 2. Filter by document if needed
  if (documentId) {
    resultsWithScores = resultsWithScores
      .filter(([doc]) => doc.metadata?.documentId === documentId)
      .slice(0, 3);
  }

  const topResults = resultsWithScores.slice(0, 3);
  console.log("topResults::", topResults)
  const docs = topResults.map(([doc]) => doc);
  console.log("docs::", docs)
  const bestScore = topResults[0]?.[1];

  // ❌ No relevant context → fallback directly
  if (!bestScore || bestScore > 1.6) {
    const answer = await callFallbackModel(question);

    return {
      answer,
      sources: [],
      chunks: "",
    };
  }

  const context = buildCleanContext(docs);
  const sources = extractSources(docs);

  // 🧠 Try RAG model
  const ragAnswer = await callRagModel(question, context);

  // ❌ If RAG says context is not enough → fallback
  if (ragAnswer.includes("NOT_FOUND_IN_CONTEXT")) {
    const answer = await callFallbackModel(question);

    return {
      answer,
      sources: [],
      chunks: "",
    };
  }

  return {
    answer: ragAnswer,
    sources,
    chunks: context,
  };
}