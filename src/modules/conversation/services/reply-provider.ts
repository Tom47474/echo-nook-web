export type ReplyStreamEvent =
  | {
      type: "started";
      userMessageId: string;
      assistantMessageId: string;
      userSequence: number;
      assistantSequence: number;
    }
  | { type: "delta"; text: string }
  | { type: "completed" };

export interface ReplyProvider {
  /** 调用指定会话的持久化流式接口，逐项返回服务端 SSE 业务事件。 */
  streamReply(conversationId: string, message: string, signal: AbortSignal): AsyncIterable<ReplyStreamEvent>;
}
