import { CourseCutOff } from "../models/college.cutoff.model";
import { CollegeFeeStructure } from "../models/college.fees.model";
import { College } from "../models/college.model";
import { IntentDetector } from "./intentDetector.service";
import { MongoQueryBuilder } from "./mongoQueryBuilder.service";


const detector = new IntentDetector();
const builder = new MongoQueryBuilder();

export async function searchColleges(
    question: string,
    faissSearch: (q: string) => Promise<unknown[]>
) {
    const parsed = detector.detect(question);

    console.log(`[Intent]  ${parsed.intent} (${parsed.confidence})`);
    console.log(`[Filters]`, JSON.stringify(parsed.filters, null, 2));

    if (parsed.intent === "descriptive") {
        return faissSearch(question);
    }

    const query = builder.build(parsed);

    // ── Structured: decide which collections to query ──────────────────────
    const needsFee = parsed.filters.fee !== null;
    const needsCutoff = parsed.filters.cutoff !== null;

    if (!needsFee && !needsCutoff) {
        // Simple college listing
        const cursor = College.find(query.collegeFilter);
        if (query.sort) cursor.sort(query.sort);
        return cursor.limit(query.limit).lean();
    }

    if (needsFee && query.feeFilter) {
        // Get college_ids from fee collection, then fetch colleges
        const feeRecords = await CollegeFeeStructure
            .find(query.feeFilter)
            .select("college_id college_name")
            .lean();
        return feeRecords
    }

    if (needsCutoff && query.cutoffFilter) {
        // Get college_ids from cutoff collection, then fetch colleges
        const cutoffRecords = await CourseCutOff
            .find(query.cutoffFilter)
            .select("college_id college_name college_code")
            .sort(query.sort ?? {})
            .lean();
        return cutoffRecords
    }

    // "both" → merge structured + semantic
    if (parsed.intent === "both") {
        const [structured, semantic] = await Promise.all([
            College.find(query.collegeFilter).limit(query.limit).lean(),
            faissSearch(question),
        ]);
        const seen = new Set(structured.map((c: any) => c._id.toString()));
        const merged = [
            ...structured,
            ...(semantic as any[]).filter((c: any) => !seen.has(c._id?.toString())),
        ];
        return merged.slice(0, query.limit);
    }

    return [];
}