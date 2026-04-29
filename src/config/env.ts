import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "8084", 10),
  nvidiaApiKey: process.env.NVIDIA_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  aiProvider: (process.env.AI_PROVIDER || "nvidia") as
    | "nvidia"
    | "gemini",
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  vectorStoreDir: process.env.VECTOR_STORE_DIR || "./vector_store",
  chunkSize: parseInt(process.env.CHUNK_SIZE || "1000", 10),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || "200", 10),
  topKResults: parseInt(process.env.TOP_K_RESULTS || "5", 10),
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || "1.6"),

  // NVIDIA / Gemma model config
  llm: {
    model: "google/gemma-2-2b-it",
    baseURL: "https://integrate.api.nvidia.com/v1",
    temperature: 0.2,
    maxTokens: 256,
  },

  // Embeddings — NVIDIA provides this compatible model
  embeddings: {
    model: "nvidia/nv-embedqa-e5-v5",
    baseURL: "https://integrate.api.nvidia.com/v1",
  },

  // Gemini config (used when AI_PROVIDER=gemini)
  gemini: {
    llmModel: process.env.GEMINI_LLM_MODEL || "gemini-2.5-flash",
    embeddingsModel: process.env.GEMINI_EMBEDDINGS_MODEL || "gemini-embedding-2",
  },
} as const;
