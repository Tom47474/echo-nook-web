import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { Message } from "../model/types";

export function MessageItem({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <article className={`mb-6 flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <span className="mb-2 text-xs text-white/40">{isUser ? "你" : "Echo"}</span>
      <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-7 ${isUser ? "bg-emerald-200 text-[#193028]" : "border border-white/10 bg-white/[0.04] text-white/85"}`}>
        {message.content ? (
          isUser ? <p className="whitespace-pre-wrap break-words">{message.content}</p> :
          <div className="prose prose-invert prose-sm max-w-none break-words"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{message.content}</ReactMarkdown></div>
        ) : <span className="animate-pulse">正在思考…</span>}
        {message.status === "cancelled" && <p className="mt-2 text-xs text-white/40">已停止生成</p>}
      </div>
    </article>
  );
}
