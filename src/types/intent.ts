// types/intent.ts

export type QueryIntent = "structured" | "descriptive" | "both";
export type SortBy = "total_fee" | "cutoff" | "college_name";
export type CourseType = "ug" | "pg";
export type CutoffSuffix = "af" | "al" | "mf" | "ml";

export type FeeFilter = {
  operator: "$lt" | "$gt" | "$lte" | "$gte";
  value: number;
};

// Maps directly to your cutoff schema field names
// e.g. "open_al", "obc_mf", "sc_af"
export type CutoffFilter = {
  category: string;       // "open", "obc", "sc" etc
  gender: string | null;  // "m" | "f" | null
  type: CutoffSuffix;     // "af" | "al" | "mf" | "ml"
  fieldName: string;      // e.g. "open_al", "obc_mf"
};

export type IntentFilters = {
  // College collection filters
  city: string | null;           // → city_name
  state: string | null;          // → state_name
  courses: string[];             // → ug_courses / pg_courses
  courseType: CourseType | null; // → course_type (ug/pg)
  collegeType: string | null;    // → college_type
  hasHostel: boolean | null;     // → is_hostel
  academicYear: string | null;   // → academic_year

  // Fee collection filters
  fee: FeeFilter | null;         // → tution_fee / total_fee
  feeField: "tution_fee" | "total_fee" | "development_fee" | null;

  // Cutoff collection filters
  cutoff: CutoffFilter | null;   // → e.g. open_al, obc_mf

  sortBy: SortBy | null;
};

export type ParsedIntent = {
  intent: QueryIntent;
  confidence: "high" | "medium" | "low";
  filters: IntentFilters;
  raw: string;
  debugHits: {
    structuredKeywords: string[];
    descriptivePatterns: string[];
  };
};