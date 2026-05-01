import mongoose, { Schema, Document } from "mongoose";

export interface ICollegeFeeStructure extends Document {
  college_id: string;
  college_name: string;
  college_code: string;
  tution_fee: number;
  development_fee: number;
  total_fee: number;
  fee_details: IFeeDetail[];
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
  state_id: string;
  academic_year: string;
  college_type?: string;
  college_type_id?: string;
}

export interface IFeeDetail {
  fee_type: string;
  amount: number;
  course_name?: string;
  course_id?: string;
}

const FeeDetailSchema: Schema = new Schema({
  fee_type: { type: String, required: true },
  amount: { type: Number, required: true },
  course_name: { type: String },
  course_id: { type: String },
});

const CollegeFeeStructureSchema: Schema = new Schema(
  {
    college_id: { type: Schema.Types.ObjectId, ref: "College", required: true },
    college_name: { type: String, required: false },
    college_code: { type: String, required: false },
    tution_fee: { type: Number, required: true },
    total_fee: { type: Number, required: false },
    development_fee: { type: Number, required: true },
    fee_details: { type: [FeeDetailSchema], default: [] },
    active: { type: Boolean, default: true },
    state_id: { type: String, required: false },
    academic_year: { type: String, required: false },
    college_type: { type: String, required: false },
    college_type_id: { type: String, required: false },
  },
  { timestamps: true, versionKey: false },
);

export const CollegeFeeStructure = mongoose.model<ICollegeFeeStructure>(
  "college_fees_structures",
  CollegeFeeStructureSchema,
);
