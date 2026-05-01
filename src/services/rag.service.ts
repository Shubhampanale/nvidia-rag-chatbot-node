import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { config } from "../config/env";
import {
  buildCleanContext,
  callFallbackModel,
  callGreetingsModel,
  callRagModel,
  extractSources,
  isLowIntentQuery,
  normalizeCoursesInQuestion,
  shouldFallbackFromRagAnswer,
} from "../utils/rag.helpers";
import { rerankVectorResults } from "../utils/rag.rerank";
import { loadGlobalVectorStore } from "./ingest.service";
import { ParsedIntent } from "../types/intent";
import { CourseCutOff } from "../models/college.cutoff.model";
import { CollegeFeeStructure } from "../models/college.fees.model";
import { College } from "../models/college.model";
import { IntentDetector } from "./intentDetector.service";
import { MongoQueryBuilder } from "./mongoQueryBuilder.service";

// ─── Singletons ───────────────────────────────────────────────────────────────
let cachedVectorStore: FaissStore | null = null;
const intentDetector = new IntentDetector();
const queryBuilder = new MongoQueryBuilder();

// ─── Types ────────────────────────────────────────────────────────────────────
export type RAGResponse = {
  answer: string;
  sources: string[];
  chunks: string;
  mongoResults?: unknown[];
  intent?: string;
};

// ─── Main Entry ───────────────────────────────────────────────────────────────
export const generateRAGResponse = async (
  question: string,
  documentId?: string
): Promise<RAGResponse> => {
  const updatedQuestion = await normalizeCoursesInQuestion(question);
  console.log("[RAG] normalized question:", updatedQuestion);

  if (isLowIntentQuery(updatedQuestion)) {
    const answer = await callGreetingsModel(updatedQuestion);
    return { answer, sources: [], chunks: "" };
  }

  const parsed = intentDetector.detect(updatedQuestion);
  console.log("[RAG] intent:", parsed.intent, "| confidence:", parsed.confidence);
  console.log("[RAG] filters:", JSON.stringify(parsed.filters, null, 2));

  switch (parsed.intent) {
    case "structured":
      return handleStructured(updatedQuestion, parsed);
    case "descriptive":
      return handleDescriptive(updatedQuestion, documentId);
    case "both":
      return handleBoth(updatedQuestion, parsed, documentId);
  }
};

// ─── Handler: Structured → Direct Answer (No LLM) ────────────────────────────
const handleStructured = async (
  question: string,
  parsed: ParsedIntent
): Promise<RAGResponse> => {
  console.log("[RAG] routing -> MongoDB + direct answer builder");
  const mongoResults = await runMongoQuery(parsed);

  if (!mongoResults || mongoResults.length === 0) {
    console.log("[RAG] MongoDB returned 0 results -> fallback model");
    const answer = await callFallbackModel(question);
    return {
      answer,
      sources: ["General eligibility rules"],
      chunks: "",
      mongoResults: [],
      intent: parsed.intent,
    };
  }

  const answer = buildDirectAnswer(mongoResults, parsed);
  return {
    answer,
    sources: ["College Database"],
    chunks: "",
    mongoResults,
    intent: parsed.intent,
  };
};

// ─── Handler: Descriptive → FAISS + LLM ──────────────────────────────────────
const handleDescriptive = async (
  question: string,
  documentId?: string
): Promise<RAGResponse> => {
  console.log("[RAG] routing -> FAISS vector search + LLM");

  if (!cachedVectorStore) {
    console.log("[RAG] loading PDF vector store into memory...");
    cachedVectorStore = await loadGlobalVectorStore("query");
  }

  const k = Math.max(8, config.topKResults);
  let resultsWithScores = await cachedVectorStore.similaritySearchWithScore(question, k);

  if (documentId) {
    resultsWithScores = resultsWithScores
      .filter(([doc]) => doc.metadata?.documentId === documentId)
      .slice(0, 3);
  }

  resultsWithScores.sort((a, b) => a[1] - b[1]);

  const topResults = rerankVectorResults(question, resultsWithScores as any, { topK: k });
  const docs = topResults.map(([doc]) => doc);
  const bestScore = topResults[0]?.[1];

  if (!bestScore || bestScore > config.similarityThreshold) {
    console.log(`[RAG] score too low: ${bestScore}`);
    const answer = await callFallbackModel(question);
    return { answer, sources: ["General eligibility rules"], chunks: "", intent: "descriptive" };
  }

  const context = buildCleanContext(docs);
  const sources = extractSources(docs);
  const ragAnswer = await callRagModel(question, context);

  if (shouldFallbackFromRagAnswer(ragAnswer)) {
    const answer = await callFallbackModel(question);
    return { answer, sources: ["General eligibility rules"], chunks: "", intent: "descriptive" };
  }

  return { answer: ragAnswer, sources, chunks: context, intent: "descriptive" };
};

// ─── Handler: Both → MongoDB direct + FAISS/LLM ──────────────────────────────
const handleBoth = async (
  question: string,
  parsed: ParsedIntent,
  documentId?: string
): Promise<RAGResponse> => {
  console.log("[RAG] routing -> Both (MongoDB direct + FAISS/LLM)");

  const [mongoSettled, faissSettled] = await Promise.allSettled([
    runMongoQuery(parsed),
    handleDescriptive(question, documentId),
  ]);

  const mongoData =
    mongoSettled.status === "fulfilled" ? mongoSettled.value : [];
  const faissData =
    faissSettled.status === "fulfilled"
      ? faissSettled.value
      : { answer: "", sources: [], chunks: "" };

  const structuredSection =
    mongoData.length > 0 ? buildDirectAnswer(mongoData, parsed) : "";
  const descriptiveSection = faissData.answer ?? "";
  const answer = mergeAnswers(structuredSection, descriptiveSection);

  const sources = [
    ...(mongoData.length > 0 ? ["College Database"] : []),
    ...(faissData.sources ?? []),
  ];

  return {
    answer,
    sources: [...new Set(sources)],
    chunks: faissData.chunks ?? "",
    mongoResults: mongoData,
    intent: "both",
  };
};

// ─── Core Answer Builder ──────────────────────────────────────────────────────
const buildDirectAnswer = (results: unknown[], parsed: ParsedIntent): string => {
  const colleges = results as any[];
  const { filters } = parsed;

  if (colleges.length === 0) {
    return buildNoResultSentence(filters);
  }

  const hasFee = colleges.some(c => c.feeInfo != null);
  const hasCutoff = colleges.some(c => c.cutoffInfo != null);

  if (hasCutoff) return buildCutoffAnswer(colleges, filters);
  if (hasFee) return buildFeeAnswer(colleges, filters);
  return buildCollegeListAnswer(colleges, filters);
};

// ─── College List Answer ──────────────────────────────────────────────────────
const buildCollegeListAnswer = (colleges: any[], filters: ParsedIntent["filters"]): string => {
  const ctx = buildContextPhrase(filters);
  const total = colleges.length;

  const opening = `
    <p>
      ${total === 1
      ? `Here is 1 college found${ctx}:`
      : `Here are ${total} colleges found${ctx}:`}
    </p>
  `;

  const tableHeader = `
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>#</th>
          <th>College Name</th>
          <th>Location</th>
          <th>Type</th>
          <th>Code</th>
          <th>UG Courses</th>
          <th>PG Courses</th>
          <th>Hostel</th>
          <th>Established</th>
        </tr>
      </thead>
      <tbody>
  `;

  const rows = colleges.map((c, i) => {
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${c.college_name ?? "Unknown College"}</td>
        <td>${joinParts([c.city_name, c.state_name])}</td>
        <td>${c.college_type ?? "N/A"}</td>
        <td>${c.college_code ?? "N/A"}</td>
        <td>${c.ug_courses?.length ? c.ug_courses.join(", ") : "-"}</td>
        <td>${c.pg_courses?.length ? c.pg_courses.join(", ") : "-"}</td>
        <td>${c.is_hostel ? "Available" : "Not Available"}</td>
        <td>${c.established_year ?? "-"}</td>
      </tr>
    `;
  }).join("");

  const tableFooter = `
      </tbody>
    </table>
  `;

  const closing = `<p>${buildClosingSentence(filters, "college")}</p>`;

  return [opening, tableHeader, rows, tableFooter, closing].join("");
};

// ─── Fee Answer ───────────────────────────────────────────────────────────────
const buildFeeAnswer = (colleges: any[], filters: ParsedIntent["filters"]): string => {
  const ctx = buildContextPhrase(filters);
  const total = colleges.length;

  const feeField = filters.feeField ?? "total_fee";
  const feeValues = colleges
    .filter(c => c.feeInfo?.[feeField] > 0)
    .map(c => c.feeInfo[feeField] as number);

  const minFee = feeValues.length ? Math.min(...feeValues) : null;
  const maxFee = feeValues.length ? Math.max(...feeValues) : null;

  const feeRange = minFee && maxFee
    ? minFee === maxFee
      ? ` Fees start at ${formatINR(minFee)}.`
      : ` Fees range from ${formatINR(minFee)} to ${formatINR(maxFee)}.`
    : "";

  const opening = `<p>
    ${total === 1 ? "Here is 1 college" : `Here are ${total} colleges`}
    ${ctx} with fee details.${feeRange}
  </p>`;

  const tableHeader = `
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>#</th>
          <th>College Name</th>
          <th>Location</th>
          <th>Type</th>
          <th>Tuition Fee</th>
          <th>Development Fee</th>
          <th>Total Fee</th>
          <th>Academic Year</th>
        </tr>
      </thead>
      <tbody>
  `;

  const rows = colleges.map((c, i) => {
    const f = c.feeInfo || {};

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${c.college_name ?? "Unknown College"}</td>
        <td>${joinParts([c.city_name, c.state_name])}</td>
        <td>${c.college_type ?? "N/A"}</td>
        <td>${f.tution_fee ? formatINR(f.tution_fee) : "-"}</td>
        <td>${f.development_fee ? formatINR(f.development_fee) : "-"}</td>
        <td>${f.total_fee ? formatINR(f.total_fee) : "-"}</td>
        <td>${f.academic_year ?? "-"}</td>
      </tr>
    `;
  }).join("");

  const tableFooter = `
      </tbody>
    </table>
  `;

  const closing = `<p>${buildClosingSentence(filters, "fee")}</p>`;

  return [opening, tableHeader, rows, tableFooter, closing].join("");
};

// ─── Cutoff Answer ────────────────────────────────────────────────────────────
const buildCutoffAnswer = (colleges: any[], filters: ParsedIntent["filters"]): string => {
  const ctx = buildContextPhrase(filters);
  const total = colleges.length;
  const cutoff = filters.cutoff;
  const fieldName = cutoff?.fieldName ?? "open_al";

  const categoryLabel = cutoff?.category?.toUpperCase() ?? "OPEN";
  const genderLabel = cutoff?.gender === "f"
    ? "Female" : cutoff?.gender === "m"
      ? "Male" : null;

  const typeLabel = {
    af: "first admitted",
    al: "last admitted",
    mf: "merit first",
    ml: "merit last"
  }[cutoff?.type ?? "al"];

  const cutoffDesc = [
    categoryLabel,
    genderLabel,
    typeLabel,
    "cutoff",
  ].filter(Boolean).join(" ");

  const firstCutoffValue = colleges[0]?.cutoffInfo?.[fieldName];

  const opening = `
    <p>
      ${total === 1
      ? `Here is 1 college${ctx} with ${cutoffDesc} data.`
      : `Here are ${total} colleges${ctx} sorted by ${cutoffDesc}.
           ${firstCutoffValue ? ` Best cutoff starts at ${firstCutoffValue} marks.` : ""}`}
    </p>
  `;

  const tableHeader = `
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>#</th>
          <th>College Name</th>
          <th>Location</th>
          <th>Type</th>
          <th>Code</th>
          <th>Course</th>
          <th>${cutoffDesc.charAt(0).toUpperCase() + cutoffDesc.slice(1)}</th>
          <th>Academic Year</th>
        </tr>
      </thead>
      <tbody>
  `;

  const rows = colleges.map((c, i) => {
    const co = c.cutoffInfo || {};
    const value = co?.[fieldName];

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${c.college_name ?? "Unknown College"}</td>
        <td>${joinParts([c.city_name, c.state_name])}</td>
        <td>${c.college_type ?? "N/A"}</td>
        <td>${c.college_code ?? "N/A"}</td>
        <td>${co.course_name ?? "-"}</td>
        <td>${value && value !== 0 ? value : "-"}</td>
        <td>${co.academic_year ?? "-"}</td>
      </tr>
    `;
  }).join("");

  const tableFooter = `
      </tbody>
    </table>
  `;

  const closing = `<p>${buildClosingSentence(filters, "cutoff")}</p>`;

  return [opening, tableHeader, rows, tableFooter, closing].join("");
};
// ─── Shared Helpers ───────────────────────────────────────────────────────────

// Builds "for MBBS in Mumbai (2024-2025)" style phrase
const buildContextPhrase = (filters: ParsedIntent["filters"]): string => {
  const parts: string[] = [];

  if (filters.courses.length) {
    parts.push(`for ${filters.courses.join(" / ")}`);
  }

  if (filters.collegeType) {
    parts.push(`${filters.collegeType} colleges`);
  }

  if (filters.city) {
    parts.push(`in ${filters.city}`);
  } else if (filters.state) {
    parts.push(`in ${filters.state}`);
  }

  if (filters.academicYear) {
    parts.push(`for ${filters.academicYear}`);
  }

  return parts.length ? ` ${parts.join(" ")}` : "";
};

// Natural closing tip sentence
const buildClosingSentence = (
  filters: ParsedIntent["filters"],
  type: "college" | "fee" | "cutoff"
): string => {
  const tips: string[] = [];

  // Smart suggestion: missing academic year
  if (!filters.academicYear) {
    tips.push("Tip: Add an academic year (e.g., 2024–25) to get more accurate results.");
  }

  // Contextual next-step suggestions
  if (type === "college") {
    tips.push("You can explore fees or cutoff trends for any of these colleges.");
  }

  if (type === "fee") {
    tips.push("Want help comparing fees or checking cutoffs? Just ask.");
  }

  if (type === "cutoff") {
    tips.push("You can also check fee structure or compare colleges based on your rank.");
  }

  return tips.length
    ? `<p style="margin-top:10px; color:#555;">${tips.join(" ")}</p>`
    : "";
};

const buildNoResultSentence = (filters: ParsedIntent["filters"]): string => {
  const ctx = buildContextPhrase(filters);

  return `
    <p>
      😕 No colleges found${ctx}.
    </p>
    <p>
      Try broadening your search:
      <ul>
        <li>Remove city filter</li>
        <li>Try a different course</li>
        <li>Increase your cutoff or fee range</li>
      </ul>
    </p>
  `;
};

// "Mumbai, Maharashtra" — skips nulls
const joinParts = (parts: (string | null | undefined)[]): string =>
  parts.filter(Boolean).join(", ") || "N/A";

// ₹1,20,000 format
const formatINR = (amount: number): string =>
  "₹" + amount.toLocaleString("en-IN");

// ─── Merge Both Intent Answers ────────────────────────────────────────────────
const mergeAnswers = (structured: string, descriptive: string): string => {
  const parts: string[] = [];
  if (structured) parts.push(structured);
  if (descriptive) parts.push(`\n---\nAdditional Information:\n\n${descriptive}`);
  return parts.filter(Boolean).join("\n");
};

// ─── MongoDB Query Runner ─────────────────────────────────────────────────────
const runMongoQuery = async (parsed: ParsedIntent): Promise<unknown[]> => {
  const query = queryBuilder.build(parsed);

  console.log("[Mongo] collegeFilter:", JSON.stringify(query.collegeFilter));
  console.log("[Mongo] feeFilter:", JSON.stringify(query.feeFilter));
  console.log("[Mongo] cutoffFilter:", JSON.stringify(query.cutoffFilter));

  const needsFee = query.feeFilter !== null;
  const needsCutoff = query.cutoffFilter !== null;

  try {
    // Simple college listing
    if (!needsFee && !needsCutoff) {
      const cursor = College.find(query.collegeFilter).limit(query.limit);
      if (query.sort) cursor.sort(query.sort as any);
      return await cursor.lean();
    }

    // Fee-based query
    if (needsFee && query.feeFilter) {
      const feeRecords = await CollegeFeeStructure
        .find(query.feeFilter)
        .select("college_id college_name college_code tution_fee total_fee development_fee academic_year")
        .lean();

      const collegeIds = feeRecords.map((f: any) => f.college_id.toString());
      const colleges = await College.find({
        ...query.collegeFilter,
        _id: { $in: collegeIds },
      }).limit(query.limit).lean();

      return colleges.map((college: any) => ({
        ...college,
        feeInfo: feeRecords.find(
          (f: any) => f.college_id.toString() === college._id.toString()
        ) ?? null,
      }));
    }

    // Cutoff-based query
    if (needsCutoff && query.cutoffFilter) {
      const fieldName = parsed.filters.cutoff?.fieldName ?? "open_al";
      const cutoffRecords = await CourseCutOff
        .find(query.cutoffFilter)
        .select(`college_id college_name college_code course_name academic_year ${fieldName}`)
        .sort(query.sort as any ?? { [fieldName]: 1 })
        .limit(query.limit)
        .lean();

      const collegeIds = cutoffRecords.map((c: any) => c.college_id);
      const colleges = await College.find({
        ...query.collegeFilter,
        college_id: { $in: collegeIds },
      }).lean();

      return colleges.map((college: any) => ({
        ...college,
        cutoffInfo: cutoffRecords.find(
          (c: any) => c.college_id === college.college_id
        ) ?? null,
      }));
    }

  } catch (err) {
    console.error("[Mongo] query failed:", (err as Error)?.message ?? err);
  }

  return [];
};