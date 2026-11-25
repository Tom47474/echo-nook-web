import { createConversationError, ConversationRequestError, normalizeErrorCode } from "../model/conversation-error";
import type { ConversationSummary, Message, MessageStatus } from "../model/types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ConversationDto = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageDto = {
  id: string;
  conversation_id: string;
  role: Message["role"];
  content: string;
  status: MessageStatus;
  sequence: number;
  error_code: string | null;
};

type ConversationListDto = { items: ConversationDto[] };
type MessagePageDto = { items: MessageDto[] };

function endpoint(path: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/api/v1${path}`;
}

function mapConversation(item: ConversationDto): ConversationSummary {
  return {
    id: item.id,
    title: item.title,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function failedMessageText(code: string): string {
  const messages: Record<string, string> = {
    generation_interrupted: "服务上次异常退出，回复没有完整生成。",
    provider_not_configured: "服务端模型尚未配置。",
    provider_auth_failed: "模型服务鉴权失败。",
    model_not_available: "模型或接入点不可用。",
    provider_rate_limited: "模型服务请求过多，请稍后重试。",
    provider_timeout: "模型服务响应超时。",
    provider_unreachable: "无法连接模型服务。",
  };
  return messages[code] ?? "回复生成失败，请重试。";
}

/** 把服务端 DTO 转成页面消息，并按相邻 sequence 还原用户/助手回合关系。 */
function mapMessages(items: MessageDto[]): Message[] {
  let currentTurnId = "";
  return items.map((item) => {
    if (item.role === "user") currentTurnId = item.id;
    const errorCode = item.error_code ? normalizeErrorCode(item.error_code) : null;
    return {
      id: item.id,
      turnId: currentTurnId || item.id,
      conversationId: item.conversation_id,
      sequence: item.sequence,
      role: item.role,
      content: item.content,
      status: item.status,
      error: item.status === "failed"
        ? createConversationError(errorCode ?? "generation_failed", failedMessageText(item.error_code ?? ""))
        : undefined,
    };
  });
}

async function ensureOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  let message = fallback;
  try {
    const payload = await response.json() as { detail?: { message?: string } };
    message = payload.detail?.message ?? message;
  } catch { /* 非 JSON 错误仍使用面向用户的回退说明。 */ }
  throw new ConversationRequestError(createConversationError("network_error", message));
}

/** 会话 REST API 集中放在适配层，组件和 Hook 不直接拼接 URL 或解析 snake_case。 */
export const conversationApi = {
  async list(signal?: AbortSignal): Promise<ConversationSummary[]> {
    const response = await fetch(endpoint("/conversations?offset=0&limit=100"), { signal });
    await ensureOk(response, "加载会话列表失败。");
    const payload = await response.json() as ConversationListDto;
    return payload.items.map(mapConversation);
  },

  async get(conversationId: string, signal?: AbortSignal): Promise<ConversationSummary | null> {
    // 404 表示链接指向已删除的会话；422 表示 URL ID 格式错误。其他错误交给页面显示。
    const response = await fetch(endpoint(`/conversations/${encodeURIComponent(conversationId)}`), { signal });
    if (response.status === 404 || response.status === 422) return null;
    await ensureOk(response, "加载指定会话失败。");
    return mapConversation(await response.json() as ConversationDto);
  },

  async create(title = "新对话"): Promise<ConversationSummary> {
    const response = await fetch(endpoint("/conversations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await ensureOk(response, "创建会话失败。");
    return mapConversation(await response.json() as ConversationDto);
  },

  async messages(conversationId: string, signal?: AbortSignal): Promise<Message[]> {
    // S3-1 先读取最近 100 条；S3-3 再使用 before_sequence 实现向上翻页。
    const response = await fetch(
      endpoint(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`),
      { signal },
    );
    await ensureOk(response, "加载会话消息失败。");
    const payload = await response.json() as MessagePageDto;
    return mapMessages(payload.items);
  },

  async delete(conversationId: string): Promise<void> {
    const response = await fetch(endpoint(`/conversations/${encodeURIComponent(conversationId)}`), {
      method: "DELETE",
    });
    await ensureOk(response, "删除会话失败。");
  },
};
