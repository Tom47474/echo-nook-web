import { ConversationRequestError, createConversationError, normalizeErrorCode } from "../model/conversation-error";
import type { ReplyProvider, ReplyStreamEvent } from "./reply-provider";
import { ensureIdentity } from "./identity-api";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type StreamEvent = { event: string; data: string };

// SSE 帧可能跨多个网络数据块；只有读到空行，才能确认一个事件已经完整到达。
export function readFrames(buffer: string): { frames: StreamEvent[]; rest: string } {
  const frames: StreamEvent[] = [];
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let event = "message";
    const data: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) frames.push({ event, data: data.join("\n") });
  }
  return { frames, rest };
}

function parseFrame(frame: StreamEvent): ReplyStreamEvent | null {
  const payload = JSON.parse(frame.data) as Record<string, unknown>;
  if (frame.event === "message.started") {
    return {
      type: "started",
      userMessageId: String(payload.user_message_id),
      assistantMessageId: String(payload.assistant_message_id),
      userSequence: Number(payload.user_sequence),
      assistantSequence: Number(payload.assistant_sequence),
    };
  }
  if (frame.event === "message.delta") {
    return { type: "delta", text: String(payload.text ?? "") };
  }
  if (frame.event === "message.completed") return { type: "completed" };
  if (frame.event === "message.failed") {
    const code = normalizeErrorCode(payload.code);
    throw new ConversationRequestError(
      createConversationError(code, typeof payload.message === "string" ? payload.message : "回复生成失败，请重试。"),
    );
  }
  return null;
}

async function responseError(response: Response): Promise<ConversationRequestError> {
  /** 非 SSE 拒绝（例如 429）仍读取服务端 detail，不能统一降级成网络错误。 */
  const payload = await response.json().catch(() => null) as {
    detail?: { code?: unknown; message?: unknown };
  } | null;
  const code = normalizeErrorCode(payload?.detail?.code);
  const message = typeof payload?.detail?.message === "string"
    ? payload.detail.message
    : `服务端请求失败（${response.status}）。`;
  return new ConversationRequestError(createConversationError(code, message));
}

export class HttpReplyProvider implements ReplyProvider {
  /**
   * 只把本次输入发送给会话流式接口。历史上下文由服务端从数据库读取，
   * 浏览器不再提交可被篡改或与数据库不一致的 history。
   */
  async *streamReply(conversationId: string, message: string, signal: AbortSignal): AsyncIterable<ReplyStreamEvent> {
    await ensureIdentity();
    let response: Response;
    try {
      response = await fetch(
        `${apiBaseUrl.replace(/\/$/, "")}/api/v1/conversations/${encodeURIComponent(conversationId)}/messages:stream`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
          signal,
        },
      );
    } catch (cause) {
      if (signal.aborted) throw cause;
      throw new ConversationRequestError(
        createConversationError("network_error", "无法连接对话服务，请检查网络后重试。"),
      );
    }
    if (!response.ok || !response.body) {
      if (!response.ok) throw await responseError(response);
      throw new ConversationRequestError(createConversationError("network_error", "服务端未返回响应内容。"));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    let readerDone = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        readerDone = done;
        buffer += decoder.decode(value, { stream: !done });
        const parsed = readFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) {
          const event = parseFrame(frame);
          if (!event) continue;
          if (event.type === "completed") completed = true;
          yield event;
        }
        if (done || completed) break;
      }
    } catch (cause) {
      if (cause instanceof ConversationRequestError || signal.aborted) throw cause;
      throw new ConversationRequestError(
        createConversationError("stream_interrupted", "回复数据无法解析或连接已中断，请重试。"),
      );
    } finally {
      // 提前完成、停止或解析失败时主动取消响应体，让浏览器及时关闭 HTTP 连接。
      if (!readerDone && !signal.aborted) {
        try { await reader.cancel(); } catch { /* 响应体可能已经由浏览器关闭。 */ }
      }
      reader.releaseLock();
    }
    if (!completed && !signal.aborted) {
      throw new ConversationRequestError(
        createConversationError("stream_interrupted", "回复连接意外中断，请重试。"),
      );
    }
  }
}

export const replyProvider: ReplyProvider = new HttpReplyProvider();
