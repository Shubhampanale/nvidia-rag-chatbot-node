import { Router } from "express";
import { chatController, getChatHistory } from "../controllers/chat.controller";

const router = Router();

router.post("/", chatController);
router.get("/history/:sessionId", getChatHistory);

export default router;