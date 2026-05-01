import mongoose, { Schema, Document } from "mongoose";

export interface ICollegeCutOff extends Document {
  college_id: string;
  college_name: string;
  course_id: string;
  college_code: string;
  course_name: string;
  academic_year: string;
  course_type: string;
  course?: string;
  state_id?: string;
  sc_af: number;
  sc_al: number;
  sc_mf: number;
  sc_ml: number;
  st_af: number;
  st_al: number;
  st_mf: number;
  st_ml: number;
  vj_af: number;
  vj_al: number;
  vj_mf: number;
  vj_ml: number;
  nt1_af: number;
  nt1_al: number;
  nt1_mf: number;
  nt1_ml: number;
  nt2_af: number;
  nt2_al: number;
  nt2_mf: number;
  nt2_ml: number;
  nt3_af: number;
  nt3_al: number;
  nt3_mf: number;
  nt3_ml: number;
  obc_af: number;
  obc_al: number;
  obc_mf: number;
  obc_ml: number;
  ews_af: number;
  ews_al: number;
  ews_mf: number;
  ews_ml: number;
  open_af: number;
  open_al: number;
  open_mf: number;
  open_ml: number;
  d1_af: number;
  d1_al: number;
  d1_mf: number;
  d1_ml: number;
  d2_af: number;
  d2_al: number;
  d2_mf: number;
  d2_ml: number;
  d3_af: number;
  d3_al: number;
  d3_mf: number;
  d3_ml: number;
  ph_af: number;
  ph_al: number;
  ph_mf: number;
  ph_ml: number;
  mkb_af: number;
  mkb_al: number;
  mkb_mf: number;
  mkb_ml: number;
  nri_af: number;
  nri_al: number;
  nri_mf: number;
  nri_ml: number;
  sebc_af: number;
  sebc_al: number;
  sebc_mf: number;
  sebc_ml: number;
  deleted_at: Date;
  active: boolean;
}

const category_cut_off = new Schema<ICollegeCutOff>(
  {
    college_id: { type: String, required: false },
    college_code: { type: String, required: false },
    college_name: { type: String, required: false },
    course_id: { type: String, required: false },
    course_name: { type: String, required: false },
    academic_year: { type: String, required: false },
    course: { type: String, required: false },
    state_id: { type: String, required: false },
    course_type: { type: String, enum: ["pg", "ug"], required: false },
    sc_af: { type: Number, default: 0 },
    sc_al: { type: Number, default: 0 },
    sc_mf: { type: Number, default: 0 },
    sc_ml: { type: Number, default: 0 },
    st_af: { type: Number, default: 0 },
    st_al: { type: Number, default: 0 },
    st_mf: { type: Number, default: 0 },
    st_ml: { type: Number, default: 0 },
    vj_af: { type: Number, default: 0 },
    vj_al: { type: Number, default: 0 },
    vj_mf: { type: Number, default: 0 },
    vj_ml: { type: Number, default: 0 },
    nt1_af: { type: Number, default: 0 },
    nt1_al: { type: Number, default: 0 },
    nt1_mf: { type: Number, default: 0 },
    nt1_ml: { type: Number, default: 0 },
    nt2_af: { type: Number, default: 0 },
    nt2_al: { type: Number, default: 0 },
    nt2_mf: { type: Number, default: 0 },
    nt2_ml: { type: Number, default: 0 },
    nt3_af: { type: Number, default: 0 },
    nt3_al: { type: Number, default: 0 },
    nt3_mf: { type: Number, default: 0 },
    nt3_ml: { type: Number, default: 0 },
    obc_af: { type: Number, default: 0 },
    obc_al: { type: Number, default: 0 },
    obc_mf: { type: Number, default: 0 },
    obc_ml: { type: Number, default: 0 },
    ews_af: { type: Number, default: 0 },
    ews_al: { type: Number, default: 0 },
    ews_mf: { type: Number, default: 0 },
    ews_ml: { type: Number, default: 0 },
    open_af: { type: Number, default: 0 },
    open_al: { type: Number, default: 0 },
    open_mf: { type: Number, default: 0 },
    open_ml: { type: Number, default: 0 },
    d1_af: { type: Number, default: 0 },
    d1_al: { type: Number, default: 0 },
    d1_mf: { type: Number, default: 0 },
    d1_ml: { type: Number, default: 0 },
    d2_af: { type: Number, default: 0 },
    d2_al: { type: Number, default: 0 },
    d2_mf: { type: Number, default: 0 },
    d2_ml: { type: Number, default: 0 },
    d3_af: { type: Number, default: 0 },
    d3_al: { type: Number, default: 0 },
    d3_mf: { type: Number, default: 0 },
    d3_ml: { type: Number, default: 0 },
    ph_af: { type: Number, default: 0 },
    ph_al: { type: Number, default: 0 },
    ph_mf: { type: Number, default: 0 },
    ph_ml: { type: Number, default: 0 },
    mkb_af: { type: Number, default: 0 },
    mkb_al: { type: Number, default: 0 },
    mkb_mf: { type: Number, default: 0 },
    mkb_ml: { type: Number, default: 0 },
    nri_af: { type: Number, default: 0 },
    nri_al: { type: Number, default: 0 },
    nri_mf: { type: Number, default: 0 },
    nri_ml: { type: Number, default: 0 },
    sebc_af: { type: Number, default: 0 },
    sebc_al: { type: Number, default: 0 },
    sebc_mf: { type: Number, default: 0 },
    sebc_ml: { type: Number, default: 0 },
    deleted_at: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const CourseCutOff = mongoose.model<ICollegeCutOff>(
  "college_cut_off",
  category_cut_off
);
