import type { Message } from "../model/types";
import type { ReplyProvider } from "./reply-provider";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("已停止", "AbortError")); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("已停止", "AbortError")); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class DemoReplyProvider implements ReplyProvider {
  async *streamReply(history: Message[], signal: AbortSignal): AsyncIterable<string> {
    const question = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
    const answer = `我听到了你说的「${question}」。这里是 EchoNook 的前端演示回复：对话界面和流式展示已接通。等后端完成后，这里会换成真实的 AI 回答。`;
    for (const part of answer.match(/.{1,4}/gu) ?? []) {
      await sleep(45, signal);
      yield part;
    }
  }
}

export const replyProvider: ReplyProvider = new DemoReplyProvider();
