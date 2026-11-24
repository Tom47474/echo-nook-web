import type { ReplyProvider, ReplyStreamEvent } from "./reply-provider";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("已停止", "AbortError")); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("已停止", "AbortError")); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class DemoReplyProvider implements ReplyProvider {
  /** 离线演示也遵循正式 Provider 的事件协议，便于替换真实实现。 */
  async *streamReply(_conversationId: string, message: string, signal: AbortSignal): AsyncIterable<ReplyStreamEvent> {
    const answer = `我听到了你说的「${message}」。这里是 EchoNook 的前端演示回复。`;
    for (const part of answer.match(/.{1,4}/gu) ?? []) {
      await sleep(45, signal);
      yield { type: "delta", text: part };
    }
    yield { type: "completed" };
  }
}

export const replyProvider: ReplyProvider = new DemoReplyProvider();
