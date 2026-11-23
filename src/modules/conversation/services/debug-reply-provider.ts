import type { ConversationDebugScenario } from "../model/types";
import type { ReplyProvider } from "./reply-provider";

const sleep = (duration: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) {
    reject(new DOMException("已停止", "AbortError"));
    return;
  }
  const onAbort = () => {
    window.clearTimeout(timer);
    reject(new DOMException("已停止", "AbortError"));
  };
  const timer = window.setTimeout(() => {
    signal.removeEventListener("abort", onAbort);
    resolve();
  }, duration);
  signal.addEventListener("abort", onAbort, { once: true });
});

/**
 * Wraps the real provider with deterministic browser-side faults. This module
 * never changes the HTTP contract and is mounted only after the server-side
 * environment gate has explicitly enabled conversation debugging.
 */
export function createDebugReplyProvider(source: ReplyProvider, scenario: ConversationDebugScenario): ReplyProvider {
  return {
    async *streamReply(history, signal) {
      if (scenario === "block") {
        throw new Error("[调试] 已在发送前阻止 SSE 请求。");
      }
      if (scenario === "missing-completion") {
        yield "这是用于测试缺少完成事件的模拟回复。";
        throw new Error("回复连接意外中断，请重试。（调试：未收到完成事件）");
      }

      let receivedLength = 0;
      for await (const part of source.streamReply(history, signal)) {
        if (scenario === "slow") await sleep(800, signal);
        receivedLength += part.length;
        yield part;
        if (scenario === "interrupt" && receivedLength >= 12) {
          throw new Error("[调试] SSE 在收到部分消息后中断。");
        }
      }
    },
  };
}
