import { Radio } from "lucide-react";
import { IdentityControls } from "@/modules/conversation/components/identity-controls";
import type { Identity } from "@/modules/conversation/services/identity-api";

export function ChannelHeader({ identity, onIdentityChange }: { identity: Identity | null; onIdentityChange: (identity: Identity) => void }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-6 lg:px-10">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-200 text-[#17251f]"><Radio size={19} /></span>
        <div><h1 className="text-lg font-semibold tracking-wide">EchoNook</h1><p className="text-[11px] tracking-[0.2em] text-white/45">YOUR QUIET CORNER</p></div>
      </div>
      <IdentityControls identity={identity} busy={false} onChange={onIdentityChange} />
    </header>
  );
}
