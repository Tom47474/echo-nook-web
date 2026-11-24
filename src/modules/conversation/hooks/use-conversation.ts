"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toConversationError } from "../model/conversation-error";
import type {
  ConversationDebugScenario,
  ConversationStatus,
  ConversationSummary,
  Message,
} from "../model/types";
import { conversationApi } from "../services/conversation-api";
import { createDebugReplyProvider } from "../services/debug-reply-provider";
import { replyProvider as httpReplyProvider } from "../services/http-reply-provider";

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
  const [operationError, setOperationError] = useState<string | null>(null);
  const [debugScenario, setDebugScenario] = useState<ConversationDebugScenario>("normal");

  const conversationsRef = useRef<ConversationSummary[]>([]);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);
  const generationVersionRef = useRef(0);
  const loadVersionRef = useRef(0);
  const listVersionRef = useRef(0);
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
    const controller = new AbortController();
    const version = ++loadVersionRef.current;
    loadControllerRef.current = controller;
    setLoading(true);
    setOperationError(null);
    try {
      const loadedMessages = await conversationApi.messages(conversationId, controller.signal);
      if (version === loadVersionRef.current && activeConversationIdRef.current === conversationId) {
        commitMessages(loadedMessages);
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
  }, [commitMessages]);

  const selectConversation = useCallback(async (conversationId: string) => {
    if (conversationId === activeConversationIdRef.current) return;
    stop();
    setActiveConversation(conversationId);
    commitMessages([]);
    await loadConversation(conversationId);
  }, [commitMessages, loadConversation, setActiveConversation, stop]);

  useEffect(() => {
    const controller = new AbortController();
    const listVersion = ++listVersionRef.current;
    void (async () => {
      setLoading(true);
      try {
        const items = await conversationApi.list(controller.signal);
        if (controller.signal.aborted || listVersion !== listVersionRef.current) return;
        commitConversations(items);
        if (items[0]) {
          setActiveConversation(items[0].id);
          await loadConversation(items[0].id);
        } else {
          setLoading(false);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setOperationError(toConversationError(cause).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      controller.abort();
      loadControllerRef.current?.abort();
      controllerRef.current?.abort();
    };
  }, [commitConversations, loadConversation, setActiveConversation]);

  const createConversation = useCallback(async () => {
    if (creatingRef.current) return null;
    creatingRef.current = true;
    stop();
    listVersionRef.current += 1;
    loadControllerRef.current?.abort();
    loadVersionRef.current += 1;
    setLoading(true);
    setOperationError(null);
    try {
      const created = await conversationApi.create();
      commitConversations([created, ...conversationsRef.current.filter((item) => item.id !== created.id)]);
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
      loadVersionRef.current += 1;
      const next = remaining[0];
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
