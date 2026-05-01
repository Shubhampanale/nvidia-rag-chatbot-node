// services/intentDetector.ts

import { ParsedIntent, QueryIntent, SortBy, FeeFilter, CutoffFilter, CourseType, CutoffSuffix } from "../types/intent";
import {
  CITIES, STATES, COURSES, COURSE_TYPE_MAP,
  COLLEGE_TYPE_MAP, CATEGORY_MAP, GENDER_MAP, CUTOFF_TYPE_MAP,
  STRONG_STRUCTURED_KEYWORDS, WEAK_STRUCTURED_KEYWORDS,
  DESCRIPTIVE_PATTERNS, HOW_STRUCTURED_OVERRIDES,
  SEMANTIC_SIGNALS, FEE_PATTERNS, SORT_SIGNALS,
  ACADEMIC_YEAR_PATTERN,
} from "../config/intentConfig";

export class IntentDetector {

  detect(question: string): ParsedIntent {
    const raw = question;
    const q   = question.toLowerCase().trim();

    const structuredHits  = this.getStructuredHits(q);
    const descriptiveHits = this.getDescriptiveHits(q);
    const isSemantic      = SEMANTIC_SIGNALS.some(re => re.test(q));

    const intent     = this.resolveIntent(q, structuredHits, descriptiveHits, isSemantic);
    const confidence = this.resolveConfidence(structuredHits, descriptiveHits, isSemantic);

    const courses    = this.extractCourses(q);
    const courseType = this.extractCourseType(q, courses);

    return {
      intent,
      confidence,
      filters: {
        city:         this.extractCity(q),
        state:        this.extractState(q),
        courses,
        courseType,
        collegeType:  this.extractCollegeType(q),
        hasHostel:    this.extractHostel(q),
        academicYear: this.extractAcademicYear(q),
        fee:          this.extractFee(q),
        feeField:     this.extractFeeField(q),
        cutoff:       this.extractCutoff(q),
        sortBy:       this.extractSortBy(q),
      },
      raw,
      debugHits: {
        structuredKeywords:  structuredHits,
        descriptivePatterns: descriptiveHits,
      },
    };
  }

  // ─── Intent Resolution ────────────────────────────────────────────────────

  private resolveIntent(
    q: string,
    structuredHits: string[],
    descriptiveHits: string[],
    isSemantic: boolean
  ): QueryIntent {
    if (isSemantic) return "descriptive";

    const howOverridden    = HOW_STRUCTURED_OVERRIDES.some(re => re.test(q));
    const cleanDescriptive = howOverridden
      ? descriptiveHits.filter(h => !["when", "what_is", "what_are"].includes(h))
      : descriptiveHits;

    const hasStructured  = structuredHits.length > 0;
    const hasDescriptive = cleanDescriptive.length > 0;

    if (hasStructured && hasDescriptive) return "both";
    if (hasStructured)                   return "structured";
    if (hasDescriptive)                  return "descriptive";

    const hasLocationOrCourse =
      this.extractCity(q) !== null || this.extractCourses(q).length > 0;

    return hasLocationOrCourse ? "structured" : "descriptive";
  }

  private resolveConfidence(
    structuredHits: string[],
    descriptiveHits: string[],
    isSemantic: boolean
  ): "high" | "medium" | "low" {
    if (isSemantic)                 return "high";
    if (structuredHits.length >= 2) return "high";
    if (structuredHits.length === 1 || descriptiveHits.length >= 2) return "medium";
    return "low";
  }

  // ─── Hit Collectors ───────────────────────────────────────────────────────

  private getStructuredHits(q: string): string[] {
    const hits: string[] = [];
    for (const kw of STRONG_STRUCTURED_KEYWORDS) {
      if (q.includes(kw)) hits.push(kw);
    }
    const hasLocation = this.extractCity(q) !== null || this.extractState(q) !== null;
    const hasCourse   = this.extractCourses(q).length > 0;
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

  // ─── Extractors ───────────────────────────────────────────────────────────

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

  private extractCourseType(q: string, courses: string[]): CourseType | null {
    if (q.includes(" pg ") || q.includes("postgraduate") || q.includes("post graduate")) return "pg";
    if (q.includes(" ug ") || q.includes("undergraduate") || q.includes("under graduate")) return "ug";
    // Infer from detected courses
    for (const course of courses) {
      const type = COURSE_TYPE_MAP[course.toLowerCase()];
      if (type) return type;
    }
    return null;
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

  private extractAcademicYear(q: string): string | null {
    const match = ACADEMIC_YEAR_PATTERN.exec(q);
    if (!match) return null;
    const year1 = match[1];
    const year2 = match[2];
    return year2 ? `${year1}-${year2}` : year1;
  }

  private extractFee(q: string): FeeFilter | null {
    for (const { pattern, operator } of FEE_PATTERNS) {
      const match = pattern.exec(q);
      if (match) {
        let value = parseInt(match[1].replace(/,/g, ""), 10);
        if (/lakh|lac/.test(q))            value *= 100_000;
        else if (/thousand|\bk\b/.test(q)) value *= 1_000;
        return { operator, value };
      }
    }
    return null;
  }

  private extractFeeField(q: string): "tution_fee" | "total_fee" | "development_fee" | null {
    if (/development fee/.test(q)) return "development_fee";
    if (/total fee/.test(q))       return "total_fee";
    if (/tuition|tution/.test(q))  return "tution_fee"; // note: your schema has typo "tution_fee"
    if (/fee|fees|cost/.test(q))   return "total_fee";  // default to total_fee
    return null;
  }

  // Builds cutoff field name like "open_al", "obc_mf", "sc_af"
  private extractCutoff(q: string): CutoffFilter | null {
    let category: string | null = null;
    let gender:   string | null = null;
    let type:     CutoffSuffix  = "al"; // default: last admitted

    // Detect category
    for (const [keyword, code] of Object.entries(CATEGORY_MAP)) {
      if (new RegExp(`\\b${keyword}\\b`).test(q)) {
        category = code;
        break;
      }
    }

    // Detect gender
    for (const [keyword, code] of Object.entries(GENDER_MAP)) {
      if (new RegExp(`\\b${keyword}\\b`).test(q)) {
        gender = code;
        break;
      }
    }

    // Detect cutoff type (af/al/mf/ml)
    for (const [keyword, code] of Object.entries(CUTOFF_TYPE_MAP)) {
      if (q.includes(keyword)) {
        type = code as CutoffSuffix;
        break;
      }
    }

    if (!category) return null;

    // Build field name: {category}_{gender || ""}{type}
    // e.g. open + female + al → open_fal  OR  open + al → open_al
    const genderPrefix = gender ?? "";
    const fieldName    = `${category}_${genderPrefix}${type}`;

    return { category, gender, type, fieldName };
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