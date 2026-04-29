import OpenAI from 'openai';

export class NvidiaClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: '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',
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }

  async chat(params: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    tools?: any[]
  }) {
    const defaultSystemPrompt = `
      You are Medico, an AI Medical Admission Counsellor for CutoffMantra.
      Your responses should be structured, concise, and relevant to the medical admissions process in India.
      Always maintain a natural tone, guiding the user towards the next step.
      Focus on counselling, college information, fees, courses, and other admission-related queries.
      Do not predict cutoffs or provide rank-based allocation.
      Refer users to https://cutoffmantra.appristine.in/signin for personalized cutoff analysis.

      **Respond in a way that is student-friendly and professional. Avoid promotional tone.**
    `;

    const systemPrompt = params.systemPrompt ?? defaultSystemPrompt;

    // Add system prompt to the first user message (if needed), then append the user's messages
    const messagesWithSystemPrompt = [
      { role: 'assistant', content: systemPrompt }, // Use assistant as a workaround for system role
      ...params.messages,
    ];

    const completion = await this.client.chat.completions.create({
      model: params.model || 'google/gemma-2-2b-it',
      //@ts-ignore
      messages: messagesWithSystemPrompt,
      temperature: params.temperature || 0.2,
      max_tokens: params.maxTokens || 1024,
      stream: false,
      tools: params.tools
    });

    return completion.choices[0]?.message?.content || '';
  }
}