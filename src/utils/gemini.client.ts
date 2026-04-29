import { config } from "../config/env";
import type { ChatClient, ChatMessage, ChatParams } from "./ai.client";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

export class GeminiClient implements ChatClient {
  private static llmInstance: ChatGoogleGenerativeAI | null = null;

  private getLLM(params: ChatParams): ChatGoogleGenerativeAI {
    if (!GeminiClient.llmInstance) {
      GeminiClient.llmInstance = new ChatGoogleGenerativeAI({
        apiKey: config.geminiApiKey,
        model: params.model || config.gemini.llmModel,
        temperature: params.temperature ?? config.llm.temperature,
        maxOutputTokens: params.maxTokens ?? config.llm.maxTokens,
      });
    }
    return GeminiClient.llmInstance;
  }

  async chat(params: ChatParams): Promise<string> {
    if (!config.geminiApiKey) {
      throw new Error(
        "AI_PROVIDER=gemini is set but GEMINI_API_KEY is missing."
      );
    }

    if (params.tools && params.tools.length > 0) {
      throw new Error("GeminiClient: tools are not supported yet.");
    }

    const llm = this.getLLM(params);
    const messages = toLangChainMessages(params.messages, params.systemPrompt);
    const result = await llm.invoke(messages);
    return (result.content ?? "").toString();
  }

  async *stream(params: ChatParams): AsyncIterable<string> {
    if (!config.geminiApiKey) {
      throw new Error(
        "AI_PROVIDER=gemini is set but GEMINI_API_KEY is missing."
      );
    }

    const llm = this.getLLM(params);
    const messages = toLangChainMessages(params.messages, params.systemPrompt);
    const stream = await llm.stream(messages);

    for await (const chunk of stream) {
      yield (chunk.content ?? "").toString();
    }
  }
}

function toLangChainMessages(
  messages: ChatMessage[],
  systemPrompt?: string
) {
  const out: Array<SystemMessage | HumanMessage | AIMessage> = [];
  if (systemPrompt) out.push(new SystemMessage(systemPrompt));

  for (const m of messages) {
    if (m.role === "user") out.push(new HumanMessage(m.content));
    else out.push(new AIMessage(m.content));
  }
  return out;
}
