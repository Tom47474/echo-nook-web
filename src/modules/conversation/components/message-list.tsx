"use client";

import { useLayoutEffect, useRef } from "react";
import type { ConversationStatus, Message } from "../model/types";
import { MessageItem } from "./message-item";

const suggestions = ["今天适合聊点什么？", "解释一个我感兴趣的话题", "给我一点学习灵感"];

export function MessageList({ messages, status, conversationId, hasMore, loadingMore, olderError, onLoadMore, onRetry }: {
  messages: Message[];
  status: ConversationStatus;
  conversationId: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  olderError: string | null;
  onLoadMore: () => Promise<boolean>;
  onRetry: (messageId: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const prependRef = useRef<{ conversationId: string; height: number; top: number } | null>(null);

  const loadEarlier = async () => {
    const viewport = viewportRef.current;
    if (!viewport || !conversationId || !hasMore || loadingMore || prependRef.current) return;
    // 插入旧消息前记住滚动高度；渲染后补偿新增高度，视线保持在原消息上。
    prependRef.current = { conversationId, height: viewport.scrollHeight, top: viewport.scrollTop };
    if (!await onLoadMore()) prependRef.current = null;
  };

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const snapshot = prependRef.current;
    if (snapshot && snapshot.conversationId === conversationId) {
      viewport.scrollTop = snapshot.top + viewport.scrollHeight - snapshot.height;
      prependRef.current = null;
      return;
    }
    // S3-4 将根据用户是否正在向上阅读决定是否自动跟随新消息。
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, conversationId]);
  const latestAssistantId = [...messages].reverse().find((message) => message.role === "assistant"
    && messages.some((item) => item.turnId === message.turnId && item.role === "user"))?.id;

  return (
    <div ref={viewportRef} onScroll={(event) => {
      if (event.currentTarget.scrollTop <= 64) void loadEarlier();
    }} className="min-h-0 flex-1 overflow-y-auto px-5 py-6" role="log" aria-label="消息记录" aria-live="polite">
      {(hasMore || loadingMore || olderError) && (
        <div className="mb-4 flex flex-col items-center gap-1 text-xs">
          <button type="button" disabled={loadingMore} onClick={() => void loadEarlier()} className="rounded-lg border border-white/10 px-3 py-1.5 text-white/60 hover:bg-white/5 disabled:opacity-40">
            {loadingMore ? "正在加载更早消息…" : "加载更早消息"}
          </button>
          {olderError && <span role="alert" className="text-red-100/80">{olderError}，请重试。</span>}
        </div>
      )}
      {messages.length === 0 ? (
        <div className="flex h-full min-h-72 flex-col justify-center">
          <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-emerald-200/15 text-xl text-emerald-100">✦</div>
          <h3 className="text-xl font-medium">你好，欢迎来到 EchoNook</h3>
          <p className="mt-3 text-sm leading-7 text-white/50">这里可以放下问题，慢慢探索一个话题。<br />现在先试试文字对话吧。</p>
          <div className="mt-7 space-y-2">{suggestions.map((suggestion) => <p key={suggestion} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-white/55">{suggestion}</p>)}</div>
        </div>
      ) : messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          busy={status === "streaming"}
          canRetry={message.id === latestAssistantId}
          onRetry={onRetry}
        />
      ))}
      {status === "streaming" && <span className="sr-only">正在生成回复</span>}
      <div ref={endRef} />
    </div>
  );
}
