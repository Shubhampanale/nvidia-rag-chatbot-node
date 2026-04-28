import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config/env";

export function createLLM() {
  return new ChatOpenAI({
    model: config.llm.model,
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
    apiKey: config.nvidiaApiKey,
    configuration: {
      baseURL: config.llm.baseURL,
    },

    // NVIDIA Gemma rejects these — explicitly strip them
    frequencyPenalty: undefined,
    presencePenalty: undefined,
    n: undefined,

    // Also stop langchain adding any other defaults
    modelKwargs: {},
  });
}