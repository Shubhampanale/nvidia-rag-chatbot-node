import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { config } from "../config/env";

export function createLLM() {
  switch (config.aiProvider) {
    case "nvidia":
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

    case "gemini": {
      if (!config.geminiApiKey) {
        throw new Error("AI_PROVIDER=gemini is set but GEMINI_API_KEY is missing.");
      }

      return new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: config.gemini.llmModel,
        temperature: config.llm.temperature,
        maxOutputTokens: config.llm.maxTokens,
      });
    }

    default: {
      const exhaustiveCheck: never = config.aiProvider;
      throw new Error(`Unsupported AI_PROVIDER: ${exhaustiveCheck}`);
    }
  }
}
