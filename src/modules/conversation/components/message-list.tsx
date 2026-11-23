"use client";

import { useEffect, useRef } from "react";
import type { ConversationStatus, Message } from "../model/types";
import { MessageItem } from "./message-item";

const suggestions = ["今天适合聊点什么？", "解释一个我感兴趣的话题", "给我一点学习灵感"];

export function MessageList({ messages, status, onRetry }: { messages: Message[]; status: ConversationStatus; onRetry: (messageId: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);
  const latestAssistantId = [...messages].reverse().find((message) => message.role === "assistant"
    && messages.some((item) => item.turnId === message.turnId && item.role === "user"))?.id;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6" role="log" aria-label="消息记录" aria-live="polite">
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
