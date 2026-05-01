import mongoose, { Schema, Document } from "mongoose";

export interface ICollege extends Document {
  college_name: string;
  college_code: string;
  address: string;
  state: string;
  city: string;
  college_type: string;
  courses: string[];
}

const collegeSchema = new Schema<ICollege>(
  {
    college_name: { type: String },
    college_code: { type: String },
    address: { type: String },
    state: { type: String },
    city: { type: String },
    college_type: { type: String },
    courses: { type: [String], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

collegeSchema.index({ college_name: "text", city: "text", state: "text" });

export const College = mongoose.model<ICollege>("College", collegeSchema);