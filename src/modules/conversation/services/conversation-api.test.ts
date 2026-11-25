import { afterEach, describe, expect, it, vi } from "vitest";
import { conversationApi } from "./conversation-api";

describe("conversationApi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps the conversation list from server snake_case fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: "conversation-1",
        title: "测试会话",
        created_at: "2026-11-24T01:00:00Z",
        updated_at: "2026-11-24T02:00:00Z",
      }],
      total: 1,
      offset: 0,
      limit: 100,
    }), { status: 200 })));

    await expect(conversationApi.list()).resolves.toEqual([{
      id: "conversation-1",
      title: "测试会话",
      createdAt: "2026-11-24T01:00:00Z",
      updatedAt: "2026-11-24T02:00:00Z",
    }]);
  });

  it("restores turn ids, sequence and failed error information from stored messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [
        {
          id: "user-1",
          conversation_id: "conversation-1",
          role: "user",
          content: "问题",
          status: "completed",
          sequence: 2,
          error_code: null,
        },
        {
          id: "assistant-1",
          conversation_id: "conversation-1",
          role: "assistant",
          content: "部分回答",
          status: "failed",
          sequence: 3,
          error_code: "provider_timeout",
        },
      ],
      limit: 100,
      has_more: false,
      next_before_sequence: null,
    }), { status: 200 })));

    const page = await conversationApi.messages("conversation-1");
    const messages = page.items;

    expect(page).toMatchObject({ hasMore: false, nextBeforeSequence: null });

    expect(messages[0]).toMatchObject({ id: "user-1", turnId: "user-1", sequence: 2 });
    expect(messages[1]).toMatchObject({
      id: "assistant-1",
      turnId: "user-1",
      sequence: 3,
      status: "failed",
      error: { code: "provider_timeout", retryable: true },
    });
  });

  it("uses DELETE for conversation removal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await conversationApi.delete("conversation/1");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/conversations/conversation%2F1"),
      { method: "DELETE" },
    );
  });

  it("distinguishes missing direct links from request failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 })));

    await expect(conversationApi.get("deleted-id")).resolves.toBeNull();
    await expect(conversationApi.get("offline-id")).rejects.toThrow("加载指定会话失败");
  });

  it("passes before_sequence and maps the next cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [], limit: 50, has_more: true, next_before_sequence: 20,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await conversationApi.messages("conversation-1", undefined, 70);

    expect(page).toEqual({ items: [], hasMore: true, nextBeforeSequence: 20 });
    expect(fetchMock.mock.calls[0][0]).toContain("limit=50&before_sequence=70");
  });
});
