import { RAGContext } from "../types";
import { getChatClient, getNvidiaClient } from "./ai.client";
import { fallbackPrompt, greetingPrompt, SYSTEM_RAG_PROMPT } from "./prompts";

export const buildCleanContext = (docs: RAGContext[]): string => {
  return docs
    .map((doc, i) => {
      const source = (doc.metadata?.source as string | undefined) ?? "pdf";
      const page = doc.metadata?.pageNumber ?? 1;
      const tableTitle = doc.metadata?.table_title as string | undefined;
      const text = doc.pageContent
        .replace(/\s+/g, ' ')
        .trim();

      const limitedText = text.length > 800 ? text.slice(0, 800) + '...' : text;
      if (source === "excel") {
        return `[${i + 1}] (table: ${tableTitle ?? "unknown"}) ${limitedText}`;
      }
      return `[${i + 1}] (p.${page}) ${limitedText}`;
    })
    .filter((chunk) => chunk.length > 20)
    .join("\n");
};

export const extractSources = (docs: RAGContext[]): string[] => {
  return [
    ...new Set(
      docs
        .map((d) => d.metadata?.pageNumber)
        .filter(Boolean)
        .map((p) => `Page ${p}`)
    ),
  ];
};

export const callRagModel = async (question: string, context: string) => {
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
};

export const callFallbackModel = async (question: string) => {
  console.log("calling fallback modal...")
  const client = getChatClient();

  const res = await client.chat({
    messages: [{ role: "user", content: question }],
    systemPrompt: fallbackPrompt,
  });

  return res.trim();
};

export const callGreetingsModel = async (question: string) => {
  console.log("calling greetings modal...")
  const client = getNvidiaClient();

  const res = await client.chat({
    messages: [{ role: "user", content: question }],
    systemPrompt: greetingPrompt,
  });

  return res.trim();
};

export const isLowIntentQuery = (query: string): boolean => {
  const q = query.toLowerCase().trim();

  const greetings = [
    "hi", "hello", "hey", "good morning", "good evening"
  ];

  return greetings.includes(q) || q.length < 4;
};

export const normalizeCoursesInQuestion = (question: string): string => {
  const courses = ["mbbs", "bams", "bhms", "bds", "bpt"];
  let normalized = question;
  courses.forEach((course) => {
    const re = new RegExp(`\\b${course}\\b`, "gi");
    normalized = normalized.replace(re, course.toUpperCase());
  });
  return normalized;
};

type QueryIntent = "structured" | "descriptive" | "both";
const TABLE_KEYWORDS = [
  // College identity
  "college code", "college type", "government", "private", "deemed",

  // Courses
  "mbbs", "bams", "bhms", "bpt", "bds", "course",

  // Fee structure
  "development fee", "tuition fee", "total fee",
  "fees", "fee", "cost", "charges", "how much",

  // Cutoff
  "cutoff", "cut off", "first admitted", "last admitted",
  "first mark", "last mark", "merit", "minimum marks",
  "minimum score", "last rank", "admission rank",
  "eligible", "qualify", "percentile",

  // General listing triggers
  "list", "show", "give me", "colleges for",
  "which college", "available colleges"
];
export const detectQueryIntent = (question: string): QueryIntent => {
  const q = question.toLowerCase().trim();

  const isStructured = TABLE_KEYWORDS.some(keyword =>
    q.includes(keyword)
  );
  const descriptivePatterns: RegExp[] = [
    /\bwhen\b/,
    /\bwhat\b/,
    /\bhow\b/,
    /\bwhy\b/,
    /\bprocess\b/,
    /\bprocedure\b/,
    /\bsteps?\b/,
    /\bregistration\b/,
    /\bdocument(?:s)?\b/,
    /\beligibilit(?:y|ies)\b/,
    /\brules?\b/,
    /\bcounsel(?:l)?ing\b/,
    /\badmission\b/,
    /\bround(?:s)?\b/,
    /\bmop[- ]?up\b/,
    /\bstray\b/,
    /\bschedule\b/,
    /\btimeline\b/,
    /\bresult\b/
  ];

  const isDescriptive = descriptivePatterns.some(re => re.test(q));

  if (isStructured && isDescriptive) return "both";
  if (isStructured) return "structured";
  if (isDescriptive) return "descriptive";

  return "descriptive";
};

export const NOT_FOUND_TOKEN = "NOT_FOUND_IN_CONTEXT";
export const SIGNIN_URL = "https://cutoffmantra.appristine.in/signin";

export const stripRedirectLines = (text: string): string => {
  return text
    .split("\n")
    .filter((line) => !line.includes(SIGNIN_URL))
    .filter((line) => !/for complete details/i.test(line))
    .join("\n")
    .trim();
};

export const looksLikeRefusal = (text: string): boolean => {
  return [
    /(?:^|\b)(?:sorry|apolog(?:y|ise|ize)?|cannot|can't|unable|don'?t know|no idea)(?:\b|$)/i,
    /(?:^|\b)(?:refuse|won't|can not help)(?:\b|$)/i,
    /(मला माफ करा|क्षम(?:ा)? करा|माफ करा|माफ़(?:\s)?कर(?:े|ना)|क्षमा करें)/i,
    /(मी .*?(?:स्पष्टीकरण|माहिती).*(?:देऊ शकत नाही|देऊ शकत नाहीये)|मी याबद्दल.*?(?:काही )?(?:सांगू|बोलू|समजावू) शकत नाही)/i,
    /(मैं .*?(?:नहीं बता सकता|नहीं बता सकती|समझा नहीं सकता|मदद नहीं कर सकता))/i,
  ].some((re) => re.test(text));
};

export const shouldFallbackFromRagAnswer = (answer: string): boolean => {
  const trimmed = (answer ?? "").trim();
  if (!trimmed) return true;
  if (trimmed === NOT_FOUND_TOKEN) return true;
  if (trimmed.includes(NOT_FOUND_TOKEN)) return true;

  const withoutRedirect = stripRedirectLines(trimmed);
  if (!withoutRedirect) return true;
  if (looksLikeRefusal(withoutRedirect) && withoutRedirect.length < 300) return true;

  return false;
};
