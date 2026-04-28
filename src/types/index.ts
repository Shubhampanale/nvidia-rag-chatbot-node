export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSession {
  id: string;
  history: ChatMessage[];
  documentId?: string;
}

export interface IngestResponse {
  success: boolean;
  documentId: string;
  message: string;
  chunksCreated: number;
}

export interface ChatRequest {
  question: string;
  sessionId?: string;
  documentId?: string;
}

export interface ChatResponse {
  answer: string;
  sessionId: string;
  sources: string[];
  chunks?: string;
}

export interface RAGContext {
  pageContent: string;
  metadata: Record<string, unknown>;
}