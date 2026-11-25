import { describe, expect, it, vi } from "vitest";
import { HttpReplyProvider, readFrames } from "./http-reply-provider";

vi.mock("./identity-api", () => ({ ensureIdentity: vi.fn().mockResolvedValue({ kind: "guest" }) }));

function streamingResponse(frames: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      frames.forEach((frame) => controller.enqueue(encoder.encode(frame)));
      controller.close();
    },
  }), { status: 200 });
}

describe("readFrames", () => {
  it("keeps an incomplete SSE frame for the next network chunk", () => {
    const first = readFrames("event: message.delta\ndata: {\"text\":\"你");
    expect(first.frames).toEqual([]);

    const second = readFrames(first.rest + "好\"}\n\n");
    expect(second.frames).toEqual([{ event: "message.delta", data: "{\"text\":\"你好\"}" }]);
    expect(second.rest).toBe("");
  });
});

describe("HttpReplyProvider", () => {
  it("uses the persisted conversation endpoint and parses started, delta and completed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse([
      "event: message.started\ndata: {\"user_message_id\":\"u-1\",\"assistant_message_id\":\"a-1\",\"user_sequence\":\"4\",\"assistant_sequence\":\"5\"}\n\n",
      "event: message.delta\ndata: {\"text\":\"回答\"}\n\n",
      "event: message.completed\ndata: {}\n\n",
    ]));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const events = [];
      for await (const event of new HttpReplyProvider().streamReply("conversation/id", "问题", new AbortController().signal)) {
        events.push(event);
      }
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/conversations/conversation%2Fid/messages:stream"),
        expect.objectContaining({ body: JSON.stringify({ message: "问题" }) }),
      );
      expect(events).toEqual([
        { type: "started", userMessageId: "u-1", assistantMessageId: "a-1", userSequence: 4, assistantSequence: 5 },
        { type: "delta", text: "回答" },
        { type: "completed" },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("converts message.failed into a structured request error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(streamingResponse([
      "event: message.failed\ndata: {\"code\":\"provider_timeout\",\"message\":\"模型超时\"}\n\n",
    ])));

    try {
      const stream = new HttpReplyProvider().streamReply("conversation", "问题", new AbortController().signal);
      // 读取生成器才能触发 failed 事件。
      await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
        detail: { code: "provider_timeout", message: "模型超时", retryable: true },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a structured limit error from a non-streaming 429 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: { code: "conversation_daily_limit", message: "今日对话额度已用完" },
    }), { status: 429, headers: { "Content-Type": "application/json" } })));

    try {
      const stream = new HttpReplyProvider().streamReply("conversation", "问题", new AbortController().signal);
      await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
        detail: { code: "conversation_daily_limit", message: "今日对话额度已用完", retryable: false },
      });
    } finally {
      vi.unstubAllGlobals();
    }
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
      const stream = new HttpReplyProvider().streamReply("conversation", "问题", new AbortController().signal);
      const iterator = stream[Symbol.asyncIterator]();
      expect(await iterator.next()).toEqual({ value: { type: "delta", text: "片段" }, done: false });
      await iterator.return?.();
      expect(cancelled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
