import { describe, expect, it, vi } from "vitest";
import type { Message, MessageStatus } from "../model/types";
import { buildPreviousContext, HttpReplyProvider } from "./http-reply-provider";

function message(turnId: string, role: Message["role"], content: string, status: MessageStatus = "completed"): Message {
  return { id: `${turnId}-${role}`, turnId, role, content, status };
}

describe("buildPreviousContext", () => {
  it("keeps partial stopped and failed replies with an interruption marker", () => {
    const history = [
      message("one", "user", "第一个问题"),
      message("one", "assistant", "部分回答", "cancelled"),
      message("two", "user", "第二个问题"),
      message("two", "assistant", "失败前的内容", "failed"),
      message("current", "user", "继续"),
    ];

    expect(buildPreviousContext(history)).toEqual([
      { role: "user", content: "第一个问题" },
      { role: "assistant", content: "部分回答\n\n[系统注记：这条回复未完整生成。]" },
      { role: "user", content: "第二个问题" },
      { role: "assistant", content: "失败前的内容\n\n[系统注记：这条回复未完整生成。]" },
    ]);
  });

  it("keeps complete turns when applying the 20-message limit", () => {
    const history: Message[] = [];
    for (let index = 1; index <= 11; index += 1) {
      history.push(message(`turn-${index}`, "user", `问题 ${index}`));
      history.push(message(`turn-${index}`, "assistant", `回答 ${index}`));
    }
    history.push(message("current", "user", "当前问题"));

    const context = buildPreviousContext(history);
    expect(context).toHaveLength(20);
    expect(context[0]).toEqual({ role: "user", content: "问题 2" });
    expect(context.at(-1)).toEqual({ role: "assistant", content: "回答 11" });
  });

  it("ignores standalone assistant messages created by the debug panel", () => {
    const history = [
      message("debug", "assistant", "本地注入消息"),
      message("current", "user", "真实问题"),
    ];

    expect(buildPreviousContext(history)).toEqual([]);
  });

  it("cancels the response body when a consumer stops reading early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: message.delta\ndata: {\"text\":\"片段\"}\n\n"));
      },
      cancel() { cancelled = true; },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));

    try {
      const provider = new HttpReplyProvider();
      const stream = provider.streamReply([message("current", "user", "问题")], new AbortController().signal);
      const iterator = stream[Symbol.asyncIterator]();
      expect(await iterator.next()).toEqual({ value: "片段", done: false });
      await iterator.return?.();
      expect(cancelled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
