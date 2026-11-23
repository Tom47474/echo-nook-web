"use client";

import { RotateCcw } from "lucide-react";
import { useConversation } from "../hooks/use-conversation";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";
import { ConversationDebugPanel } from "./conversation-debug-panel";

export function ConversationPanel({ debugEnabled = false }: { debugEnabled?: boolean }) {
  const { messages, status, send, retry, stop, reset, debug } = useConversation({ debugEnabled });
  return (
    <section aria-label="对话" className="flex min-h-[540px] flex-col border-t border-white/10 bg-[#151922] lg:min-h-0 lg:border-l lg:border-t-0">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6">
        <div><h2 className="font-medium">和 Echo 聊聊</h2><p className="mt-1 text-xs text-white/45">输入一个问题，或者分享一个主题</p></div>
        <button type="button" onClick={reset} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-white/55 hover:bg-white/5 hover:text-white" aria-label="新建对话"><RotateCcw size={14} /> 新对话</button>
      </div>
      <MessageList messages={messages} status={status} onRetry={(messageId) => void retry(messageId)} />
      <MessageInput onSend={send} onStop={stop} busy={status === "streaming"} />
      {debug && <ConversationDebugPanel debug={debug} busy={status === "streaming"} />}
    </section>
  );
}
