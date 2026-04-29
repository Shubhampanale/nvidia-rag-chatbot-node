import { Router } from "express";
import { uploadExcel } from "../middleware/uploadExcel.middleware";
import { ingestExcelController } from "../controllers/ingestExcel.controller";

const router = Router();

router.post("/", uploadExcel.single("excel"), ingestExcelController);

export default router;

