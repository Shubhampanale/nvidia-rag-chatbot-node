import { Router } from "express";
import { chatController, getChatHistory } from "../controllers/chat.controller";

const router = Router();

// POST /api/chat — send a question
router.post("/", chatController);

// GET /api/chat/history/:sessionId — get chat history
router.get("/history/:sessionId", getChatHistory);

export default router;