"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toConversationError } from "../model/conversation-error";
import type { ConversationDebugScenario, ConversationStatus, Message } from "../model/types";
import { conversationApi } from "../services/conversation-api";
import { createDebugReplyProvider } from "../services/debug-reply-provider";
import { replyProvider } from "../services/http-reply-provider";

/** 当前身份只有一个窗口：消息持久化在服务端，切换身份时整个 Hook 重新挂载。 */
export function useCurrentConversation({ debugEnabled = false }: { debugEnabled?: boolean } = {}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [debugScenario, setDebugScenario] = useState<ConversationDebugScenario>("normal");
  const messagesRef = useRef<Message[]>([]);
  const streamRef = useRef<AbortController | null>(null);
  const pageRef = useRef<AbortController | null>(null);
  const cursorRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const activeRef = useRef(false);

  const commitMessages = useCallback((next: Message[] | ((old: Message[]) => Message[])) => {
    const value = typeof next === "function" ? next(messagesRef.current) : next;
    messagesRef.current = value;
    setMessages(value);
  }, []);

  const stitchTurns = useCallback((items: Message[]) => {
    let turnId = "";
    return items.map((item) => {
      if (item.role === "user") turnId = item.id;
      return { ...item, turnId: turnId || item.id };
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const current = await conversationApi.current(controller.signal);
        const page = await conversationApi.messages(current.id, controller.signal);
        if (controller.signal.aborted) return;
        setConversationId(current.id);
        commitMessages(stitchTurns(page.items));
        cursorRef.current = page.nextBeforeSequence;
        setHasMore(page.hasMore);
      } catch (cause) {
        if (!controller.signal.aborted) setOperationError(toConversationError(cause).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      // 身份切换时关闭上一身份的读取和模型流，迟到的回调不能写入新工作区。
      controller.abort();
      pageRef.current?.abort();
      streamRef.current?.abort();
    };
  }, [commitMessages, stitchTurns]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    streamRef.current?.abort();
    streamRef.current = null;
    activeRef.current = false;
    setStatus("idle");
    commitMessages((old) => old.map((item) => item.status === "streaming"
      ? { ...item, status: "cancelled", error: undefined } : item));
  }, [commitMessages]);

  const loadOlder = useCallback(async (): Promise<boolean> => {
    const before = cursorRef.current;
    if (!conversationId || before === null || pageRef.current || loading) return false;
    const controller = new AbortController();
    pageRef.current = controller;
    setLoadingMore(true);
    setOlderError(null);
    try {
      const page = await conversationApi.messages(conversationId, controller.signal, before);
      if (controller.signal.aborted) return false;
      const known = new Set(messagesRef.current.map((item) => item.id));
      const older = page.items.filter((item) => !known.has(item.id));
      commitMessages(stitchTurns([...older, ...messagesRef.current]));
      cursorRef.current = page.nextBeforeSequence;
      setHasMore(page.hasMore);
      return older.length > 0;
    } catch (cause) {
      if (!controller.signal.aborted) setOlderError(toConversationError(cause).message);
      return false;
    } finally {
      if (pageRef.current === controller) pageRef.current = null;
      setLoadingMore(false);
    }
  }, [commitMessages, conversationId, loading, stitchTurns]);

  const clear = useCallback(async (): Promise<boolean> => {
    if (!conversationId || loading) return false;
    // 先断开当前 SSE，再清空服务端；如果清空失败，重新读取服务器真值。
    stop();
    pageRef.current?.abort();
    setLoading(true);
    setOperationError(null);
    try {
      await conversationApi.clearCurrent();
      commitMessages([]);
      cursorRef.current = null;
      setHasMore(false);
      return true;
    } catch (cause) {
      setOperationError(toConversationError(cause).message);
      try {
        const page = await conversationApi.messages(conversationId);
        commitMessages(stitchTurns(page.items));
        cursorRef.current = page.nextBeforeSequence;
        setHasMore(page.hasMore);
      } catch { /* 保留清空失败提示，下一次刷新仍可恢复服务端内容。 */ }
      return false;
    } finally {
      setLoading(false);
    }
  }, [commitMessages, conversationId, loading, stitchTurns, stop]);

  const send = useCallback(async (raw: string): Promise<boolean> => {
    const content = raw.trim();
    if (!content || !conversationId || loading || activeRef.current) return false;
    const turnId = crypto.randomUUID();
    const user: Message = { id: crypto.randomUUID(), turnId, conversationId, role: "user", content, status: "completed" };
    const assistant: Message = { id: crypto.randomUUID(), turnId, conversationId, role: "assistant", content: "", status: "streaming" };
    commitMessages((old) => [...old, user, assistant]);
    activeRef.current = true;
    setStatus("streaming");
    setOperationError(null);
    const version = ++generationRef.current;
    const controller = new AbortController();
    streamRef.current = controller;
    let assistantId = assistant.id;
    let completed = false;
    try {
      const provider = debugEnabled ? createDebugReplyProvider(replyProvider, debugScenario) : replyProvider;
      for await (const event of provider.streamReply(conversationId, content, controller.signal)) {
        if (controller.signal.aborted || generationRef.current !== version) break;
        if (event.type === "started") {
          assistantId = event.assistantMessageId;
          // 服务端正式 UUID/sequence 替换乐观消息，刷新后不会出现重复回合。
          commitMessages((old) => old.map((item) => item.id === user.id
            ? { ...item, id: event.userMessageId, turnId: event.userMessageId, sequence: event.userSequence }
            : item.id === assistant.id
              ? { ...item, id: event.assistantMessageId, turnId: event.userMessageId, sequence: event.assistantSequence }
              : item));
        } else if (event.type === "delta") {
          commitMessages((old) => old.map((item) => item.id === assistantId
            ? { ...item, content: item.content + event.text } : item));
        } else if (event.type === "completed") {
          completed = true;
          commitMessages((old) => old.map((item) => item.id === assistantId
            ? { ...item, status: "completed", error: undefined } : item));
        }
      }
      if (!completed && !controller.signal.aborted && generationRef.current === version) throw new Error("回复连接意外中断，请重试。");
    } catch (cause) {
      if (!controller.signal.aborted && generationRef.current === version) {
        const error = toConversationError(cause);
        commitMessages((old) => old.map((item) => item.id === assistantId
          ? { ...item, status: "failed", error } : item));
      }
    } finally {
      if (streamRef.current === controller) {
        streamRef.current = null;
        activeRef.current = false;
        setStatus("idle");
      }
    }
    return true;
  }, [commitMessages, conversationId, debugEnabled, debugScenario, loading]);

  const retry = useCallback((assistantId: string) => {
    const current = messagesRef.current;
    const assistant = current.find((item) => item.id === assistantId && item.role === "assistant");
    const latest = [...current].reverse().find((item) => item.role === "assistant");
    if (!assistant || latest?.id !== assistantId || assistant.status === "streaming" || activeRef.current
      || (assistant.status === "failed" && !assistant.error?.retryable)) return;
    const user = current.find((item) => item.turnId === assistant.turnId && item.role === "user");
    if (user) void send(user.content);
  }, [send]);

  const insertDebugMessage = useCallback((role: Message["role"], content: string, messageStatus: Message["status"] = "completed") => {
    if (!debugEnabled || activeRef.current) return;
    const id = crypto.randomUUID();
    commitMessages((old) => [...old, { id, turnId: id, conversationId: conversationId ?? undefined, role, content, status: messageStatus }]);
  }, [commitMessages, conversationId, debugEnabled]);

  return {
    conversationId, messages, status, loading, loadingMore, hasMore, olderError, loadOlder,
    operationError, send, retry, stop, clear,
    debug: debugEnabled ? {
      scenario: debugScenario, setScenario: setDebugScenario, insertMessage: insertDebugMessage,
      reset: () => { stop(); commitMessages([]); setDebugScenario("normal"); },
    } : null,
  };
}
