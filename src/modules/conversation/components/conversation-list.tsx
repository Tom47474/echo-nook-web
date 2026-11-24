"use client";

import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import type { ConversationSummary } from "../model/types";

type ConversationListProps = {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  loading: boolean;
  onCreate: () => void;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
};

/** 展示服务端会话列表；所有写操作仍交给 Hook，组件不直接调用接口。 */
export function ConversationList({
  conversations,
  activeConversationId,
  loading,
  onCreate,
  onSelect,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="shrink-0 border-b border-white/10 bg-black/10 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white/45">历史会话</span>
        <button
          type="button"
          onClick={onCreate}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-emerald-100/80 hover:bg-white/5 hover:text-emerald-100"
        >
          <Plus size={13} /> 新建
        </button>
      </div>
      {loading && conversations.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-xs text-white/40">
          <LoaderCircle className="animate-spin" size={13} /> 正在加载会话…
        </p>
      ) : conversations.length === 0 ? (
        <p className="py-2 text-xs text-white/35">还没有已保存的会话</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label="历史会话列表">
          {conversations.map((conversation) => {
            const active = conversation.id === activeConversationId;
            return (
              <div
                key={conversation.id}
                className={`flex min-w-36 max-w-52 shrink-0 items-center rounded-lg border ${active
                  ? "border-emerald-200/30 bg-emerald-200/10"
                  : "border-white/10 bg-white/[0.025]"}`}
              >
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(conversation.id)}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs text-white/70 hover:text-white"
                  title={conversation.title}
                >
                  {conversation.title}
                </button>
                <button
                  type="button"
                  aria-label={`删除会话：${conversation.title}`}
                  onClick={() => {
                    // 删除会级联清除消息，先向用户确认，避免误触造成不可恢复的数据丢失。
                    if (window.confirm(`确定删除“${conversation.title}”及其全部消息吗？`)) {
                      onDelete(conversation.id);
                    }
                  }}
                  className="mr-1 rounded p-1.5 text-white/30 hover:bg-red-200/10 hover:text-red-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
