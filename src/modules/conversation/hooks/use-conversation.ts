"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationStatus, Message } from "../model/types";
import { replyProvider } from "../services/http-reply-provider";

export function useConversation() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const activeRef = useRef(false);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    activeRef.current = false;
    setStatus("idle");
    setMessages((current) => current.map((item) => item.status === "streaming" ? { ...item, status: "cancelled" } : item));
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
  }, [stop]);

  const send = useCallback(async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || activeRef.current) return false;
    activeRef.current = true;
    setError(null);

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content, status: "completed" };
    const assistantId = crypto.randomUUID();
    const assistantMessage: Message = { id: assistantId, role: "assistant", content: "", status: "streaming" };
    const history = [...messages, userMessage];
    const controller = new AbortController();
    controllerRef.current = controller;
    setMessages([...history, assistantMessage]);
    setStatus("streaming");

    try {
      for await (const part of replyProvider.streamReply(history, controller.signal)) {
        if (controller.signal.aborted) break;
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + part } : item));
      }
      if (!controller.signal.aborted) {
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, status: "completed" } : item));
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "回复生成失败，请重试。");
        setMessages((current) => current.filter((item) => item.id !== assistantId));
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        activeRef.current = false;
        setStatus("idle");
      }
    }
    return true;
  }, [messages]);

  return { messages, status, error, send, stop, reset };
}
