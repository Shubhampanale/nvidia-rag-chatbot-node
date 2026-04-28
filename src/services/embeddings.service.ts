import { OpenAIEmbeddings } from "@langchain/openai";
import OpenAI from "openai";
import { config } from "../config/env";

class NvidiaEmbeddings extends OpenAIEmbeddings {
  private inputType: "passage" | "query";
  private nvidiaClient: OpenAI;

  constructor(inputType: "passage" | "query") {
    super({
      model: config.embeddings.model,
      apiKey: config.nvidiaApiKey,
      configuration: {
        baseURL: config.embeddings.baseURL,
      },
    });
    this.inputType = inputType;
    this.nvidiaClient = new OpenAI({
      apiKey: config.nvidiaApiKey,
      baseURL: config.embeddings.baseURL,
    });
  }

  // Override the core embed method to inject input_type in the body
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await this.nvidiaClient.embeddings.create({
      model: config.embeddings.model,
      input: texts,
      // @ts-ignore — NVIDIA-specific body param not in OpenAI types
      input_type: this.inputType,
      truncate: "END",
    });

    return response.data.map((item) => item.embedding);
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await this.nvidiaClient.embeddings.create({
      model: config.embeddings.model,
      input: [text],
      // @ts-ignore — NVIDIA-specific body param not in OpenAI types
      input_type: "query", // always query type for single question lookup
      truncate: "END",
    });

    return response.data[0].embedding;
  }
}

export function createEmbeddings(inputType: "passage" | "query" = "passage") {
  return new NvidiaEmbeddings(inputType);
}