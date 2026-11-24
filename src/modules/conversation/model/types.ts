export type MessageRole = "user" | "assistant";
export type MessageStatus = "pending" | "streaming" | "completed" | "cancelled" | "failed";

export type ConversationErrorCode =
  | "network_error"
  | "provider_not_configured"
  | "provider_auth_failed"
  | "model_not_available"
  | "provider_rate_limited"
  | "provider_timeout"
  | "provider_unreachable"
  | "generation_failed"
  | "stream_interrupted";

export interface ConversationError {
  code: ConversationErrorCode;
  message: string;
  retryable: boolean;
}

export interface Message {
  id: string;
  turnId: string;
  conversationId?: string;
  sequence?: number;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  error?: ConversationError;
}

export type ConversationStatus = "idle" | "streaming";

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ConversationDebugScenario =
  | "normal"
  | "block"
  | "interrupt"
  | "missing-completion"
  | "slow"
  | "provider-not-configured"
  | "provider-auth-failed"
  | "provider-rate-limited";
