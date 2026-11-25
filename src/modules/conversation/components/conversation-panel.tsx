"use client";

import { useConversation } from "../hooks/use-conversation";
import { ConversationList } from "./conversation-list";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { ConversationDebugPanel } from "./conversation-debug-panel";

export function ConversationPanel({ debugEnabled = false }: { debugEnabled?: boolean }) {
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
