"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/shared/ui/button";

export function MessageInput({
  onSend,
  onStop,
  busy,
  disabled = false,
}: {
  onSend: (content: string) => Promise<boolean>;
  onStop: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = async () => {
    if (!value.trim() || busy || disabled) return;
    const content = value;
    setValue("");
    const accepted = await onSend(content);
    if (!accepted) setValue(content);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };
  return (
    <div className="shrink-0 border-t border-white/10 p-4 lg:p-5">
      <div className="flex items-end gap-2 rounded-2xl border border-white/15 bg-white/[0.04] p-2 focus-within:border-emerald-200/50">
        <textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={onKeyDown} disabled={busy || disabled} rows={2} maxLength={4000} placeholder="发送消息，或者描述一个想聊的主题…" aria-label="消息内容" className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/30 disabled:opacity-60" />
        {busy ? <Button onClick={onStop} aria-label="停止生成"><Square size={16} fill="currentColor" /></Button> : <Button onClick={() => void submit()} disabled={!value.trim()} aria-label="发送消息"><ArrowUp size={18} /></Button>}
      </div>
      <p className="mt-2 text-center text-[11px] text-white/30">Enter 发送 · Shift + Enter 换行 · 回复由服务端生成</p>
    </div>
  );
}
