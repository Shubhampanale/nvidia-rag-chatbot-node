// services/mongoQueryBuilder.ts

import { ParsedIntent } from "../types/intent";

export type BuiltQuery = {
  // For College collection
  collegeFilter: Record<string, unknown>;
  // For CollegeFeeStructure collection
  feeFilter: Record<string, unknown> | null;
  // For CourseCutOff collection
  cutoffFilter: Record<string, unknown> | null;
  sort:  Record<string, 1 | -1> | null;
  limit: number;
};

export class MongoQueryBuilder {

  build(parsed: ParsedIntent): BuiltQuery {

    // ── College collection filter ──────────────────────────────────────────
    const collegeFilter: Record<string, unknown> = {
      active: true,
      deleted_at: null,
    };

    if (parsed.filters.city) {
      collegeFilter["city_name"] = { $regex: parsed.filters.city, $options: "i" };
    } else if (parsed.filters.state) {
      collegeFilter["state_name"] = { $regex: parsed.filters.state, $options: "i" };
    }

    if (parsed.filters.courses.length > 0) {
      if (parsed.filters.courseType === "pg") {
        collegeFilter["pg_courses"] = { $in: parsed.filters.courses };
        collegeFilter["is_pg"] = true;
      } else if (parsed.filters.courseType === "ug") {
        collegeFilter["ug_courses"] = { $in: parsed.filters.courses };
        collegeFilter["is_ug"] = true;
      } else {
        // Search in both
        collegeFilter["$or"] = [
          { ug_courses: { $in: parsed.filters.courses } },
          { pg_courses: { $in: parsed.filters.courses } },
        ];
      }
    }

    if (parsed.filters.collegeType) {
      collegeFilter["college_type"] = { $regex: parsed.filters.collegeType, $options: "i" };
    }

    if (parsed.filters.hasHostel !== null) {
      collegeFilter["is_hostel"] = parsed.filters.hasHostel;
    }

    if (parsed.filters.academicYear) {
      collegeFilter["academic_year"] = parsed.filters.academicYear;
    }

    // ── Fee collection filter ──────────────────────────────────────────────
    let feeFilter: Record<string, unknown> | null = null;

    if (parsed.filters.fee && parsed.filters.feeField) {
      feeFilter = {
        active: true,
        [parsed.filters.feeField]: { [parsed.filters.fee.operator]: parsed.filters.fee.value },
      };
      if (parsed.filters.academicYear) {
        feeFilter["academic_year"] = parsed.filters.academicYear;
      }
    }

    // ── Cutoff collection filter ───────────────────────────────────────────
    let cutoffFilter: Record<string, unknown> | null = null;

    if (parsed.filters.cutoff) {
      cutoffFilter = {
        active: true,
        [parsed.filters.cutoff.fieldName]: { $gt: 0 }, // field exists and not zero
      };
      if (parsed.filters.courses.length > 0) {
        cutoffFilter["course_name"] = { $in: parsed.filters.courses };
      }
      if (parsed.filters.courseType) {
        cutoffFilter["course_type"] = parsed.filters.courseType;
      }
      if (parsed.filters.academicYear) {
        cutoffFilter["academic_year"] = parsed.filters.academicYear;
      }
    }

    // ── Sort ───────────────────────────────────────────────────────────────
    let sort: Record<string, 1 | -1> | null = null;
    if (parsed.filters.sortBy === "total_fee")    sort = { total_fee: 1 };
    if (parsed.filters.sortBy === "cutoff")       sort = { [parsed.filters.cutoff?.fieldName ?? "open_al"]: 1 };
    if (parsed.filters.sortBy === "college_name") sort = { college_name: 1 };

    return { collegeFilter, feeFilter, cutoffFilter, sort, limit: 20 };
  }
}