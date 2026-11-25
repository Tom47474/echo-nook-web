// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationRequestError, createConversationError } from "../model/conversation-error";
import type { ConversationSummary, Message } from "../model/types";
import type { ReplyStreamEvent } from "../services/reply-provider";
import { useConversation } from "./use-conversation";

const state = vi.hoisted(() => ({
  conversations: [] as ConversationSummary[],
  messages: new Map<string, Message[]>(),
  streamReply: undefined as undefined | ((conversationId: string, message: string, signal: AbortSignal) => AsyncIterable<ReplyStreamEvent>),
  delete: vi.fn(),
  get: vi.fn(),
}));

vi.mock("../services/conversation-api", () => ({
  conversationApi: {
    list: vi.fn(async () => state.conversations),
    get: (conversationId: string) => state.get(conversationId),
    messages: vi.fn(async (conversationId: string) => state.messages.get(conversationId) ?? []),
    create: vi.fn(async () => ({ id: "new-conversation", title: "新对话", createdAt: "2026-11-24", updatedAt: "2026-11-24" })),
    delete: (conversationId: string) => state.delete(conversationId),
  },
}));

vi.mock("../services/http-reply-provider", () => ({
  replyProvider: {
    streamReply: (conversationId: string, message: string, signal: AbortSignal) => state.streamReply?.(conversationId, message, signal)
      ?? (async function* empty() { yield { type: "completed" as const }; })(),
  },
}));

const conversationA: ConversationSummary = {
  id: "conversation-a",
  title: "会话 A",
  createdAt: "2026-11-24T00:00:00Z",
  updatedAt: "2026-11-24T00:00:00Z",
};

const conversationB: ConversationSummary = {
  id: "conversation-b",
  title: "会话 B",
  createdAt: "2026-11-24T00:00:00Z",
  updatedAt: "2026-11-24T00:00:00Z",
};

async function renderLoadedHook() {
  const hook = renderHook(() => useConversation());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useConversation", () => {
  beforeEach(() => {
    state.conversations = [conversationA];
    state.messages = new Map([[conversationA.id, []]]);
    state.streamReply = undefined;
    state.delete.mockReset().mockResolvedValue(undefined);
    state.get.mockReset().mockImplementation(async (id: string) => state.conversations.find((item) => item.id === id) ?? null);
    window.history.replaceState(null, "", "/");
  });

  it("loads the newest server conversation and its messages", async () => {
    const stored: Message = {
      id: "stored-user",
      turnId: "stored-user",
      conversationId: conversationA.id,
      sequence: 0,
      role: "user",
      content: "数据库消息",
      status: "completed",
    };
    state.messages.set(conversationA.id, [stored]);

    const { result } = await renderLoadedHook();

    expect(result.current.activeConversationId).toBe(conversationA.id);
    expect(result.current.messages).toEqual([stored]);
  });

  it("replaces optimistic ids from message.started and keeps a partial failure", async () => {
    state.streamReply = async function* stream() {
      yield {
        type: "started",
        userMessageId: "server-user",
        assistantMessageId: "server-assistant",
        userSequence: 0,
        assistantSequence: 1,
      };
      yield { type: "delta", text: "已经生成的部分" };
      throw new ConversationRequestError(createConversationError("stream_interrupted", "连接中断"));
    };
    const { result } = await renderLoadedHook();

    await act(async () => { await result.current.send("测试问题"); });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ id: "server-user", sequence: 0 });
    expect(result.current.messages[1]).toMatchObject({
      id: "server-assistant",
      sequence: 1,
      content: "已经生成的部分",
      status: "failed",
      error: { code: "stream_interrupted", retryable: true },
    });
  });

  it("keeps received text and marks the reply cancelled when stopped", async () => {
    state.streamReply = async function* stream(_conversationId, _message, signal) {
      yield { type: "delta", text: "停止前的内容" };
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("已停止", "AbortError")), { once: true });
      });
    };
    const { result } = await renderLoadedHook();
    let sending!: Promise<boolean>;

    act(() => { sending = result.current.send("需要停止的问题"); });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe("停止前的内容"));
    act(() => { result.current.stop(); });
    await act(async () => { await sending; });

    expect(result.current.messages[1]).toMatchObject({ content: "停止前的内容", status: "cancelled" });
    expect(result.current.status).toBe("idle");
  });

  it("aborts the old stream when switching and ignores its late result", async () => {
    state.conversations = [conversationA, conversationB];
    const targetMessage: Message = {
      id: "b-user",
      turnId: "b-user",
      conversationId: conversationB.id,
      sequence: 0,
      role: "user",
      content: "B 的历史",
      status: "completed",
    };
    state.messages.set(conversationB.id, [targetMessage]);
    let releaseOld!: () => void;
    state.streamReply = async function* stream() {
      yield { type: "delta", text: "A 的部分回答" };
      await new Promise<void>((resolve) => { releaseOld = resolve; });
      yield { type: "delta", text: "不应进入 B" };
      yield { type: "completed" };
    };
    const { result } = await renderLoadedHook();
    let sending!: Promise<boolean>;

    act(() => { sending = result.current.send("A 的问题"); });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe("A 的部分回答"));
    await act(async () => { await result.current.selectConversation(conversationB.id); });
    act(() => { releaseOld(); });
    await act(async () => { await sending; });

    expect(result.current.activeConversationId).toBe(conversationB.id);
    expect(result.current.messages).toEqual([targetMessage]);
  });

  it("deletes the active conversation and selects the next one", async () => {
    state.conversations = [conversationA, conversationB];
    state.messages.set(conversationB.id, []);
    const { result } = await renderLoadedHook();

    await act(async () => { await result.current.deleteConversation(conversationA.id); });

    expect(state.delete).toHaveBeenCalledWith(conversationA.id);
    expect(result.current.conversations.map((item) => item.id)).toEqual([conversationB.id]);
    expect(result.current.activeConversationId).toBe(conversationB.id);
    expect(new URL(window.location.href).searchParams.get("conversation")).toBe(conversationB.id);
  });

  it("restores a linked conversation even when it is absent from the first list page", async () => {
    window.history.replaceState(null, "", `/?conversation=${conversationB.id}`);
    state.get.mockResolvedValue(conversationB);
    const stored: Message = { id: "b-user", turnId: "b-user", role: "user", content: "旧记录", status: "completed" };
    state.messages.set(conversationB.id, [stored]);

    const { result } = await renderLoadedHook();

    expect(result.current.activeConversationId).toBe(conversationB.id);
    expect(result.current.messages).toEqual([stored]);
    expect(result.current.conversations.map((item) => item.id)).toContain(conversationB.id);
  });

  it("replaces a missing link with the newest conversation and shows a warning", async () => {
    window.history.replaceState(null, "", "/?conversation=deleted-id&theme=dark#chat");
    const { result } = await renderLoadedHook();

    expect(result.current.activeConversationId).toBe(conversationA.id);
    expect(result.current.operationError).toContain("不存在");
    expect(window.location.search).toContain(`conversation=${conversationA.id}`);
    expect(window.location.search).toContain("theme=dark");
    expect(window.location.hash).toBe("#chat");
  });

  it("follows browser back navigation after switching conversations", async () => {
    state.conversations = [conversationA, conversationB];
    const { result } = await renderLoadedHook();
    await act(async () => { await result.current.selectConversation(conversationB.id); });
    expect(window.location.search).toContain(conversationB.id);

    act(() => { window.history.replaceState(null, "", `/?conversation=${conversationA.id}`); window.dispatchEvent(new PopStateEvent("popstate")); });
    await waitFor(() => expect(result.current.activeConversationId).toBe(conversationA.id));
  });

  it("keeps the deep link when its lookup fails instead of treating it as deleted", async () => {
    window.history.replaceState(null, "", `/?conversation=${conversationB.id}`);
    state.get.mockRejectedValue(new Error("服务暂时不可用"));

    const { result } = await renderLoadedHook();

    expect(result.current.activeConversationId).toBeNull();
    expect(result.current.operationError).toContain("服务暂时不可用");
    expect(window.location.search).toContain(conversationB.id);
  });

  it("ignores a late URL lookup after the user explicitly switches conversations", async () => {
    state.conversations = [conversationA, conversationB];
    const { result } = await renderLoadedHook();
    let finishLookup!: (value: ConversationSummary) => void;
    state.get.mockImplementation((id: string) => id === conversationB.id
      ? new Promise<ConversationSummary>((resolve) => { finishLookup = resolve; })
      : Promise.resolve(conversationA));

    act(() => {
      window.history.replaceState(null, "", `/?conversation=${conversationB.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => { await result.current.selectConversation(conversationB.id); });
    await act(async () => { await result.current.selectConversation(conversationA.id); });
    await act(async () => { finishLookup(conversationB); });

    expect(result.current.activeConversationId).toBe(conversationA.id);
    expect(window.location.search).toContain(conversationA.id);
  });
});
