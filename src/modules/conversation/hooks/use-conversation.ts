"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toConversationError } from "../model/conversation-error";
import type { ConversationDebugScenario, ConversationStatus, Message } from "../model/types";
import { createDebugReplyProvider } from "../services/debug-reply-provider";
import { replyProvider as httpReplyProvider } from "../services/http-reply-provider";

type GenerationInput = {
  assistantId: string;
  requestHistory: Message[];
  nextMessages: Message[];
};

export function useConversation({ debugEnabled = false }: { debugEnabled?: boolean } = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [debugScenario, setDebugScenario] = useState<ConversationDebugScenario>("normal");
  const messagesRef = useRef<Message[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);

  // Keep an immediately readable copy because React may batch state updates.
  // This prevents stop-then-send from rebuilding history from stale messages.
  const commitMessages = useCallback((next: Message[] | ((current: Message[]) => Message[])) => {
    const value = typeof next === "function" ? next(messagesRef.current) : next;
    messagesRef.current = value;
    setMessages(value);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    activeRef.current = false;
    setStatus("idle");
    commitMessages((current) => current.map((item) => item.status === "streaming"
      ? { ...item, status: "cancelled", error: undefined }
      : item));
  }, [commitMessages]);

  const reset = useCallback(() => {
    stop();
    commitMessages([]);
  }, [commitMessages, stop]);

  const resetDebug = useCallback(() => {
    reset();
    setDebugScenario("normal");
  }, [reset]);

  const insertDebugMessage = useCallback((role: Message["role"], content: string, status: Message["status"] = "completed") => {
    if (!debugEnabled || activeRef.current) return;
    const id = crypto.randomUUID();
    commitMessages((current) => [...current, { id, turnId: id, role, content, status }]);
  }, [commitMessages, debugEnabled]);

  const runGeneration = useCallback(async ({ assistantId, requestHistory, nextMessages }: GenerationInput) => {
    if (activeRef.current) return false;
    activeRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    commitMessages(nextMessages);
    setStatus("streaming");

    try {
      // Capture one scenario per request so changing the panel during a stream
      // cannot produce a half-old, half-new failure mode.
      const replyProvider = debugEnabled
        ? createDebugReplyProvider(httpReplyProvider, debugScenario)
        : httpReplyProvider;
      for await (const part of replyProvider.streamReply(requestHistory, controller.signal)) {
        if (controller.signal.aborted) break;
        commitMessages((current) => current.map((item) => item.id === assistantId
          ? { ...item, content: item.content + part }
          : item));
      }
      if (!controller.signal.aborted) {
        commitMessages((current) => current.map((item) => item.id === assistantId
          ? { ...item, status: "completed", error: undefined }
          : item));
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const error = toConversationError(cause);
        // Keep any text already received so the failure is visible and retryable.
        commitMessages((current) => current.map((item) => item.id === assistantId
          ? { ...item, status: "failed", error }
          : item));
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        activeRef.current = false;
        setStatus("idle");
      }
    }
    return true;
  }, [commitMessages, debugEnabled, debugScenario]);

  const send = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || activeRef.current) return false;

    const turnId = crypto.randomUUID();
    const userMessage: Message = { id: crypto.randomUUID(), turnId, role: "user", content, status: "completed" };
    const assistantMessage: Message = { id: crypto.randomUUID(), turnId, role: "assistant", content: "", status: "streaming" };
    const requestHistory = [...messagesRef.current, userMessage];
    return runGeneration({
      assistantId: assistantMessage.id,
      requestHistory,
      nextMessages: [...requestHistory, assistantMessage],
    });
  }, [runGeneration]);

  const retry = useCallback(async (assistantId: string) => {
    if (activeRef.current) return false;
    const current = messagesRef.current;
    const assistantIndex = current.findIndex((item) => item.id === assistantId && item.role === "assistant");
    const latestAssistantIndex = current.findLastIndex((item) => item.role === "assistant");
    if (assistantIndex < 0 || assistantIndex !== latestAssistantIndex) return false;

    const assistant = current[assistantIndex];
    if (assistant.status === "streaming" || (assistant.status === "failed" && !assistant.error?.retryable)) return false;
    const userIndex = current.findIndex((item) => item.turnId === assistant.turnId && item.role === "user");
    if (userIndex < 0) return false;

    // Retry uses the original user message as the current input. The old
    // assistant text is replaced in place and is never sent back to the model.
    const requestHistory = current.slice(0, userIndex + 1);
    const nextMessages = current.map((item) => item.id === assistantId
      ? { ...item, content: "", status: "streaming" as const, error: undefined }
      : item);
    return runGeneration({ assistantId, requestHistory, nextMessages });
  }, [runGeneration]);

  return {
    messages,
    status,
    send,
    retry,
    stop,
    reset,
    debug: debugEnabled ? { scenario: debugScenario, setScenario: setDebugScenario, insertMessage: insertDebugMessage, reset: resetDebug } : null,
  };
}
