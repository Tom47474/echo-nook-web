"use client";

import { Trash2 } from "lucide-react";
import { useCurrentConversation } from "../hooks/use-current-conversation";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { ConversationDebugPanel } from "./conversation-debug-panel";

/** 页面始终只有当前身份的一个对话窗口，不显示会话列表和会话 URL。 */
export function ConversationPanel({ debugEnabled = false }: { debugEnabled?: boolean }) {
  const { conversationId, messages, status, loading, loadingMore, hasMore, olderError,
    loadOlder, operationError, send, retry, stop, clear, debug } = useCurrentConversation({ debugEnabled });
  const clearWithConfirmation = () => {
    if (!messages.length || !window.confirm("确定清空当前窗口的全部对话内容吗？此操作无法撤销。")) return;
    void clear();
  };
  return (
    <section aria-label="对话" className="flex min-h-[540px] flex-col border-t border-white/10 bg-[#151922] lg:min-h-0 lg:border-l lg:border-t-0">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6">
        <div><h2 className="font-medium">和 Echo 聊聊</h2><p className="mt-1 text-xs text-white/45">输入一个问题，或者分享一个主题</p></div>
        <button type="button" onClick={clearWithConfirmation} disabled={loading || messages.length === 0} aria-label="清空对话" title="清空对话" className="rounded-lg p-2 text-white/45 hover:bg-red-200/10 hover:text-red-100 disabled:opacity-30"><Trash2 size={17} /></button>
      </div>
      {operationError && <p role="alert" className="border-b border-red-200/10 bg-red-200/5 px-5 py-2 text-xs text-red-100/80">{operationError}</p>}
      <MessageList messages={messages} status={status} conversationId={conversationId} hasMore={hasMore} loadingMore={loadingMore} olderError={olderError} onLoadMore={loadOlder} onRetry={retry} />
      <MessageInput onSend={send} onStop={stop} busy={status === "streaming"} disabled={loading} />
      {debug && <ConversationDebugPanel debug={debug} busy={status === "streaming" || loading} />}
    </section>
  );
}
