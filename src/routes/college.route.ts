import express from "express";
import { syncCollegesAndFees } from "../controllers/college.controller";

const router = express.Router();

// 🔹 Trigger sync manually
router.get("/colleges-fees", syncCollegesAndFees);

export default router;