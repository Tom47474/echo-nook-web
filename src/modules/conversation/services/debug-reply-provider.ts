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
 * 用可重复的浏览器端故障包装真实 Provider。这里只改变事件转发行为，
 * 不改变服务端 HTTP 协议，并且只有通过服务端环境门禁后才会被页面挂载。
 */
export function createDebugReplyProvider(source: ReplyProvider, scenario: ConversationDebugScenario): ReplyProvider {
  return {
    async *streamReply(conversationId, message, signal) {
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
        yield { type: "delta" as const, text: "这是用于测试缺少完成事件的模拟回复。" };
        throw new ConversationRequestError(createConversationError("stream_interrupted", "回复连接意外中断，请重试。（调试：未收到完成事件）"));
      }

      let receivedLength = 0;
      for await (const event of source.streamReply(conversationId, message, signal)) {
        if (scenario === "slow") await sleep(800, signal);
        if (event.type === "delta") receivedLength += event.text.length;
        yield event;
        if (scenario === "interrupt" && receivedLength >= 12) {
          throw new ConversationRequestError(createConversationError("stream_interrupted", "[调试] SSE 在收到部分消息后中断。"));
        }
      }
    },
  };
}
