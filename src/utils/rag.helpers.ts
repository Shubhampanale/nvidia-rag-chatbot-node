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

type QueryIntent = "structured" | "descriptive" | "both";

export const detectQueryIntent = (question: string): QueryIntent => {
  const q = question.toLowerCase().trim();

  const structuredPatterns: RegExp[] = [
    /\bfee(?:s)?\b/i,
    /\bcost\b/i,
    /\bprice\b/i,
    /\bamount\b/i,
    /\brs\.?\b/i,
    /₹/i,
    /\bcut[- ]?off\b/i,
    /\bmarks?\b/i,
    /\bscore\b/i,
    /\branks?\b/i,
    /\bpercent\b/i,
    /%/i,
    /\bseat(?:s)?\b/i,
    /\bquota\b/i,
    /\bcategory\b/i,
    /\bobc\b/i,
    /\bsc\b/i,
    /\bst\b/i,
    /\bews\b/i,
    /\bpwd\b/i,
    /\bgeneral\b/i,
    /\bcollege\b/i,
    /\binstitute\b/i,
    /\bcity\b/i,
  ];

  const descriptivePatterns: RegExp[] = [
    /\bwhen\b/i,
    /\bwhat\b/i,
    /\bhow\b/i,
    /\bdate(?:s)?\b/i,
    /\bschedule\b/i,
    /\btimeline\b/i,
    /\bresult\b/i,
    /\bhow\b/i,
    /\bprocess\b/i,
    /\bprocedure\b/i,
    /\bsteps?\b/i,
    /\bregistration\b/i,
    /\bdocument(?:s)?\b/i,
    /\beligibilit(?:y|ies)\b/i,
    /\brules?\b/i,
    /\bcounsel(?:l)?ing\b/i,
    /\badmission\b/i,
    /\bround(?:s)?\b/i,
    /\bmop[- ]?up\b/i,
    /\bstray\b/i,
  ];

  const structuredScore = structuredPatterns.reduce((acc, re) => acc + (re.test(q) ? 1 : 0), 0);
  const descriptiveScore = descriptivePatterns.reduce((acc, re) => acc + (re.test(q) ? 1 : 0), 0);

  if (structuredScore > 0 && descriptiveScore > 0) return "both";
  if (structuredScore > 0) return "structured";
  if (descriptiveScore > 0) return "descriptive";

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
