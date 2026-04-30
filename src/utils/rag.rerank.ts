import { RAGContext } from "../types";

export type VectorScoredDoc = [RAGContext, number];

type RerankEntry = {
  doc: RAGContext;
  vectorScore: number;
  tier: number;
  overlap: number;
};

const normalizeForLexical = (input: string): string => {
  return (input ?? "")
    .toLowerCase()
    .replace(/[“”‘’'".,?:;()\[\]{}<>|\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const tokenSet = (input: string): Set<string> => {
  const normalized = normalizeForLexical(input);
  const tokens = normalized.split(" ").filter((t) => t.length >= 2);
  return new Set(tokens);
};

const jaccardOverlap = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
};

export function rerankVectorResults(
  question: string,
  results: VectorScoredDoc[],
  opts?: { topK?: number }
): VectorScoredDoc[] {
  const topK = opts?.topK ?? 3;
  if (!Array.isArray(results) || results.length === 0) return [];

  const qNorm = normalizeForLexical(question);
  const qTokens = tokenSet(question);

  const entries: RerankEntry[] = results.map(([doc, vectorScore]) => {
    const content = String(doc?.pageContent ?? "");
    const dNorm = normalizeForLexical(content);
    const dTokens = tokenSet(content);
    const overlap = jaccardOverlap(qTokens, dTokens);
    const exactSubstring = qNorm.length >= 8 && dNorm.includes(qNorm);
    const looksLikeQA = /\b(उत्तर|answer)\b/i.test(content);
    const tier = exactSubstring ? 0 : overlap >= 0.45 || looksLikeQA ? 1 : 2;

    return { doc, vectorScore, tier, overlap };
  });

  entries.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 0) {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.vectorScore - b.vectorScore;
    }
    if (a.tier === 1) {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.vectorScore - b.vectorScore;
    }
    return a.vectorScore - b.vectorScore;
  });

  return entries.slice(0, topK).map((e) => [e.doc, e.vectorScore]);
}

