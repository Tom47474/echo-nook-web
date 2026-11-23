"use client";

import { Bug, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { ConversationDebugScenario, Message } from "../model/types";

type DebugActions = {
  scenario: ConversationDebugScenario;
  setScenario: (scenario: ConversationDebugScenario) => void;
  insertMessage: (role: Message["role"], content: string, status?: Message["status"]) => void;
  reset: () => void;
};

const scenarios: { value: ConversationDebugScenario; label: string }[] = [
  { value: "normal", label: "正常 SSE" },
  { value: "block", label: "发送前阻止 SSE" },
  { value: "interrupt", label: "收到部分内容后断流" },
  { value: "missing-completion", label: "缺少完成事件" },
  { value: "slow", label: "慢速流（每段 800ms）" },
];

export function ConversationDebugPanel({ debug, busy }: { debug: DebugActions; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const actionClass = "rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-left text-xs text-white/75 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="fixed bottom-5 left-5 z-50 flex flex-col items-start gap-2">
      {open && (
        <section aria-label="对话调试面板" className="w-[min(360px,calc(100vw-2.5rem))] rounded-2xl border border-amber-200/25 bg-[#171b24]/95 p-4 text-white shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div><p className="text-sm font-medium text-amber-100">对话调试</p><p className="mt-0.5 text-[11px] text-white/40">仅限开发与测试环境</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="收起调试面板" className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white"><ChevronDown size={16} /></button>
          </div>

          <label className="block text-xs text-white/55" htmlFor="debug-stream-scenario">下一次发送的流式场景</label>
          <select id="debug-stream-scenario" value={debug.scenario} onChange={(event) => debug.setScenario(event.target.value as ConversationDebugScenario)} disabled={busy} className="mt-1.5 w-full rounded-lg border border-white/15 bg-[#202631] px-3 py-2 text-sm outline-none focus:border-amber-200/60 disabled:opacity-50">
            {scenarios.map((scenario) => <option key={scenario.value} value={scenario.value}>{scenario.label}</option>)}
          </select>

          <p className="mb-2 mt-4 text-xs text-white/55">插入本地消息</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} className={actionClass} onClick={() => debug.insertMessage("user", "这是一条调试用户消息。")}>用户消息</button>
            <button type="button" disabled={busy} className={actionClass} onClick={() => debug.insertMessage("assistant", "## Markdown 测试\n\n- 列表项目\n- `inline code`\n\n| 字段 | 值 |\n| --- | --- |\n| 状态 | 正常 |")}>Markdown 回复</button>
            <button type="button" disabled={busy} className={actionClass} onClick={() => debug.insertMessage("assistant", "这是一段用于检查换行、滚动和消息气泡宽度的长文本。".repeat(30))}>长回复</button>
            <button type="button" disabled={busy} className={actionClass} onClick={() => {
              // A burst of messages exposes ordering and auto-scroll problems
              // without requiring the backend or consuming model quota.
              for (let index = 1; index <= 30; index += 1) {
                debug.insertMessage(index % 2 === 0 ? "assistant" : "user", `批量调试消息 ${index}/30`);
              }
            }}>批量 30 条</button>
            <button type="button" disabled={busy} className={actionClass} onClick={() => debug.insertMessage("assistant", "", "streaming")}>思考占位</button>
            <button type="button" disabled={busy} className={actionClass} onClick={() => debug.insertMessage("assistant", "这是已经停止生成的部分回复。", "cancelled")}>已停止回复</button>
            <button type="button" disabled={busy} className={`${actionClass} text-red-200`} onClick={debug.reset}>清空并重置</button>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-white/35">消息操作只修改浏览器内存。故障场景用于界面联调，不能替代真实断连与服务端资源清理验证。</p>
        </section>
      )}
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? "收起对话调试" : "打开对话调试"} className="flex size-12 items-center justify-center rounded-full border border-amber-200/30 bg-amber-200 text-[#29200b] shadow-lg shadow-black/30 hover:bg-amber-100">
        {open ? <ChevronUp size={20} /> : <Bug size={20} />}
      </button>
    </div>
  );
}
