import { AlertCircle, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Message } from "../model/types";

export function MessageItem({ message, busy, canRetry, onRetry }: { message: Message; busy: boolean; canRetry: boolean; onRetry: (messageId: string) => void }) {
  const isUser = message.role === "user";
  const showRetry = !isUser && canRetry && message.status !== "streaming"
    && (message.status !== "failed" || message.error?.retryable === true);
  const retryLabel = message.status === "failed" ? "重试" : "重新生成";
  return (
    <article className={`mb-6 flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <span className="mb-2 text-xs text-white/40">{isUser ? "你" : "Echo"}</span>
      <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 ${isUser ? "bg-emerald-200 text-[#193028]" : "border border-white/10 bg-white/[0.04] text-white/85"}`}>
        {message.content ? (
          isUser ? <p className="whitespace-pre-wrap break-words">{message.content}</p> :
          <div className="prose prose-invert prose-sm max-w-none break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{message.content}</ReactMarkdown></div>
        ) : message.status === "streaming" ? <span className="animate-pulse">正在思考…</span>
          : <span className="text-white/45">未生成可展示的回复。</span>}
        {message.status === "cancelled" && <p className="mt-2 text-xs text-white/40">已停止生成</p>}
        {message.status === "failed" && message.error && (
          <p role="alert" className="mt-3 flex items-start gap-2 border-t border-red-200/10 pt-2 text-xs leading-5 text-red-100/85">
            <AlertCircle className="mt-0.5 shrink-0" size={14} />
            <span>{message.error.message}</span>
          </p>
        )}
        {showRetry && (
          <button type="button" disabled={busy} onClick={() => onRetry(message.id)} className="mt-3 flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <RotateCcw size={13} /> {retryLabel}
          </button>
        )}
      </div>
    </article>
  );
}
