import { Router } from "express";
import { upload } from "../middleware/upload.middleware";
import { ingestPDFController } from "../controllers/ingest.controller";

const router = Router();

// POST /api/ingest — upload and embed a PDF
router.post("/", upload.single("pdf"), ingestPDFController);

export default router;