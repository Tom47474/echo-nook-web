"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toConversationError } from "../model/conversation-error";
import type {
  ConversationDebugScenario,
  ConversationStatus,
  ConversationSummary,
  Message,
  MessagePage,
} from "../model/types";
import { conversationApi } from "../services/conversation-api";
import { createDebugReplyProvider } from "../services/debug-reply-provider";
import { replyProvider as httpReplyProvider } from "../services/http-reply-provider";
import { readConversationId, writeConversationId } from "../services/conversation-url";

type GenerationInput = {
  conversationId: string;
  content: string;
  userMessage: Message;
  assistantMessage: Message;
  nextMessages: Message[];
};

export function useConversation({ debugEnabled = false }: { debugEnabled?: boolean } = {}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [debugScenario, setDebugScenario] = useState<ConversationDebugScenario>("normal");

  const conversationsRef = useRef<ConversationSummary[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);
  const olderControllerRef = useRef<AbortController | null>(null);
  const cursorRef = useRef<number | null>(null);
  const pagingRef = useRef(false);
  const generationVersionRef = useRef(0);
  const loadVersionRef = useRef(0);
  const listVersionRef = useRef(0);
  const navigationVersionRef = useRef(0);
  const activeRef = useRef(false);
  const creatingRef = useRef(false);

  // React 可能批量更新 state；同步 ref 让“停止后立即切换/发送”读取到最新值。
  const commitMessages = useCallback((next: Message[] | ((current: Message[]) => Message[])) => {
    const value = typeof next === "function" ? next(messagesRef.current) : next;
    messagesRef.current = value;
    setMessages(value);
  }, []);

  const commitConversations = useCallback((next: ConversationSummary[]) => {
    conversationsRef.current = next;
    setConversations(next);
  }, []);

  const setActiveConversation = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationId(conversationId);
  }, []);

  /**
   * 取消当前 SSE，并使该请求已排队的异步结果失效。切换会话时先执行它，
   * 即使旧请求稍后才抛出异常，也不能再改写新会话的消息和状态。
   */
  const stop = useCallback(() => {
    generationVersionRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    activeRef.current = false;
    setStatus("idle");
    commitMessages((current) => current.map((item) => item.status === "streaming"
      ? { ...item, status: "cancelled", error: undefined }
      : item));
  }, [commitMessages]);

  /** 合并分页边界上的回合：旧页若以用户结束，新页首条助手应归属该用户。 */
  const stitchTurns = useCallback((items: Message[]) => {
    let turnId = "";
    return items.map((item) => {
      if (item.role === "user") turnId = item.id;
      return { ...item, turnId: turnId || item.id };
    });
  }, []);

  const refreshConversationList = useCallback(async () => {
    const version = listVersionRef.current;
    try {
      const items = await conversationApi.list();
      // 新建/删除发生后，生成结束前发出的旧列表响应不能覆盖更新后的列表。
      if (version === listVersionRef.current) commitConversations(items);
    } catch {
      // 消息已经完成时，列表刷新失败不应覆盖本次生成结果；下次操作会重试。
    }
  }, [commitConversations]);

  /** 加载一个会话的最近消息；版本号同时解决快速切换时响应乱序的问题。 */
  const loadConversation = useCallback(async (conversationId: string) => {
    loadControllerRef.current?.abort();
    olderControllerRef.current?.abort();
    olderControllerRef.current = null;
    pagingRef.current = false;
    cursorRef.current = null;
    setHasMore(false);
    setLoadingMore(false);
    setOlderError(null);
    const controller = new AbortController();
    const version = ++loadVersionRef.current;
    loadControllerRef.current = controller;
    setLoading(true);
    setOperationError(null);
    try {
      const page = await conversationApi.messages(conversationId, controller.signal);
      if (version === loadVersionRef.current && activeConversationIdRef.current === conversationId) {
        commitMessages(stitchTurns(page.items));
        cursorRef.current = page.nextBeforeSequence;
        setHasMore(page.hasMore);
      }
    } catch (cause) {
      if (!controller.signal.aborted && version === loadVersionRef.current) {
        setOperationError(toConversationError(cause).message);
      }
    } finally {
      if (version === loadVersionRef.current) {
        loadControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [commitMessages, stitchTurns]);

  /** 用服务端游标读取更早的一页；同一时间只允许一个分页请求。 */
  const loadOlder = useCallback(async (): Promise<boolean> => {
    const conversationId = activeConversationIdRef.current;
    const beforeSequence = cursorRef.current;
    if (!conversationId || beforeSequence === null || pagingRef.current || loading) return false;
    pagingRef.current = true;
    const version = loadVersionRef.current;
    const controller = new AbortController();
    olderControllerRef.current = controller;
    setLoadingMore(true);
    setOlderError(null);
    try {
      const page: MessagePage = await conversationApi.messages(conversationId, controller.signal, beforeSequence);
      if (controller.signal.aborted || version !== loadVersionRef.current || activeConversationIdRef.current !== conversationId) return false;
      // UUID 去重保证服务端页面与在途新消息并存时，屏幕不会重复展示同一条消息。
      const existingIds = new Set(messagesRef.current.map((item) => item.id));
      const older = page.items.filter((item) => !existingIds.has(item.id));
      commitMessages(stitchTurns([...older, ...messagesRef.current]));
      cursorRef.current = page.nextBeforeSequence;
      setHasMore(page.hasMore);
      return older.length > 0;
    } catch (cause) {
      if (!controller.signal.aborted && version === loadVersionRef.current) setOlderError(toConversationError(cause).message);
      return false;
    } finally {
      if (olderControllerRef.current === controller) {
        olderControllerRef.current = null;
        pagingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [commitMessages, loading, stitchTurns]);

  const selectConversation = useCallback(async (conversationId: string) => {
    if (conversationId === activeConversationIdRef.current) return;
    navigationVersionRef.current += 1;
    stop();
    writeConversationId(conversationId, "push");
    setActiveConversation(conversationId);
    commitMessages([]);
    await loadConversation(conversationId);
  }, [commitMessages, loadConversation, setActiveConversation, stop]);

  /** 解析直达链接；即使目标不在列表第一页，也通过单会话接口确认其存在。 */
  const restoreFromUrl = useCallback(async (items: ConversationSummary[], signal?: AbortSignal) => {
    const navigationVersion = ++navigationVersionRef.current;
    const requestedId = readConversationId();
    let target = requestedId ? await conversationApi.get(requestedId, signal) : null;
    // 用户在单会话查询期间可能又点击了别处；晚到的直达结果不能覆盖新导航。
    if (signal?.aborted || navigationVersion !== navigationVersionRef.current) return;
    const missing = requestedId !== null && target === null;
    if (!target) target = items[0] ?? null;
    if (target && !items.some((item) => item.id === target.id)) {
      commitConversations([target, ...items]);
    }
    // 无效/已删除链接回退最近会话，并把地址改成真实的活动会话。
    if (requestedId !== target?.id) writeConversationId(target?.id ?? null, "replace");
    stop();
    setActiveConversation(target?.id ?? null);
    commitMessages([]);
    if (target) await loadConversation(target.id);
    else setLoading(false);
    if (missing && !signal?.aborted) setOperationError("链接中的会话不存在或 ID 无效，已打开最近会话。");
  }, [commitConversations, commitMessages, loadConversation, setActiveConversation, stop]);

  useEffect(() => {
    const controller = new AbortController();
    const listVersion = ++listVersionRef.current;
    void (async () => {
      setLoading(true);
      try {
        const items = await conversationApi.list(controller.signal);
        if (controller.signal.aborted || listVersion !== listVersionRef.current) return;
        commitConversations(items);
        await restoreFromUrl(items, controller.signal);
      } catch (cause) {
        if (!controller.signal.aborted && listVersion === listVersionRef.current) {
          setOperationError(toConversationError(cause).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      controller.abort();
      loadControllerRef.current?.abort();
      olderControllerRef.current?.abort();
      controllerRef.current?.abort();
    };
  }, [commitConversations, restoreFromUrl]);

  useEffect(() => {
    const onHistoryChange = () => {
      const navigationVersion = navigationVersionRef.current + 1;
      // 浏览器后退/前进不触发 pushState；重新按 URL 恢复并隔离旧流。
      void restoreFromUrl(conversationsRef.current).catch((cause) => {
        if (navigationVersion !== navigationVersionRef.current) return;
        // 查询失败时保留现有会话，并把地址恢复为页面实际正在展示的 ID。
        writeConversationId(activeConversationIdRef.current, "replace");
        setOperationError(toConversationError(cause).message);
        setLoading(false);
      });
    };
    window.addEventListener("popstate", onHistoryChange);
    return () => window.removeEventListener("popstate", onHistoryChange);
  }, [restoreFromUrl]);

  const createConversation = useCallback(async () => {
    if (creatingRef.current) return null;
    creatingRef.current = true;
    navigationVersionRef.current += 1;
    stop();
    listVersionRef.current += 1;
    loadControllerRef.current?.abort();
    olderControllerRef.current?.abort();
    olderControllerRef.current = null;
    pagingRef.current = false;
    cursorRef.current = null;
    setHasMore(false);
    setLoadingMore(false);
    setOlderError(null);
    loadVersionRef.current += 1;
    setLoading(true);
    setOperationError(null);
    try {
      const created = await conversationApi.create();
      commitConversations([created, ...conversationsRef.current.filter((item) => item.id !== created.id)]);
      writeConversationId(created.id, "push");
      setActiveConversation(created.id);
      commitMessages([]);
      return created.id;
    } catch (cause) {
      setOperationError(toConversationError(cause).message);
      return null;
    } finally {
      creatingRef.current = false;
      setLoading(false);
    }
  }, [commitConversations, commitMessages, setActiveConversation, stop]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    navigationVersionRef.current += 1;
    const deletingActive = activeConversationIdRef.current === conversationId;
    if (deletingActive) stop();
    listVersionRef.current += 1;
    setOperationError(null);
    try {
      await conversationApi.delete(conversationId);
      const remaining = conversationsRef.current.filter((item) => item.id !== conversationId);
      commitConversations(remaining);
      if (!deletingActive) return true;

      loadControllerRef.current?.abort();
      olderControllerRef.current?.abort();
      loadVersionRef.current += 1;
      const next = remaining[0];
      writeConversationId(next?.id ?? null, "replace");
      setActiveConversation(next?.id ?? null);
      commitMessages([]);
      if (next) await loadConversation(next.id);
      return true;
    } catch (cause) {
      setOperationError(toConversationError(cause).message);
      return false;
    }
  }, [commitConversations, commitMessages, loadConversation, setActiveConversation, stop]);

  const runGeneration = useCallback(async ({
    conversationId,
    content,
    userMessage,
    assistantMessage,
    nextMessages,
  }: GenerationInput) => {
    if (activeRef.current) return false;
    activeRef.current = true;
    const version = ++generationVersionRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    commitMessages(nextMessages);
    setStatus("streaming");
    setOperationError(null);

    let currentAssistantId = assistantMessage.id;
    let completed = false;
    const belongsToCurrentView = () => generationVersionRef.current === version
      && activeConversationIdRef.current === conversationId;

    try {
      // 每次发送固定一次调试场景，避免流过程中切换场景产生混合行为。
      const provider = debugEnabled
        ? createDebugReplyProvider(httpReplyProvider, debugScenario)
        : httpReplyProvider;
      for await (const event of provider.streamReply(conversationId, content, controller.signal)) {
        if (controller.signal.aborted || !belongsToCurrentView()) break;
        if (event.type === "started") {
          currentAssistantId = event.assistantMessageId;
          // 用 message.started 返回的正式 UUID/sequence 替换乐观消息，后续刷新可对齐数据库记录。
          commitMessages((current) => current.map((item) => {
            if (item.id === userMessage.id) {
              return {
                ...item,
                id: event.userMessageId,
                turnId: event.userMessageId,
                sequence: event.userSequence,
              };
            }
            if (item.id === assistantMessage.id) {
              return {
                ...item,
                id: event.assistantMessageId,
                turnId: event.userMessageId,
                sequence: event.assistantSequence,
              };
            }
            return item;
          }));
        } else if (event.type === "delta") {
          commitMessages((current) => current.map((item) => item.id === currentAssistantId
            ? { ...item, content: item.content + event.text }
            : item));
        } else if (event.type === "completed") {
          completed = true;
          commitMessages((current) => current.map((item) => item.id === currentAssistantId
            ? { ...item, status: "completed", error: undefined }
            : item));
        }
      }
      if (!controller.signal.aborted && belongsToCurrentView() && !completed) {
        throw new Error("回复连接意外中断，请重试。");
      }
    } catch (cause) {
      if (!controller.signal.aborted && belongsToCurrentView()) {
        const error = toConversationError(cause);
        // 保留已经收到的正文，失败记录稍后也能从数据库重新加载。
        commitMessages((current) => current.map((item) => item.id === currentAssistantId
          ? { ...item, status: "failed", error }
          : item));
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        activeRef.current = false;
        setStatus("idle");
      }
      if (belongsToCurrentView()) void refreshConversationList();
    }
    return true;
  }, [commitMessages, debugEnabled, debugScenario, refreshConversationList]);

  const send = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || activeRef.current || creatingRef.current) return false;

    let conversationId = activeConversationIdRef.current;
    if (!conversationId) {
      conversationId = await createConversation();
      if (!conversationId) return false;
    }

    const turnId = crypto.randomUUID();
    const userMessage: Message = {
      id: crypto.randomUUID(),
      turnId,
      conversationId,
      role: "user",
      content,
      status: "completed",
    };
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      turnId,
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
    };
    return runGeneration({
      conversationId,
      content,
      userMessage,
      assistantMessage,
      nextMessages: [...messagesRef.current, userMessage, assistantMessage],
    });
  }, [createConversation, runGeneration]);

  const retry = useCallback(async (assistantId: string) => {
    if (activeRef.current) return false;
    const current = messagesRef.current;
    const assistantIndex = current.findIndex((item) => item.id === assistantId && item.role === "assistant");
    const latestAssistantIndex = current.findLastIndex((item) => item.role === "assistant");
    if (assistantIndex < 0 || assistantIndex !== latestAssistantIndex) return false;
    const assistant = current[assistantIndex];
    if (assistant.status === "streaming" || (assistant.status === "failed" && !assistant.error?.retryable)) return false;
    const user = current.find((item) => item.turnId === assistant.turnId && item.role === "user");
    if (!user) return false;
    // 服务端当前没有“覆盖旧回复”接口；重试作为新回合追加，确保页面与数据库记录一致。
    return send(user.content);
  }, [send]);

  const resetDebug = useCallback(() => {
    stop();
    commitMessages([]);
    setDebugScenario("normal");
  }, [commitMessages, stop]);

  const insertDebugMessage = useCallback((
    role: Message["role"],
    content: string,
    messageStatus: Message["status"] = "completed",
  ) => {
    if (!debugEnabled || activeRef.current) return;
    const id = crypto.randomUUID();
    commitMessages((current) => [...current, {
      id,
      turnId: id,
      conversationId: activeConversationIdRef.current ?? undefined,
      role,
      content,
      status: messageStatus,
    }]);
  }, [commitMessages, debugEnabled]);

  return {
    conversations,
    activeConversationId,
    messages,
    status,
    loading,
    loadingMore,
    hasMore,
    olderError,
    loadOlder,
    operationError,
    send,
    retry,
    stop,
    createConversation,
    selectConversation,
    deleteConversation,
    debug: debugEnabled
      ? { scenario: debugScenario, setScenario: setDebugScenario, insertMessage: insertDebugMessage, reset: resetDebug }
      : null,
  };
}
