"use client";

import { useEffect, useState } from "react";
import { ConversationPanel } from "@/modules/conversation";
import { identityApi, type Identity } from "@/modules/conversation/services/identity-api";
import { ChannelHeader } from "./channel-header";
import { ScenePanel } from "./scene-panel";

export function ChannelPage({ conversationDebugEnabled = false }: { conversationDebugEnabled?: boolean }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    // 清理旧版多会话链接参数；单窗口由当前身份决定，不再由 URL 指定。
    const url = new URL(window.location.href);
    if (url.searchParams.has("conversation")) {
      url.searchParams.delete("conversation");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    void identityApi.bootstrap().then((value) => { if (active) setIdentity(value); })
      .catch((cause) => { if (active) setIdentityError(cause instanceof Error ? cause.message : "身份初始化失败。"); });
    return () => { active = false; };
  }, []);
  return (
    <main className="min-h-screen bg-[#10131c] lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col lg:h-screen">
        <ChannelHeader identity={identity} onIdentityChange={setIdentity} />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          <ScenePanel />
          {identity ? <ConversationPanel key={identity.id} debugEnabled={conversationDebugEnabled} />
            : <section aria-label="对话" className="flex items-center justify-center bg-[#151922] text-sm text-white/60">{identityError ?? "正在建立对话…"}</section>}
        </div>
      </div>
    </main>
  );
}
