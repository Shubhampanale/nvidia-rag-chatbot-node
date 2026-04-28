import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { generateRAGResponse } from "../services/rag.service";
import { ChatRequest, ChatResponse, ChatSession } from "../types";

// In-memory session store (replace with Redis for production)
const sessions = new Map<string, ChatSession>();

export async function chatController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { question, sessionId, documentId } = req.body as ChatRequest;

  if (!question?.trim()) {
    res.status(400).json({ success: false, error: "Question is required" });
    return;
  }

  // Get or create session
  const currentSessionId = sessionId || uuidv4();
  if (!sessions.has(currentSessionId)) {
    sessions.set(currentSessionId, {
      id: currentSessionId,
      history: [],
      documentId,
    });
  }
  const session = sessions.get(currentSessionId)!;

  try {
    const { answer, sources, chunks } = await generateRAGResponse(
      question,
      documentId,
    );

    // Update history
    session.history.push({ role: "user", content: question });
    session.history.push({ role: "assistant", content: answer });

    const response: ChatResponse = {
      answer,
      sessionId: currentSessionId,
      sources,
      chunks,
    };

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export function getChatHistory(
  req: Request,
  res: Response
): void {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ success: false, error: "Session not found" });
    return;
  }
  res.status(200).json({ history: session.history });
}

