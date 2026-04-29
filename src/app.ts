import express from "express";
import cors from "cors";
import fs from "fs";
import { config } from "./config/env";
import ingestRoutes from "./routes/ingest.routes";
import ingestExcelRoutes from "./routes/ingestExcel.routes";
import chatRoutes from "./routes/chat.routes";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

// Ensure directories exist
fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.vectorStoreDir, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static chat UI
app.use(express.static("public"));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Routes
app.use("/api/ingest", ingestRoutes);
app.use("/api/ingest-excel", ingestExcelRoutes);
app.use("/api/chat", chatRoutes);

// Error handler (must be last)
app.use(errorMiddleware);

app.listen(config.port, () => {
  console.log(`🚀 Server running on ${config.port}`);
});

export default app;
