import { Router } from "express";
import { upload } from "../middleware/upload.middleware";
import { ingestPDFController } from "../controllers/ingest.controller";

const router = Router();

router.post("/", upload.single("pdf"), ingestPDFController);

export default router;