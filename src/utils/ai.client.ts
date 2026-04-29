import { config } from "../config/env";
import { GeminiClient } from "./gemini.client";
import { NvidiaClient } from "./nvidia.client";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatParams = {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: any[];
};

export interface ChatClient {
  chat(params: ChatParams): Promise<string>;
  stream?(params: ChatParams): AsyncIterable<string>;
}

export function getChatClient(): ChatClient {
  const provider = config.aiProvider;
  console.log(`Using AI_PROVIDER:: ${provider}`);
  switch (provider) {
    case "nvidia":
      return new NvidiaClient();
    case "gemini":
      return new GeminiClient();
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported AI_PROVIDER: ${exhaustiveCheck}`);
    }
  }
}
export function getNvidiaClient(): ChatClient {
  return new NvidiaClient();
}

