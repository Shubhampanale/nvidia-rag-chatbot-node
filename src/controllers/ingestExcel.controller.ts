import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { ingestExcel } from "../services/ingestExcel.service";

export async function ingestExcelController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No Excel file uploaded" });
    return;
  }

  const workbookId = uuidv4();
  const filePath = req.file.path;

  try {
    const chunksCreated = await ingestExcel(filePath, workbookId);
    res.status(200).json({
      success: true,
      workbookId,
      message: "Excel ingested successfully",
      chunksCreated,
    });
  } catch (err) {
    next(err);
  } finally {
    fs.unlink(filePath, () => {});
  }
}

