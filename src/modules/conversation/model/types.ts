export type MessageRole = "user" | "assistant";
export type MessageStatus = "streaming" | "completed" | "cancelled";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
}

export type ConversationStatus = "idle" | "streaming";

export type ConversationDebugScenario = "normal" | "block" | "interrupt" | "missing-completion" | "slow";
