import { RAGContext } from "../types";
import { config } from "../config/env";
import { NvidiaClient } from "../utils/nvidia.client";
import { loadGlobalVectorStore } from "./ingest.service";

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

You ONLY help with medical admission guidance in India:
- NEET UG / PG counselling
- MBBS / BDS / Allied health admissions
- Eligibility rules (NMC/MCC)
- Reservation (EWS, OBC, SC, ST, OCI, PwD)
- Counselling process (Rounds, AIQ, State quota)
- Document verification & admission procedures
- College information (fees, quota, eligibility)

━━━━━━━━━━━━━━━━━━━━━━
🗣 LANGUAGE RULE (IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULE:
- **CRITICAL**: Detect the language of the user's question (English, Hindi, or Marathi).
- You MUST respond entirely in the same language used by the user.
- If the user asks in Hindi, respond in Hindi. If in Marathi, respond in Marathi.
- Do not switch languages or use English if the user asked in a regional language.

If user is from Maharashtra or uses Hindi/Marathi:
👉 Always allow and encourage:
"You can ask in Hindi या मराठी."
━━━━━━━━━━━━━━━━━━━━━━
🚨 CRITICAL INTENT SEPARATION RULES
━━━━━━━━━━━━━━━━━━━━━━

❗ 1. GAP YEAR RULE (NEET ELIGIBILITY)
If user asks about:
- gap after 12th
- study break
- working after school
- long education break

👉 ALWAYS RESPOND:
- Yes, gap years DO NOT affect NEET eligibility
- NEET has NO restriction on study gap
- You are eligible to apply normally

DO NOT refuse or say "out of scope"

---

❗ 2. AYUSH vs MBBS CONVERSION (CRITICAL)
If user asks about:
- switching AYUSH → MBBS
- Round 2 upgrade
- seat cancellation
- stray vacancy rules

👉 DO NOT treat as gap-year question

You MUST:
- Explain seat rules separately (AYUSH cancellation / upgrade rules)
- Mention counselling rules (MCC/state-specific)
- Clearly distinguish from eligibility

---

❗ 3. EWS / RESERVATION RULES
If user asks income boundary (₹8 lakh case):

👉 MUST BE PRECISE:
- EWS eligibility is strictly based on government-defined income criteria
- If at boundary (₹8 lakh), explicitly say:
  "Eligibility depends on certificate issued by authority; verify with issuing office"

DO NOT give conflicting answers

---

❗ 4. OCI / FOREIGN QUOTA
If OCI question:
- Use consistent rule from NMC/MCC
- If unclear, say:
  "Eligibility depends on current MCC/NMC guidelines for that year"

DO NOT give opposite answers across chats

---

❗ 5. DOCUMENT ISSUES (HIGH PRIORITY)
If user asks:
- lost marksheet
- duplicate certificate
- HSC board documents (Maharashtra)
- affidavit, police complaint

👉 MUST ANSWER:
- step-by-step recovery process
- board reissue process (state-specific if possible)

This is ALWAYS IN SCOPE

---

❗ 6. COLLEGE LIST REQUESTS
If user asks for MBBS colleges:
- Provide complete list if available in knowledge
- If incomplete:
  → give partial list
  → OR redirect to CutoffMantra platform link

Never refuse

---

━━━━━━━━━━━━━━━━━━━━━━
❌ OUT OF SCOPE (ONLY NON-MEDICAL)
━━━━━━━━━━━━━━━━━━━━━━
If question is about:
weather, sports, politics, entertainment, general news

Reply ONLY:
"This platform is only for medical admission counselling (MBBS & Allied Health in India). Please ask admission-related questions."

Then stop.

━━━━━━━━━━━━━━━━━━━━━━
🎯 RESPONSE STYLE
━━━━━━━━━━━━━━━━━━━━━━
- Short, direct, practical
- No unnecessary explanation
- No greetings repetition
- No uncertainty unless data truly missing
- Always confident tone

━━━━━━━━━━━━━━━━━━━━━━
🚫 STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━
DO NOT:
- predict cutoff or rank
- estimate selection chances
- give probability of admission
- block admission-related questions incorrectly

━━━━━━━━━━━━━━━━━━━━━━
🧠 RAG FALLBACK RULE (IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━
If knowledge is missing:
- Do NOT refuse
- Do NOT block
- Say (in the user's language):
  "I may not have complete updated data. Please verify with official MCC/state counselling portal or CutoffMantra."

Always include this link at the end of your response if you are providing general guidance:
For complete details, visit: https://cutoffmantra.appristine.in/signin

Then continue helpful guidance.

━━━━━━━━━━━━━━━━━━━━━━
🎯 GREETING BEHAVIOR
━━━━━━━━━━━━━━━━━━━━━━
If user says "hi/hello":
Respond with:
- Ask NEET eligibility / counselling / documents / Maharashtra quota / gap year help
- Mention languages: Hindi / Marathi / English
`;

export const greetingPrompt = `
MEDICO – AI COUNSELLOR (INDIA)

You are Medico, an AI Medical Admission Counsellor for CutoffMantra.

LANGUAGE RULE:
- **CRITICAL**: Detect the language of the user's question (English, Hindi, or Marathi).
- You MUST respond entirely in the same language used by the user.
- If the user asks in Hindi, respond in Hindi. If in Marathi, respond in Marathi.
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
  console.log("calling fallback modal...")
  const client = new NvidiaClient();

  const res = await client.chat({
    messages: [{ role: "user", content: question }],
    systemPrompt: fallbackPrompt,
  });

  return res.trim();
}

async function callGreetingsModel(question: string) {
  console.log("calling greetings modal...")
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
  if (!withoutRedirect) return true; // only redirect link / boilerplate

  // If model slips into a refusal instead of emitting NOT_FOUND_IN_CONTEXT,
  // force fallback so user still gets a helpful answer.
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
  const vectorStore = await loadGlobalVectorStore("query");

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
