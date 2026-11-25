import type { ConversationError, ConversationErrorCode } from "./types";

const knownCodes = new Set<ConversationErrorCode>([
  "network_error",
  "provider_not_configured",
  "provider_auth_failed",
  "model_not_available",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unreachable",
  "conversation_daily_limit",
  "conversation_rate_limited",
  "conversation_in_progress",
  "conversation_server_busy",
  "generation_failed",
  "stream_interrupted",
]);

const nonRetryableCodes = new Set<ConversationErrorCode>([
  "provider_not_configured",
  "provider_auth_failed",
  "model_not_available",
  // 日额度当天不会因立即重试恢复，隐藏“再次提问”可避免重复制造 429。
  "conversation_daily_limit",
]);

export function normalizeErrorCode(value: unknown): ConversationErrorCode {
  return typeof value === "string" && knownCodes.has(value as ConversationErrorCode)
    ? value as ConversationErrorCode
    : "generation_failed";
}

export function createConversationError(code: ConversationErrorCode, message: string): ConversationError {
  return { code, message, retryable: !nonRetryableCodes.has(code) };
}

export class ConversationRequestError extends Error {
  readonly detail: ConversationError;

  constructor(detail: ConversationError) {
    super(detail.message);
    this.name = "ConversationRequestError";
    this.detail = detail;
  }
}

export function toConversationError(cause: unknown): ConversationError {
  if (cause instanceof ConversationRequestError) return cause.detail;
  return createConversationError(
    "generation_failed",
    cause instanceof Error ? cause.message : "回复生成失败，请重试。",
  );
}
