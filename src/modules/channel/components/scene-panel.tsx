import { MoonStar, Sparkles } from "lucide-react";

export function ScenePanel() {
  return (
    <section aria-label="频道场景" className="relative flex min-h-[420px] flex-col justify-between overflow-hidden bg-[radial-gradient(circle_at_65%_35%,#405e65_0%,#243b49_30%,#161d2d_65%,#111523_100%)] p-6 lg:min-h-0 lg:p-10">
      <div className="pointer-events-none absolute left-[15%] top-[18%] size-64 rounded-full bg-emerald-200/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[8%] top-[12%] size-44 rounded-full bg-amber-200/10 blur-3xl" />
      <div className="relative z-10 flex items-center gap-2 text-xs tracking-[0.2em] text-emerald-100/80"><span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_12px_#6ee7b7]" /> THE QUIET CHANNEL</div>
      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <div className="relative mb-8 flex size-56 items-center justify-center rounded-full border border-white/20 bg-white/5 shadow-[0_30px_100px_#0a111a] lg:size-72">
          <div className="absolute inset-5 rounded-full border border-white/10" />
          <MoonStar className="text-emerald-100/80" size={90} strokeWidth={0.8} />
          <Sparkles className="absolute right-11 top-14 text-amber-100/70" size={24} />
        </div>
        <p className="mb-3 text-xs tracking-[0.3em] text-emerald-100/60">A SPACE TO PAUSE</p>
        <h2 className="text-3xl font-light leading-tight tracking-wide lg:text-5xl">在这里，慢慢聊。</h2>
        <p className="mt-5 max-w-md text-sm leading-7 text-white/55">一个安静的角落，容得下你的问题、灵感和今天的心情。</p>
      </div>
      <div className="relative z-10 text-xs text-white/35">场景与虚拟人物将在后续版本加入</div>
    </section>
  );
}
