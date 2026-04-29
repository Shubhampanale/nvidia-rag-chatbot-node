import { RAGContext } from "../types";
import { config } from "../config/env";
import { NvidiaClient } from "../utils/nvidia.client";
import { loadGlobalVectorStore } from "./ingest.service";

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────

const SYSTEM_RAG_PROMPT = `You are a document assistant for MEDICO — an AI Medical Admission Counsellor for CutoffMantra (India).

LANGUAGE RULE:
- Detect the user's language automatically (English / Hindi / Marathi)
- Always reply in the same language the user wrote in
- Never switch languages mid-response

ANSWERING RULES:
- Answer ONLY from the provided context
- Keep answers clear, short, and well-formatted
- Use bullet points when listing steps or documents
- If the answer is partially in context, give what you know and add:
  "For complete details, visit: https://cutoffmantra.appristine.in/signin"

WHEN ANSWER IS NOT IN CONTEXT:
- Do NOT say "platform restriction" or refuse
- Instead say:
  EN: "I don't have full details on this right now. For accurate guidance, please visit: https://cutoffmantra.appristine.in/signin or ask our counsellor."
  HI: "मुझे अभी इसकी पूरी जानकारी नहीं है। सही मार्गदर्शन के लिए यहाँ जाएं: https://cutoffmantra.appristine.in/signin"
  MR: "मला आत्ता याची पूर्ण माहिती नाही. अचूक मार्गदर्शनासाठी येथे भेट द्या: https://cutoffmantra.appristine.in/signin"

IF CONTEXT HAS CONFLICTING INFORMATION:
- Do not pick one answer and guess
- Say: "There are different rules depending on your category/state. Please confirm with the official counselling authority or visit: https://cutoffmantra.appristine.in/signin"

NEVER:
- Give a flat refusal for any admission-related topic
- Say "I cannot answer this" without providing a redirect link
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
You MUST respond in the user’s language:
- English / Hindi / Marathi

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
- Say:
  "I may not have complete updated data. Please verify with official MCC/state counselling portal or CutoffMantra."

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
  const docs = topResults.map(([doc]) => doc);
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