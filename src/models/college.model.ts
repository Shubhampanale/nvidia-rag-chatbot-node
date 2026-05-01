import mongoose, { Schema, Document } from "mongoose";
interface IDocument {
  type: string;
  name: string;
  document_id: string;
}
export interface ICollege extends Document {
  college_name: string;
  college_code: string;
  college_type_id: string;
  college_type: string;
  hospital_details: string;
  bed: number;
  ug_courses: string[];
  pg_courses: string[];
  is_hostel: boolean;
  established_year: String;
  address: string;
  state_id: string;
  state_name: string;
  city_id: string;
  city_name: string;
  pin_code: number;
  academic_year: string;
  documents: IDocument[];
  deleted_at: Date;
  active: Boolean;
  is_ug: boolean;
  is_pg: boolean;
  id?: string;
  cut_off_year?: string;
  course?: string;
  course_id?: string;
}
const collegeSchema = new Schema<ICollege>(
  {
    college_name: { type: String, required: false },
    college_code: { type: String, required: false },
    college_type_id: { type: String, required: false },
    college_type: { type: String, required: false },
    address: { type: String, required: false },
    hospital_details: { type: String, required: false, default: "" },
    bed: { type: Number, required: false, default: 0 },
    ug_courses: { type: [String], required: false },
    pg_courses: { type: [String], required: false },
    is_hostel: { type: Boolean, default: false },
    established_year: { type: String, required: false },
    academic_year: { type: String, required: false },
    documents: [
      {
        type: { type: String, required: false },
        name: { type: String, required: false },
        document_id: { type: String, required: false },
        url: { type: String, required: false },
      },
    ],
    is_ug: { type: Boolean, default: false },
    is_pg: { type: Boolean, default: false },
    pin_code: { type: Number, required: false },
    city_id: { type: String, required: false },
    city_name: { type: String, required: false },
    state_id: { type: String, required: false },
    state_name: { type: String, required: false },
    deleted_at: { type: Date, required: false, default: null },
    active: { type: Boolean, default: true },
    cut_off_year: { type: String, required: false, default: null },
    course: { type: String, required: false },
    course_id: { type: String, required: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

collegeSchema.index({ college_name: "text" });

export const College = mongoose.model<ICollege>("College", collegeSchema);
