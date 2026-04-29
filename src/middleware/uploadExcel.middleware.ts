import multer from "multer";
import path from "path";
import fs from "fs";
import { config } from "../config/env";
import { Request } from "express";

fs.mkdirSync(config.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const allowed = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "application/octet-stream", // some browsers
]);

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const extOk = ext === ".xlsx" || ext === ".xls";
  const mimeOk = allowed.has(file.mimetype);

  if (extOk && mimeOk) cb(null, true);
  else cb(new Error("Only Excel files (.xlsx/.xls) are allowed"));
};

export const uploadExcel = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

