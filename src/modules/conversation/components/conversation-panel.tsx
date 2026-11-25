"use client";

import { useEffect, useState } from "react";
import { useConversation } from "../hooks/use-conversation";
import { identityApi, type Identity } from "../services/identity-api";
import { ConversationList } from "./conversation-list";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { ConversationDebugPanel } from "./conversation-debug-panel";
import { IdentityControls } from "./identity-controls";

export function ConversationPanel({ debugEnabled = false }: { debugEnabled?: boolean }) {
  // 首次加载先从服务端取得游客或账号身份，再挂载会话 Hook，避免匿名请求抢先发出。
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void identityApi.bootstrap().then((value) => { if (active) setIdentity(value); })
      .catch((cause) => { if (active) setIdentityError(cause instanceof Error ? cause.message : "游客会话初始化失败。"); });
    return () => { active = false; };
  }, []);

  const changeIdentity = (next: Identity) => {
    // 身份或归属改变时重建工作区，清除上一个身份留在内存中的消息和列表。
    setIdentity(next);
    setVersion((current) => current + 1);
  };
  if (!identity) return <section aria-label="对话" className="flex min-h-[540px] flex-1 items-center justify-center bg-[#151922] text-sm text-white/60">{identityError ?? "正在建立会话…"}</section>;
  return <ConversationWorkspace key={`${identity.id}:${version}`} identity={identity} debugEnabled={debugEnabled} onIdentityChange={changeIdentity} />;
}

function ConversationWorkspace({ identity, debugEnabled, onIdentityChange }: {
  identity: Identity; debugEnabled: boolean; onIdentityChange: (identity: Identity) => void;
}) {
  const {
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
    debug,
  } = useConversation({ debugEnabled });
  return (
    <section aria-label="对话" className="flex min-h-[540px] flex-col border-t border-white/10 bg-[#151922] lg:min-h-0 lg:border-l lg:border-t-0">
      <div className="flex h-16 shrink-0 items-center border-b border-white/10 px-6">
        <div><h2 className="font-medium">和 Echo 聊聊</h2><p className="mt-1 text-xs text-white/45">输入一个问题，或者分享一个主题</p></div>
      </div>
      <IdentityControls identity={identity} busy={status === "streaming" || loading} onChange={onIdentityChange} />
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        loading={loading}
        onCreate={() => void createConversation()}
        onSelect={(conversationId) => void selectConversation(conversationId)}
        onDelete={(conversationId) => void deleteConversation(conversationId)}
      />
      {operationError && <p role="alert" className="border-b border-red-200/10 bg-red-200/5 px-5 py-2 text-xs text-red-100/80">{operationError}</p>}
      <MessageList messages={messages} status={status} conversationId={activeConversationId} hasMore={hasMore} loadingMore={loadingMore} olderError={olderError} onLoadMore={loadOlder} onRetry={(messageId) => void retry(messageId)} />
      <MessageInput onSend={send} onStop={stop} busy={status === "streaming"} disabled={loading} />
      {debug && <ConversationDebugPanel debug={debug} busy={status === "streaming" || loading} />}
    </section>
  );
}
