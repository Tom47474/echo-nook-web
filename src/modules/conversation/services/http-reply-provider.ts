import type { Message } from "../model/types";
import type { ReplyProvider } from "./reply-provider";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type StreamEvent = { event: string; data: string };

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
    const previous = history.slice(0, -1)
      .filter((item) => item.status === "completed" && item.content.trim())
      .slice(-20)
      .map(({ role, content }) => ({ role, content }));
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/v1/conversations/messages:stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: latest.content, history: previous }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`服务端请求失败（${response.status}）。`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const parsed = readFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) {
          if (frame.event === "message.delta") {
            const payload = JSON.parse(frame.data) as { text: string };
            yield payload.text;
          } else if (frame.event === "message.failed") {
            const payload = JSON.parse(frame.data) as { message?: string };
            throw new Error(payload.message ?? "回复生成失败，请重试。");
          } else if (frame.event === "message.completed") {
            completed = true;
          }
        }
        if (done || completed) break;
      }
    } finally {
      reader.releaseLock();
    }
    if (!completed && !signal.aborted) throw new Error("回复连接意外中断，请重试。");
  }
}

export const replyProvider: ReplyProvider = new HttpReplyProvider();
