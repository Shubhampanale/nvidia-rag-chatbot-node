import { ParsedIntent } from "../types/intent";

export type BuiltQuery = {
  collegeFilter: Record<string, unknown>;
  feeFilter: Record<string, unknown> | null;
  sort: Record<string, 1 | -1> | null;
  limit: number;
};

export class MongoQueryBuilder {

  build(parsed: ParsedIntent): BuiltQuery {

    // ── College collection filter ──────────────────────────────────────────
    const collegeFilter: Record<string, unknown> = {};

    if (parsed.filters.city) {
      collegeFilter["city"] = { $regex: parsed.filters.city, $options: "i" };
    }
    if (parsed.filters.state) {
      collegeFilter["state"] = { $regex: parsed.filters.state, $options: "i" };
    }
    if (parsed.filters.courses.length > 0) {
      collegeFilter["courses"] = { $in: parsed.filters.courses };
    }
    if (parsed.filters.collegeType) {
      collegeFilter["college_type"] = { $regex: parsed.filters.collegeType, $options: "i" };
    }

    // ── Fee collection filter ──────────────────────────────────────────────
    let feeFilter: Record<string, unknown> | null = null;

    if (parsed.filters.fee && parsed.filters.feeField) {
      feeFilter = {
        [parsed.filters.feeField]: { [parsed.filters.fee.operator]: parsed.filters.fee.value },
      };
    }

    // ── Sort ───────────────────────────────────────────────────────────────
    let sort: Record<string, 1 | -1> | null = null;
    if (parsed.filters.sortBy === "total_fee") sort = { total_fee: 1 };
    if (parsed.filters.sortBy === "college_name") sort = { college_name: 1 };

    return { collegeFilter, feeFilter, sort, limit: 10 };
  }
}