// types/intent.ts

export type QueryIntent = "structured" | "descriptive" | "both";
export type SortBy = "total_fee" | "college_name";

export type FeeFilter = {
  operator: "$lt" | "$gt" | "$lte" | "$gte";
  value: number;
};

export type IntentFilters = {
  // College collection filters
  city: string | null;           // → city_name
  state: string | null;          // → state_name
  courses: string[];             // → ug_courses / pg_courses
  collegeType: string | null;    // → college_type
  hasHostel: boolean | null;     // → is_hostel
  // Fee collection filters
  fee: FeeFilter | null;         // → tution_fee / total_fee
  feeField: "tution_fee" | "total_fee" | "development_fee" | null;
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