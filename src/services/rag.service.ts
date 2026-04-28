import { RAGContext } from "../types";
import { config } from "../config/env";
import { NvidiaClient } from "../utils/nvidia.client";
import { loadGlobalVectorStore } from "./ingest.service";

// ─── Prompts ────────────────────────────────────────────────────────────────

const SYSTEM_RAG_PROMPT = `You are a document assistant.

Rules:
- Answer ONLY from the provided context
- Keep the answer clear and well formatted
- Use bullet points if helpful
- If the answer is not in the context, say: "Not found in document."`;

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

INTENT TYPES:
Counselling, College info, Fees, Course compare, Documents, Exam, Drop/Take, Choice filling, Top colleges, Unclear, Off-topic, Prediction

STRICT NO:
- No cutoff prediction
- No rank/marks estimation
- No seat probability or trends

IF PREDICTION ASKED:
- Do NOT calculate
- Redirect only: https://cutoffmantra.appristine.in/signin

FORMAT:
- Fees: Govt / Private / Deemed
- Include bond, internship, hostel when needed
- Choice filling: Dream / Safe / Backup

BEHAVIOR:
- Answer only main intent
- Keep response practical
- No long explanations
- No guarantees

OFF-TOPIC RULE (DYNAMIC):
If user question is not related to medical admissions:
- First, politely acknowledge the topic
- Then clearly say it is this platform intented to the neet medical counselling help
- Then smoothly redirect user back to medical counselling help
- Tone must feel natural, not robotic
- Never use same sentence twice
`;

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

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateRAGResponse(
  question: string,
  documentId?: string
): Promise<{ answer: string; sources: string[]; chunks: string }> {

  // 1. Load global store
  const vectorStore = await loadGlobalVectorStore("query");

  // 2. Retrieve with similarity scores
  const k = documentId ? 10 : 3;
  let resultsWithScores = await vectorStore.similaritySearchWithScore(question, k);

  if (documentId) {
    resultsWithScores = resultsWithScores.filter(
      ([doc]) => doc.metadata?.documentId === documentId
    );
    resultsWithScores = resultsWithScores.slice(0, 3);
  }

  // 3. Evaluate relevance against threshold (FAISS L2 distance — lower is better)
  const threshold = config.similarityThreshold;
  const relevantResults = resultsWithScores.filter(([, score]) => score <= threshold);

  const nvidiaClient = new NvidiaClient();

  // ── Case 2: No Relevant Context → Fallback to LLM ────────────────────────
  if (relevantResults.length === 0) {
    console.log(`[RAG] No relevant context (best score > ${threshold}). Falling back to LLM.`);

    const answer = await nvidiaClient.chat({
      messages: [{ role: "user", content: question }],
      systemPrompt: fallbackPrompt,
    });

    return {
      answer: answer.trim(),
      sources: [],
      chunks: "",
    };
  }

  // ── Case 1: Relevant Context Found → RAG Flow ────────────────────────────
  const relevantDocs = relevantResults.map(([doc]) => doc);
  const context = buildCleanContext(relevantDocs as RAGContext[]);
  const sources = extractSources(relevantDocs as RAGContext[]);

  const answer = await nvidiaClient.chat({
    messages: [
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
    systemPrompt: SYSTEM_RAG_PROMPT,
  });

  return {
    answer: answer.trim(),
    sources,
    chunks: context,
  };
}

