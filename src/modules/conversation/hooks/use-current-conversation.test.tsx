// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Message } from "../model/types";
import { useCurrentConversation } from "./use-current-conversation";

const state = vi.hoisted(() => ({
  current: vi.fn(), messages: vi.fn(), clear: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("../services/conversation-api", () => ({ conversationApi: {
  current: state.current, messages: state.messages, clearCurrent: state.clear,
} }));
vi.mock("../services/http-reply-provider", () => ({ replyProvider: { streamReply: state.stream } }));

const guestMessage: Message = {
  id: "guest-message", turnId: "guest-message", conversationId: "guest-window",
  sequence: 0, role: "user", content: "游客内容", status: "completed",
};

afterEach(() => { vi.clearAllMocks(); });

it("loads only the current identity window and its stored messages", async () => {
  state.current.mockResolvedValue({ id: "guest-window" });
  state.messages.mockResolvedValue({ items: [guestMessage], hasMore: false, nextBeforeSequence: null });
  const { result } = renderHook(() => useCurrentConversation());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.conversationId).toBe("guest-window");
  expect(result.current.messages[0].content).toBe("游客内容");
  expect(state.current).toHaveBeenCalledOnce();
});

it("clears the current window and removes its local messages", async () => {
  state.current.mockResolvedValue({ id: "guest-window" });
  state.messages.mockResolvedValue({ items: [guestMessage], hasMore: false, nextBeforeSequence: null });
  state.clear.mockResolvedValue(undefined);
  const { result } = renderHook(() => useCurrentConversation());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { expect(await result.current.clear()).toBe(true); });
  expect(state.clear).toHaveBeenCalledOnce();
  expect(result.current.messages).toEqual([]);
});

it("keeps server messages when clearing fails", async () => {
  state.current.mockResolvedValue({ id: "guest-window" });
  state.messages.mockResolvedValue({ items: [guestMessage], hasMore: false, nextBeforeSequence: null });
  state.clear.mockRejectedValue(new Error("清空失败"));
  const { result } = renderHook(() => useCurrentConversation());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { expect(await result.current.clear()).toBe(false); });
  expect(result.current.messages[0].content).toBe("游客内容");
  expect(result.current.operationError).toBeTruthy();
});

it("reconciles optimistic messages with server ids in the single window", async () => {
  state.current.mockResolvedValue({ id: "guest-window" });
  state.messages.mockResolvedValue({ items: [], hasMore: false, nextBeforeSequence: null });
  state.stream.mockImplementation(async function* () {
    yield { type: "started", userMessageId: "user-db", assistantMessageId: "assistant-db", userSequence: 0, assistantSequence: 1 };
    yield { type: "delta", text: "服务端回答" };
    yield { type: "completed" };
  });
  const { result } = renderHook(() => useCurrentConversation());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { expect(await result.current.send("你好")).toBe(true); });
  expect(result.current.messages.map((item) => item.id)).toEqual(["user-db", "assistant-db"]);
  expect(result.current.messages[1]).toMatchObject({ content: "服务端回答", status: "completed" });
  expect(state.stream).toHaveBeenCalledWith("guest-window", "你好", expect.any(AbortSignal));
});
