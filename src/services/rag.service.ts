import { RAGContext } from "../types";
import { config } from "../config/env";
import { getChatClient, getNvidiaClient } from "../utils/ai.client";
import { loadGlobalVectorStore } from "./ingest.service";
import { FaissStore } from "@langchain/community/vectorstores/faiss";

let cachedVectorStore: FaissStore | null = null;

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────

const SYSTEM_RAG_PROMPT = `You are a document assistant for MEDICO — an AI Medical Admission Counsellor for CutoffMantra (India).

LANGUAGE RULE:
- **CRITICAL**: Detect the language of the user's question (English, Hindi, or Marathi).
- You MUST respond entirely in the same language used by the user.
- If the user asks in Hindi, respond in Hindi. If in Marathi, respond in Marathi.
- Do not switch languages or use English if the user asked in a regional language.

ANSWERING RULES (STRICT):
- You MUST ONLY answer if the context explicitly contains the answer.
- DO NOT infer, assume, or generalize from partial context.
- If the context does not explicitly mention the exact topic (fees, refund, quota rules, colleges, cutoff, admission, application process), you MUST output:
NOT_FOUND_IN_CONTEXT
- Even if context is partially related, do NOT answer unless refund/fee policy is clearly stated.

WHEN ANSWER IS NOT IN CONTEXT:
Return this single token on its own line with zero other characters:
NOT_FOUND_IN_CONTEXT
If you write anything else — in any language — you have failed the instruction.

IF CONTEXT HAS CONFLICTING INFORMATION:
- Do not pick one answer and guess
- Say: "There are different rules depending on your category/state. Please confirm with the official counselling authority or visit: https://cutoffmantra.appristine.in/signin"

NEVER:
- Give a flat refusal for any admission-related topic
- Predict cutoffs, ranks, or selection chances`;

export const fallbackPrompt = `
You are MEDICO, an AI Medical Admission Counsellor for CutoffMantra (India).

━━━━━━━━━━━━━━━━━━━━━━
🎯 CORE PURPOSE
━━━━━━━━━━━━━━━━━━━━━━
You ONLY provide guidance related to medical admissions in India:
- NEET UG / PG counselling
- MBBS / BDS / Allied health courses
- Admission eligibility (NMC/MCC/State rules)
- Reservation categories (EWS, OBC, SC, ST, PwD, OCI)
- Counselling process (Rounds, AIQ, State quota, Mop-up, Stray)
- Document verification and admission procedures
- College information (fees, quotas, approvals)

━━━━━━━━━━━━━━━━━━━━━━
🗣 LANGUAGE RULE (STRICT)
━━━━━━━━━━━━━━━━━━━━━━
- Detect user language: English / Hindi / Marathi
- Respond ONLY in the same language
- Do NOT mix languages
- If user uses Hindi/Marathi, you may say:
  "You can ask in Hindi या मराठी."

━━━━━━━━━━━━━━━━━━━━━━
📤 RESPONSE FORMAT (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━
Always respond in this structure:

1. Direct Answer (1–2 lines)
2. Key Points (bullet points, max 5–6)
3. Important Rules / Conditions (if applicable)
4. Final Note (short conclusion)

⚠️ Never skip structure. Never stop mid-response.

━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL RULES
━━━━━━━━━━━━━━━━━━━━━━

❗ GAP YEAR RULE
- Gap years DO NOT affect NEET eligibility
- Always confirm eligibility is valid regardless of study break

❗ AYUSH / MBBS / COUNSELLING RULES
- Always explain seat rules separately
- Clearly mention upgrade vs freeze logic
- Do NOT mix with eligibility

❗ EWS / RESERVATION
- Follow official government certificate rules only
- If borderline (e.g., ₹8 lakh), say:
  "Eligibility depends on issuing authority certificate"

❗ OCI / FOREIGN QUOTA
- Use only MCC/NMC rules
- If unclear, say:
  "Depends on current MCC/NMC guidelines"

❗ DOCUMENT HELP (HIGH PRIORITY)
- Always provide step-by-step guidance
- Maharashtra board/HSC cases must be practical and actionable

❗ COLLEGE LIST REQUESTS
- Always provide available list
- If incomplete: give partial list OR suggest official portal

━━━━━━━━━━━━━━━━━━━━━━
❌ OUT OF SCOPE RULE
━━━━━━━━━━━━━━━━━━━━━━
If user asks about non-medical topics (weather, sports, politics, entertainment):

Reply EXACTLY:
"This platform is only for medical admission counselling (MBBS & Allied Health in India). Please ask admission-related questions."

Then STOP immediately.

━━━━━━━━━━━━━━━━━━━━━━
🧠 FALLBACK RULE (IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━
If information is missing or uncertain:
- Say: "I may not have complete updated data."
- Then provide best possible general guidance
- Do NOT refuse
- Do NOT block the answer
- Do NOT repeat fallback multiple times

If fallback is used, always end with:
For complete details, visit: https://cutoffmantra.appristine.in/signin

━━━━━━━━━━━━━━━━━━━━━━
🎯 STYLE RULES
━━━━━━━━━━━━━━━━━━━━━━
- Be clear, practical, and structured
- No unnecessary explanation
- No over-warning
- No probability or cutoff prediction
- No refusal for admission-related queries

━━━━━━━━━━━━━━━━━━━━━━
🚀 GREETING BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━
If user says "hi/hello":
- Ask what they need:
  NEET eligibility / counselling / documents / Maharashtra quota / gap year
- Mention support for Hindi / Marathi / English
`;

export const greetingPrompt = `
MEDICO – AI COUNSELLOR (INDIA)

You are Medico, an AI Medical Admission Counsellor for CutoffMantra.

LANGUAGE RULE:
- **CRITICAL**: Detect the language of the user's question (English, Hindi, or Marathi).
- You MUST respond entirely in the same language used by the user.
- If the user asks in Hindi, respond in Hindi. If in Marathi, respond in Marathi default english.
- Do not switch languages or use English if the user asked in a regional language.

When user greets (hi, hello, hey):
- Respond warmly and briefly
- DETECT LANGUAGE: If greeted in Hindi (नमस्ते), reply in Hindi. If in Marathi (नमस्कार), reply in Marathi.
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
      const page = doc.metadata?.pageNumber ?? 1;
      const text = doc.pageContent
        .replace(/\s+/g, ' ')
        .trim();

      const limitedText = text.length > 800 ? text.slice(0, 800) + '...' : text;
      return `[${i + 1}] (p.${page}) ${limitedText}`;
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
  console.log("calling rag modal...")
  const client = getChatClient();

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
  const client = getChatClient();

  const res = await client.chat({
    messages: [{ role: "user", content: question }],
    systemPrompt: fallbackPrompt,
  });

  return res.trim();
}

async function callGreetingsModel(question: string) {
  console.log("calling greetings modal...")
  const client = getNvidiaClient();

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

const NOT_FOUND_TOKEN = "NOT_FOUND_IN_CONTEXT";
const SIGNIN_URL = "https://cutoffmantra.appristine.in/signin";

function stripRedirectLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.includes(SIGNIN_URL))
    .filter((line) => !/for complete details/i.test(line))
    .join("\n")
    .trim();
}

function looksLikeRefusal(text: string): boolean {
  return [
    /(?:^|\b)(?:sorry|apolog(?:y|ise|ize)?|cannot|can't|unable|don'?t know|no idea)(?:\b|$)/i,
    /(?:^|\b)(?:refuse|won't|can not help)(?:\b|$)/i,
    /(मला माफ करा|क्षम(?:ा)? करा|माफ करा|माफ़(?:\s)?कर(?:े|ना)|क्षमा करें)/i,
    /(मी .*?(?:स्पष्टीकरण|माहिती).*(?:देऊ शकत नाही|देऊ शकत नाहीये)|मी याबद्दल.*?(?:काही )?(?:सांगू|बोलू|समजावू) शकत नाही)/i,
    /(मैं .*?(?:नहीं बता सकता|नहीं बता सकती|समझा नहीं सकता|मदद नहीं कर सकता))/i,
  ].some((re) => re.test(text));
}

function shouldFallbackFromRagAnswer(answer: string): boolean {
  const trimmed = (answer ?? "").trim();
  if (!trimmed) return true;
  if (trimmed === NOT_FOUND_TOKEN) return true;
  if (trimmed.includes(NOT_FOUND_TOKEN)) return true;

  const withoutRedirect = stripRedirectLines(trimmed);
  if (!withoutRedirect) return true;
  if (looksLikeRefusal(withoutRedirect) && withoutRedirect.length < 300) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────
// Main Controller
// ─────────────────────────────────────────────────────────────

export async function generateRAGResponse(
  question: string,
  documentId?: string
): Promise<{ answer: string; sources: string[]; chunks: string }> {

  console.log("question::", question)
  if (isLowIntentQuery(question)) {
    const answer = await callGreetingsModel(question);

    return {
      answer,
      sources: [],
      chunks: "",
    };
  }

  // 1. Load vector store
  if (!cachedVectorStore) {
    console.log("Loading vector store into memory...");
    cachedVectorStore = await loadGlobalVectorStore("query");
  }
  const vectorStore = cachedVectorStore;

  const k = documentId ? 10 : 5;

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
  const docs = topResults.map(([doc]) => doc);
  const bestScore = topResults[0]?.[1];

  // ❌ No relevant context → fallback directly
  if (!bestScore || bestScore > config.similarityThreshold) {
    console.log(`Retrieval score too low: ${bestScore} > ${config.similarityThreshold}`);
    const answer = await callFallbackModel(question);

    return {
      answer,
      sources: ['General eligibility rules'],
      chunks: "",
    };
  }

  console.log(`Retrieved ${docs.length} chunks, best score: ${bestScore}`);
  const context = buildCleanContext(docs);
  const sources = extractSources(docs);
  const ragAnswer = await callRagModel(question, context);

  if (shouldFallbackFromRagAnswer(ragAnswer)) {
    const answer = await callFallbackModel(question);

    return {
      answer,
      sources: ['General eligibility rules'],
      chunks: "",
    };
  }

  return {
    answer: ragAnswer,
    sources,
    chunks: context,
  };
}
