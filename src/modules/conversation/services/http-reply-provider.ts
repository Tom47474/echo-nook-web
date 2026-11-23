import type { Message } from "../model/types";
import { ConversationRequestError, createConversationError, normalizeErrorCode } from "../model/conversation-error";
import type { ReplyProvider } from "./reply-provider";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type StreamEvent = { event: string; data: string };

type RequestMessage = Pick<Message, "role" | "content">;

const interruptedSuffix = "\n\n[系统注记：这条回复未完整生成。]";

function toContextTurn(turn: Message[]): RequestMessage[] {
  const user = turn.find((item) => item.role === "user" && item.content.trim());
  if (!user) return [];

  const result: RequestMessage[] = [{ role: "user", content: user.content }];
  const assistant = [...turn].reverse().find((item) => item.role === "assistant" && item.content.trim());
  if (!assistant || assistant.status === "streaming") return result;
  result.push({
    role: "assistant",
    content: assistant.status === "completed" ? assistant.content : assistant.content + interruptedSuffix,
  });
  return result;
}

/**
 * Keeps whole turns within the server's 20-message limit. Failed or cancelled
 * partial replies are included with an internal marker so a later follow-up
 * sees the same text the user saw without treating it as a complete answer.
 */
export function buildPreviousContext(history: Message[]): RequestMessage[] {
  const turns = new Map<string, Message[]>();
  for (const item of history.slice(0, -1)) {
    const turn = turns.get(item.turnId) ?? [];
    turn.push(item);
    turns.set(item.turnId, turn);
  }

  const selected: RequestMessage[][] = [];
  let count = 0;
  for (const turn of [...turns.values()].reverse()) {
    const contextTurn = toContextTurn(turn);
    if (!contextTurn.length) continue;
    if (count + contextTurn.length > 20) break;
    selected.unshift(contextTurn);
    count += contextTurn.length;
  }
  return selected.flat();
}

// SSE 帧可能跨多个网络数据块；只在读到空行时才解析完整事件。
function readFrames(buffer: string): { frames: StreamEvent[]; rest: string } {
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

export class HttpReplyProvider implements ReplyProvider {
  async *streamReply(history: Message[], signal: AbortSignal): AsyncIterable<string> {
    const latest = history.at(-1);
    if (!latest || latest.role !== "user") throw new Error("没有可发送的消息。");

    // 后端只接受最近 20 条历史，且本次输入单独放在 message 字段。
    const previous = buildPreviousContext(history);
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/conversations/messages:stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: latest.content, history: previous }),
        signal,
      });
    } catch (cause) {
      if (signal.aborted) throw cause;
      throw new ConversationRequestError(createConversationError("network_error", "无法连接对话服务，请检查网络后重试。"));
    }
    if (!response.ok || !response.body) {
      throw new ConversationRequestError(createConversationError("network_error", `服务端请求失败（${response.status}）。`));
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
          if (frame.event === "message.delta") {
            const payload = JSON.parse(frame.data) as { text: string };
            yield payload.text;
          } else if (frame.event === "message.failed") {
            const payload = JSON.parse(frame.data) as { code?: string; message?: string };
            const code = normalizeErrorCode(payload.code);
            throw new ConversationRequestError(createConversationError(code, payload.message ?? "回复生成失败，请重试。"));
          } else if (frame.event === "message.completed") {
            completed = true;
          }
        }
        if (done || completed) break;
      }
    } catch (cause) {
      if (cause instanceof ConversationRequestError || signal.aborted) throw cause;
      throw new ConversationRequestError(createConversationError("stream_interrupted", "回复数据无法解析或连接已中断，请重试。"));
    } finally {
      // releaseLock() alone does not stop the response body. Early exits must
      // cancel it so the browser can close the HTTP connection promptly.
      if (!readerDone && !signal.aborted) {
        try { await reader.cancel(); } catch { /* The body may already be closed. */ }
      }
      reader.releaseLock();
    }
    if (!completed && !signal.aborted) {
      throw new ConversationRequestError(createConversationError("stream_interrupted", "回复连接意外中断，请重试。"));
    }
  }
}

export const replyProvider: ReplyProvider = new HttpReplyProvider();
