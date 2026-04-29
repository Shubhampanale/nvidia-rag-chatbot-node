import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { ingestPDF } from "../services/ingest.service";
import { IngestResponse } from "../types";

export async function ingestPDFController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, error: "No PDF file uploaded" });
    return;
  }

  const documentId = uuidv4();
  const filePath = req.file.path;

  try {
    console.log(`[INGEST] Starting ingestion for ${req.file.originalname}...`);
    const chunksCreated = await ingestPDF(filePath, documentId);

    const response: IngestResponse = {
      success: true,
      documentId,
      message: `PDF ingested successfully`,
      chunksCreated,
    };

    console.log(`[INGEST] Done. ${chunksCreated} chunks, docId: ${documentId}`);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  } finally {
    fs.unlink(filePath, () => { });
  }
}