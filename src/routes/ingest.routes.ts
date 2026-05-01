import { Router } from "express";
import { upload } from "../middleware/upload.middleware";
import { ingestPDFController, ingestJSONController } from "../controllers/ingest.controller";

const router = Router();

router.post("/", upload.single("pdf"), ingestPDFController);
router.get("/json", ingestJSONController);

export default router;