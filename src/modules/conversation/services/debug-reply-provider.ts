import type { ConversationDebugScenario } from "../model/types";
import { ConversationRequestError, createConversationError } from "../model/conversation-error";
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
      const simulatedProviderErrors = {
        "provider-not-configured": createConversationError("provider_not_configured", "[调试] 服务端模型配置缺失。"),
        "provider-auth-failed": createConversationError("provider_auth_failed", "[调试] 模型服务鉴权失败。"),
        "provider-rate-limited": createConversationError("provider_rate_limited", "[调试] 模型服务请求过多，请稍后重试。"),
      } as const;
      if (scenario in simulatedProviderErrors) {
        throw new ConversationRequestError(simulatedProviderErrors[scenario as keyof typeof simulatedProviderErrors]);
      }
      if (scenario === "block") {
        throw new ConversationRequestError(createConversationError("network_error", "[调试] 已在发送前阻止 SSE 请求。"));
      }
      if (scenario === "missing-completion") {
        yield "这是用于测试缺少完成事件的模拟回复。";
        throw new ConversationRequestError(createConversationError("stream_interrupted", "回复连接意外中断，请重试。（调试：未收到完成事件）"));
      }

      let receivedLength = 0;
      for await (const part of source.streamReply(history, signal)) {
        if (scenario === "slow") await sleep(800, signal);
        receivedLength += part.length;
        yield part;
        if (scenario === "interrupt" && receivedLength >= 12) {
          throw new ConversationRequestError(createConversationError("stream_interrupted", "[调试] SSE 在收到部分消息后中断。"));
        }
      }
    },
  };
}
