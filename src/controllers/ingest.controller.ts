import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { ingestPDF, ingestJSON } from "../services/ingest.service";
import { IngestResponse } from "../types";

export async function ingestJSONController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const documentId = "data-json-" + uuidv4();
  const filePath = path.join(__dirname, "../data.json");

  try {
    console.log(`[INGEST] Starting ingestion for data.json...`);
    const chunksCreated = await ingestJSON(filePath, documentId);

    const response: IngestResponse = {
      success: true,
      documentId,
      message: `data.json ingested successfully`,
      chunksCreated,
    };

    console.log(`[INGEST] Done. ${chunksCreated} items, docId: ${documentId}`);
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

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