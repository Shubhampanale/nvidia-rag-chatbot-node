import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { config } from "../config/env";
import { buildCleanContext, callFallbackModel, callGreetingsModel, callRagModel, detectQueryIntent, extractSources, isLowIntentQuery, normalizeCoursesInQuestion, shouldFallbackFromRagAnswer } from "../utils/rag.helpers";
import { rerankVectorResults } from "../utils/rag.rerank";
import { retrieveExcelTableRows } from "./excelTableRetrieval.service";
import { loadGlobalVectorStore } from "./ingest.service";

let cachedVectorStore: FaissStore | null = null;

export const generateRAGResponse = async (
  question: string,
  documentId?: string
): Promise<{ answer: string; sources: string[]; chunks: string }> => {

  const updatedQuestion = await normalizeCoursesInQuestion(question);
  console.log("question::", updatedQuestion)
  if (isLowIntentQuery(updatedQuestion)) {
    const answer = await callGreetingsModel(updatedQuestion);

    return {
      answer,
      sources: [],
      chunks: "",
    };
  }

  // 1. Load vector store
  const intent = detectQueryIntent(updatedQuestion);
  console.log("intent::", intent)
  const usePdf = intent === "descriptive" || intent === "both";
  const useExcel = intent === "structured" || intent === "both";

  let pdfStore: FaissStore | null = null;

  if (usePdf) {
    if (!cachedVectorStore) {
      console.log("Loading PDF vector store into memory...");
      cachedVectorStore = await loadGlobalVectorStore("query");
    }
    pdfStore = cachedVectorStore;
  }

  const k = Math.max(8, config.topKResults);
  console.log("k::", k)

  let resultsWithScores: Array<[any, number]> = [];
  if (pdfStore) {
    const pdfResults = await pdfStore.similaritySearchWithScore(updatedQuestion, k);
    console.log("pdfResults::", pdfResults)
    resultsWithScores.push(...pdfResults);
  }
  if (useExcel) {
    try {
      const tableResult = await retrieveExcelTableRows(updatedQuestion, { topKRows: 8 });
      if (tableResult) {
        for (const r of tableResult.rows) {
          const score =
            typeof r.score === "number" && Number.isFinite(r.score) ? r.score : Number.POSITIVE_INFINITY;
          resultsWithScores.push([
            {
              pageContent: r.pageContent ?? JSON.stringify(r.row),
              metadata: {
                source: "excel",
                type: "row",
                table_id: r.table_id,
                table_title: r.table_title,
                sheet_name: r.sheet_name,
                row_index: r.row_index,
                raw: r.row,
              },
            },
            score,
          ]);
        }
      }
    } catch (e) {
      console.log("[RAG] Excel retrieval failed:", (e as Error)?.message ?? e);
    }
  }

  resultsWithScores.sort((a, b) => a[1] - b[1]);

  if (documentId) {
    resultsWithScores = resultsWithScores
      .filter(([doc]) => doc.metadata?.documentId === documentId)
      .slice(0, 3);
  }

  const topResults = rerankVectorResults(updatedQuestion, resultsWithScores as any, { topK: k });
  console.log("topResults::", topResults)
  const docs = topResults.map(([doc]) => doc);
  const bestScore = topResults[0]?.[1];

  if (!bestScore || bestScore > config.similarityThreshold) {
    console.log(`Retrieval score too low: ${bestScore} > ${config.similarityThreshold}`);
    const answer = await callFallbackModel(updatedQuestion);

    return {
      answer,
      sources: ['General eligibility rules'],
      chunks: "",
    };
  }

  console.log(`Retrieved ${docs.length} chunks, best score: ${bestScore}`);
  const context = buildCleanContext(docs);
  console.log("context::", context)
  const sources = extractSources(docs);
  const ragAnswer = await callRagModel(updatedQuestion, context);
  console.log("ragAnswer::", JSON.stringify(ragAnswer))

  if (shouldFallbackFromRagAnswer(ragAnswer)) {
    const answer = await callFallbackModel(updatedQuestion);

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
};
