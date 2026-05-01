
export const COURSES: Record<string, string[]> = {
  medical_ug: ["mbbs", "bds", "bams", "bhms", "bums", "bpt"],
};


// ─── College Types (matches college_type in College schema) ──────────────────
export const COLLEGE_TYPE_MAP: Record<string, string> = {
  government: "Government",
  govt: "Government",
  sarkari: "Government",
  private: "Private",
  deemed: "Deemed",
  aided: "Aided",
  unaided: "Unaided",
  minority: "Minority",
};

// ─── Location (matches city_name / state_name in College schema) ─────────────
export const CITIES: string[] = [
  "mumbai", "pune", "nagpur", "nashik", "aurangabad", "thane",
  "kolhapur", "solapur", "amravati", "nanded", "latur", "akola",
  "jalgaon", "ahmednagar", "satara", "sangli", "ratnagiri",
  "delhi", "bangalore", "chennai", "hyderabad", "kolkata",
  "ahmedabad", "jaipur", "lucknow", "bhopal", "indore",
];

export const STATES: string[] = [
  "maharashtra", "gujarat", "rajasthan", "delhi", "karnataka",
  "tamil nadu", "telangana", "west bengal", "uttar pradesh",
  "madhya pradesh", "bihar", "kerala", "andhra pradesh",
];

// ─── Intent Keywords ──────────────────────────────────────────────────────────
export const STRONG_STRUCTURED_KEYWORDS: string[] = [
  // Listing triggers
  "list", "show", "find", "search", "give me", "display", "colleges for",
  // Courses
  "mbbs", "bds", "bams", "bhms", "bpt", "md", "ms", "mds", "bpharm",
  // Fee fields (from CollegeFeeStructure schema)
  "fees", "fee", "tuition fee", "tution fee", "total fee",
  "development fee", "fee structure", "cost", "charges",
  // College schema fields
  "college code", "college type", "hostel", "beds", "established",
  "ug courses", "pg courses",
];

export const WEAK_STRUCTURED_KEYWORDS: string[] = [
  "how much", "available", "college", "university", "institute",
];

export const DESCRIPTIVE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bwhen\b/, label: "when" },
  { pattern: /\bwhy\b/, label: "why" },
  { pattern: /\bprocess\b/, label: "process" },
  { pattern: /\bprocedure\b/, label: "procedure" },
  { pattern: /\bsteps?\b/, label: "steps" },
  { pattern: /\bregistration\b/, label: "registration" },
  { pattern: /\bdocuments?\b/, label: "documents" },
  { pattern: /\brules?\b/, label: "rules" },
  { pattern: /\bcounsel(?:l)?ing\b/, label: "counseling" },
  { pattern: /\bmop[- ]?up\b/, label: "mop-up" },
  { pattern: /\bstray\b/, label: "stray" },
  { pattern: /\bschedule\b/, label: "schedule" },
  { pattern: /\btimeline\b/, label: "timeline" },
  { pattern: /\bround(?:s)?\b/, label: "rounds" },
  { pattern: /\bresult\b/, label: "result" },
  { pattern: /\bnotification\b/, label: "notification" },
  { pattern: /\bapplication\b/, label: "application" },
  { pattern: /\bwhat is\b/, label: "what_is" },
  { pattern: /\bwhat are\b/, label: "what_are" },
  { pattern: /\bexplain\b/, label: "explain" },
  { pattern: /\btell me about\b/, label: "tell_me_about" },
  { pattern: /\beligibilit(?:y|ies)\b/, label: "eligibility" },
];

export const HOW_STRUCTURED_OVERRIDES: RegExp[] = [
  /\bhow much\b/,
  /\bhow many\b/,
  /\bhow to (?:apply|get|find|check)\b/,
];

export const SEMANTIC_SIGNALS: RegExp[] = [
  /\bsimilar to\b/,
  /\bcompare\b/,
  /\bversus\b/,
  /\bvs\b/,
  /\brecommend\b/,
  /\bsuggestion\b/,
  /\bbest for me\b/,
  /\bshould i\b/,
  /\badvice\b/,
  /\bworth it\b/,
  /\bcareer scope\b/,
  /\bplacement(?:s)?\b/,
];

export const FEE_PATTERNS: Array<{ pattern: RegExp; operator: "$lt" | "$gt" }> = [
  {
    pattern: /(?:under|below|less than|upto|up to)\s+([\d,]+)\s*(?:lakh|lac|l\b|k\b|thousand)?/,
    operator: "$lt",
  },
  {
    pattern: /(?:above|more than|greater than|over)\s+([\d,]+)\s*(?:lakh|lac|l\b|k\b|thousand)?/,
    operator: "$gt",
  },
];

export const SORT_SIGNALS: Record<string, string[]> = {
  total_fee: ["cheap", "affordable", "low cost", "budget", "lowest fee"],
  college_name: ["alphabetical", "a to z"],
};

export const ACADEMIC_YEAR_PATTERN = /\b(20\d{2})[- ]?(20\d{2})?\b/;