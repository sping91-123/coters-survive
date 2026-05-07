/**
 * AI Provider 팩토리. 환경변수에 따라 활성 Provider를 결정한다.
 *
 * 현재: GEMINI_API_KEY가 있으면 Gemini 사용.
 * 추후: ANTHROPIC_API_KEY, OPENAI_API_KEY 등을 추가하고 우선순위 정하면 swap 1줄로 끝.
 */

import type { AIProvider } from "./types";
import { GeminiProvider } from "./gemini";

let cached: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cached) return cached;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    cached = new GeminiProvider(geminiKey);
    return cached;
  }

  throw new Error(
    "AI Provider가 설정되지 않았습니다. .env.local에 GEMINI_API_KEY를 추가하세요."
  );
}

export type { CommentaryInput, CommentaryOutput, MarketBriefingInput, MarketBriefingOutput, AIProvider } from "./types";
export { AIProviderError } from "./types";
