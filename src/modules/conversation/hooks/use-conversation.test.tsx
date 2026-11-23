// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationRequestError, createConversationError } from "../model/conversation-error";
import type { Message } from "../model/types";
import { useConversation } from "./use-conversation";

const providerState = vi.hoisted(() => ({
  streamReply: undefined as undefined | ((history: Message[], signal: AbortSignal) => AsyncIterable<string>),
}));

vi.mock("../services/http-reply-provider", () => ({
  replyProvider: {
    streamReply: (history: Message[], signal: AbortSignal) => providerState.streamReply?.(history, signal)
      ?? (async function* empty() {})(),
  },
}));

describe("useConversation", () => {
  beforeEach(() => {
    providerState.streamReply = undefined;
  });

  it("keeps a partial reply and its retryable error", async () => {
    providerState.streamReply = async function* stream() {
      yield "已经生成的部分";
      throw new ConversationRequestError(createConversationError("stream_interrupted", "连接中断"));
    };
    const { result } = renderHook(() => useConversation());

    await act(async () => { await result.current.send("测试问题"); });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: "已经生成的部分",
      status: "failed",
      error: { code: "stream_interrupted", retryable: true },
    });
  });

  it("retries in place without duplicating the user message", async () => {
    providerState.streamReply = async function* failedStream() {
      yield "旧内容";
      throw new ConversationRequestError(createConversationError("generation_failed", "临时失败"));
    };
    const { result } = renderHook(() => useConversation());
    await act(async () => { await result.current.send("原问题"); });
    const assistantId = result.current.messages[1].id;

    providerState.streamReply = async function* successfulStream() { yield "新的完整回答"; };
    await act(async () => { await result.current.retry(assistantId); });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({ role: "user", content: "原问题" });
    expect(result.current.messages[1]).toMatchObject({ id: assistantId, content: "新的完整回答", status: "completed" });
  });

  it("keeps received text and marks the reply cancelled when stopped", async () => {
    providerState.streamReply = async function* cancellableStream(_history, signal) {
      yield "停止前的内容";
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("已停止", "AbortError")), { once: true });
      });
    };
    const { result } = renderHook(() => useConversation());
    let sending!: Promise<boolean>;

    act(() => { sending = result.current.send("需要停止的问题"); });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe("停止前的内容"));
    act(() => { result.current.stop(); });
    await act(async () => { await sending; });

    expect(result.current.messages[1]).toMatchObject({ content: "停止前的内容", status: "cancelled" });
    expect(result.current.status).toBe("idle");
  });

  it("can start a new turn immediately after stopping without restoring stale state", async () => {
    let callCount = 0;
    providerState.streamReply = async function* stream(_history, signal) {
      callCount += 1;
      if (callCount === 1) {
        yield "第一条的部分内容";
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("已停止", "AbortError")), { once: true });
        });
        return;
      }
      yield "第二条的完整回答";
    };
    const { result } = renderHook(() => useConversation());
    let firstSending!: Promise<boolean>;
    let secondSending!: Promise<boolean>;

    act(() => { firstSending = result.current.send("第一条问题"); });
    await waitFor(() => expect(result.current.messages[1]?.content).toBe("第一条的部分内容"));
    act(() => {
      result.current.stop();
      secondSending = result.current.send("第二条问题");
    });
    await act(async () => { await Promise.all([firstSending, secondSending]); });

    expect(result.current.messages).toHaveLength(4);
    expect(result.current.messages[1].status).toBe("cancelled");
    expect(result.current.messages[3]).toMatchObject({ content: "第二条的完整回答", status: "completed" });
  });

  it("does not retry configuration errors", async () => {
    providerState.streamReply = async function* failedStream() {
      throw new ConversationRequestError(createConversationError("provider_not_configured", "缺少配置"));
    };
    const { result } = renderHook(() => useConversation());
    await act(async () => { await result.current.send("问题"); });
    const assistant = result.current.messages[1];

    let accepted = true;
    await act(async () => { accepted = await result.current.retry(assistant.id); });

    expect(accepted).toBe(false);
    expect(result.current.messages[1]).toMatchObject({ status: "failed", error: { retryable: false } });
  });
});
