import mongoose, { Schema, Document } from "mongoose";

export interface ICollegeFeeStructure extends Document {
  college_code: string;
  college_name: string;
  state: string;
  city: string;
  college_type: string;
  courses: string[];
  total_fee: number;
  tution_fee?: number;
  development_fee?: number;
}

const CollegeFeeStructureSchema = new Schema<ICollegeFeeStructure>(
  {
    college_code: { type: String, required: true },
    college_name: { type: String },
    state: { type: String },
    city: { type: String },
    college_type: { type: String },
    courses: { type: [String], default: [] },
    total_fee: { type: Number },
    tution_fee: { type: Number },
    development_fee: { type: Number },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

CollegeFeeStructureSchema.index({ college_code: 1 });
CollegeFeeStructureSchema.index({ state: 1, city: 1 });
CollegeFeeStructureSchema.index({ course: 1 });
CollegeFeeStructureSchema.index({ college_type: 1 });

export const CollegeFeeStructure = mongoose.model<ICollegeFeeStructure>(
  "college_fee_structures",
  CollegeFeeStructureSchema
);