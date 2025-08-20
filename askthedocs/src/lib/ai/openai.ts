// lib/ai/openai.ts
import { createOpenAI } from '@ai-sdk/openai';

// Create OpenAI provider instance
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  // Optional: Add custom configuration
  // baseURL: 'https://api.openai.com/v1', // default
  // organization: process.env.OPENAI_ORG_ID,
});

// Export commonly used models as constants for type safety
export const models = {
  gpt4oMini: 'gpt-4o-mini',
  gpt4o: 'gpt-4o',
  gpt4Turbo: 'gpt-4-turbo',
  gpt35Turbo: 'gpt-3.5-turbo',
} as const;

export type ModelType = typeof models[keyof typeof models];