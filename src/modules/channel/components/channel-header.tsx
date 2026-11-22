import { Radio } from "lucide-react";

export function ChannelHeader() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6 lg:px-10">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-200 text-[#17251f]"><Radio size={19} /></span>
        <div><h1 className="text-lg font-semibold tracking-wide">EchoNook</h1><p className="text-[11px] tracking-[0.2em] text-white/45">YOUR QUIET CORNER</p></div>
      </div>
      <span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-3 py-1 text-xs text-emerald-100">前端演示版</span>
    </header>
  );
}
