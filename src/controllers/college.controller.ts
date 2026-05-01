import { Request, Response } from "express";
import axios from "axios";
import { College } from "../models/college.model";
import { CollegeFeeStructure } from "../models/college.fees.model";

export const syncCollegesAndFees = async (req: Request, res: Response) => {
  try {
    const [collegeRes, feeRes] = await Promise.all([
      axios.get("http://localhost:8000/api/cutoff/colleges"),
      axios.get("http://localhost:8000/api/cutoff/fees"),
    ]);

    const collegesData = collegeRes.data?.data || [];
    const feesData = feeRes.data?.data || [];

    // =============================
    // 🔹 1. UPSERT COLLEGES ONLY
    // =============================
    const collegeOps = collegesData.map((c: any) => {
      const code = String(c.college_code).trim();

      return {
        updateOne: {
          filter: { college_code: code },
          update: {
            $set: {
              college_name: c.college_name,
              address: c.address,
              state: c.state?.toUpperCase(),
              city: c.city?.toLowerCase(),
              college_type: c.college_type,
              courses: c.courses || [],
            },
          },
          upsert: true,
        },
      };
    });

    if (collegeOps.length) {
      await College.bulkWrite(collegeOps, { ordered: false });
    }

    // =============================
    // 🔹 2. UPSERT FEES ONLY
    // =============================
    const feeOps = feesData.map((f: any) => {
      const code = String(f.college_code).trim();

      return {
        updateOne: {
          filter: { college_code: code },
          update: {
            $set: {
              college_name: f.college_name,
              state: f.state?.toUpperCase(),
              city: f.city?.toLowerCase(),
              college_type: f.college_type,
              courses: f.courses || [],
              total_fee: f.total_fee,
              tution_fee: f.tution_fee,
              development_fee: f.development_fee,
            },
          },
          upsert: true,
        },
      };
    });

    if (feeOps.length) {
      await CollegeFeeStructure.bulkWrite(feeOps, { ordered: false });
    }

    return res.status(200).json({
      success: true,
      message: "Colleges & Fees synced separately ✅",
      totalColleges: collegesData.length,
      totalFees: feesData.length,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};