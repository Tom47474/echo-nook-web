"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ConversationStatus, Message } from "../model/types";
import { MessageItem } from "./message-item";

const suggestions = ["今天适合聊点什么？", "解释一个我感兴趣的话题", "给我一点学习灵感"];
const bottomThreshold = 80;

/** 允许字体和 Markdown 高度的少量变化；只有接近底部时才继续跟随新内容。 */
function isNearBottom(viewport: HTMLDivElement): boolean {
  return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= bottomThreshold;
}

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
  const prependRef = useRef<{ conversationId: string; height: number; top: number } | null>(null);
  const followingRef = useRef(true);
  const previousConversationRef = useRef(conversationId);
  const [showJump, setShowJump] = useState(false);

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
    if (previousConversationRef.current !== conversationId) {
      // 切换会话是一次新的阅读起点；打开后先展示该会话最新消息。
      previousConversationRef.current = conversationId;
      prependRef.current = null;
      followingRef.current = true;
      setShowJump(false);
    }
    const snapshot = prependRef.current;
    if (snapshot && snapshot.conversationId === conversationId) {
      viewport.scrollTop = snapshot.top + viewport.scrollHeight - snapshot.height;
      prependRef.current = null;
      // 向上加载后保持阅读位置，后续流式分片也不能立刻拉回底部。
      followingRef.current = false;
      setShowJump(true);
      return;
    }
    if (followingRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [messages, conversationId]);

  const onViewportScroll = (viewport: HTMLDivElement) => {
    // 用户离开底部后停止跟随；手动滚回底部则重新启用。
    followingRef.current = isNearBottom(viewport);
    setShowJump(!followingRef.current);
    if (viewport.scrollTop <= 64) void loadEarlier();
  };

  const jumpToBottom = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    followingRef.current = true;
    setShowJump(false);
    viewport.scrollTop = viewport.scrollHeight;
  };
  const latestAssistantId = [...messages].reverse().find((message) => message.role === "assistant"
    && messages.some((item) => item.turnId === message.turnId && item.role === "user"))?.id;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={viewportRef} onScroll={(event) => onViewportScroll(event.currentTarget)} className="h-full overflow-y-auto px-5 py-6" role="log" aria-label="消息记录" aria-live="polite">
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
      </div>
      {showJump && messages.length > 0 && (
        <button type="button" onClick={jumpToBottom} className="absolute bottom-4 right-5 rounded-full border border-emerald-200/30 bg-[#283c38] px-3 py-2 text-xs text-emerald-100 shadow-lg hover:bg-[#355149]">
          回到底部
        </button>
      )}
    </div>
  );
}
