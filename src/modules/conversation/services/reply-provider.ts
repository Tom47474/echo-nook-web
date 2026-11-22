import type { Message } from "../model/types";

export interface ReplyProvider {
  streamReply(history: Message[], signal: AbortSignal): AsyncIterable<string>;
}
