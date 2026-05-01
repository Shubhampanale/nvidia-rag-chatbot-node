// services/intentDetector.ts

import { ParsedIntent, QueryIntent, SortBy, FeeFilter } from "../types/intent";
import {
  CITIES, STATES, COURSES,
  COLLEGE_TYPE_MAP,
  STRONG_STRUCTURED_KEYWORDS, WEAK_STRUCTURED_KEYWORDS,
  DESCRIPTIVE_PATTERNS, HOW_STRUCTURED_OVERRIDES,
  SEMANTIC_SIGNALS, FEE_PATTERNS, SORT_SIGNALS,
} from "../config/intentConfig";


// 🔥 NEW: Question signals (multi-language)
const QUESTION_PATTERNS: RegExp[] = [
  /\bwho\b/, /\bwhat\b/, /\bwhy\b/, /\bhow\b/, /\bwhen\b/, /\bwhich\b/,
  /\bkon\b/, /\bkaun\b/, /\bkaise\b/, /\bkyu\b/,
  /कोण/, /का/, /कसा|कशी|कसे/, /कधी/
];

// 🔥 NEW: action verbs (structured intent trigger)
const ACTION_PATTERNS = /\b(list|show|find|search|give me|display)\b/;


export class IntentDetector {

  detect(question: string): ParsedIntent {
    const raw = question;
    const q = question.toLowerCase().trim();

    const structuredHits = this.getStructuredHits(q);
    const descriptiveHits = this.getDescriptiveHits(q);
    const isSemantic = SEMANTIC_SIGNALS.some(re => re.test(q));

    // 🔥 NEW scoring system
    const scores = this.calculateScores(q, structuredHits, descriptiveHits, isSemantic);

    const intent = this.resolveIntent(scores);
    const confidence = this.resolveConfidence(scores);

    const courses = this.extractCourses(q);

    return {
      intent,
      confidence,
      filters: {
        city: this.extractCity(q),
        state: this.extractState(q),
        courses,
        collegeType: this.extractCollegeType(q),
        hasHostel: this.extractHostel(q),
        fee: this.extractFee(q),
        feeField: this.extractFeeField(q),
        sortBy: this.extractSortBy(q),
      },
      raw,
      debugHits: {
        structuredKeywords: structuredHits,
        descriptivePatterns: descriptiveHits,
      },
    };
  }

  // 🧠 NEW: scoring engine
  private calculateScores(
    q: string,
    structuredHits: string[],
    descriptiveHits: string[],
    isSemantic: boolean
  ) {
    let structured = 0;
    let descriptive = 0;

    const hasCourse = this.extractCourses(q).length > 0;
    const hasLocation = this.extractCity(q) || this.extractState(q);
    const isQuestion = QUESTION_PATTERNS.some(re => re.test(q));
    const hasAction = ACTION_PATTERNS.test(q);

    // 🔹 structured scoring
    if (hasAction) structured += 3;
    if (structuredHits.length > 0) structured += 2;
    if (hasCourse) structured += 1;
    if (hasLocation) structured += 1;

    // 🔹 descriptive scoring
    if (isQuestion) descriptive += 4; // 🔥 strongest signal
    if (descriptiveHits.length > 0) descriptive += 2;
    if (isSemantic) descriptive += 3;

    return { structured, descriptive };
  }

  private resolveIntent(scores: { structured: number; descriptive: number }): QueryIntent {
    const { structured, descriptive } = scores;

    if (descriptive >= structured + 2) return "descriptive";
    if (structured >= descriptive + 2) return "structured";
    return "descriptive";
  }

  private resolveConfidence(scores: { structured: number; descriptive: number }) {
    const diff = Math.abs(scores.structured - scores.descriptive);

    if (diff >= 3) return "high";
    if (diff === 2) return "medium";
    return "low";
  }

  // ───────────────────────── EXISTING METHODS (UNCHANGED) ─────────────────────────

  private getStructuredHits(q: string): string[] {
    const hits: string[] = [];
    for (const kw of STRONG_STRUCTURED_KEYWORDS) {
      if (q.includes(kw)) hits.push(kw);
    }

    const hasLocation = this.extractCity(q) !== null || this.extractState(q) !== null;
    const hasCourse = this.extractCourses(q).length > 0;

    if (hasLocation || hasCourse) {
      for (const kw of WEAK_STRUCTURED_KEYWORDS) {
        if (q.includes(kw)) hits.push(`weak:${kw}`);
      }
    }

    return hits;
  }

  private getDescriptiveHits(q: string): string[] {
    return DESCRIPTIVE_PATTERNS
      .filter(({ pattern }) => pattern.test(q))
      .map(({ label }) => label);
  }

  private extractCity(q: string): string | null {
    for (const city of CITIES) {
      if (new RegExp(`\\b${city}\\b`).test(q)) {
        return city.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      }
    }
    return null;
  }

  private extractState(q: string): string | null {
    for (const state of STATES) {
      if (new RegExp(`\\b${state}\\b`).test(q)) {
        return state.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      }
    }
    return null;
  }

  private extractCourses(q: string): string[] {
    const found = new Set<string>();
    for (const keywords of Object.values(COURSES)) {
      for (const kw of keywords) {
        if (new RegExp(`\\b${kw}\\b`).test(q)) {
          found.add(kw.toUpperCase());
        }
      }
    }
    return [...found];
  }

  private extractCollegeType(q: string): string | null {
    for (const [keyword, type] of Object.entries(COLLEGE_TYPE_MAP)) {
      if (new RegExp(`\\b${keyword}\\b`).test(q)) return type;
    }
    return null;
  }

  private extractHostel(q: string): boolean | null {
    if (/\bhostel\b/.test(q)) return true;
    if (/\bno hostel\b|without hostel/.test(q)) return false;
    return null;
  }

  private extractFee(q: string): FeeFilter | null {
    for (const { pattern, operator } of FEE_PATTERNS) {
      const match = pattern.exec(q);
      if (match) {
        let value = parseInt(match[1].replace(/,/g, ""), 10);
        if (/lakh|lac/.test(q)) value *= 100_000;
        else if (/thousand|\bk\b/.test(q)) value *= 1_000;
        return { operator, value };
      }
    }
    return null;
  }

  private extractFeeField(q: string): "tution_fee" | "total_fee" | "development_fee" | null {
    if (/development fee/.test(q)) return "development_fee";
    if (/total fee/.test(q)) return "total_fee";
    if (/tuition|tution/.test(q)) return "tution_fee";
    if (/fee|fees|cost/.test(q)) return "total_fee";
    return null;
  }

  private extractSortBy(q: string): SortBy | null {
    for (const [sortKey, keywords] of Object.entries(SORT_SIGNALS)) {
      if (keywords.some(kw => q.includes(kw))) {
        return sortKey as SortBy;
      }
    }
    return null;
  }
}