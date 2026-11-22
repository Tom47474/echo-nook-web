import { ConversationPanel } from "@/modules/conversation";
import { ChannelHeader } from "./channel-header";
import { ScenePanel } from "./scene-panel";

export function ChannelPage() {
  return (
    <main className="min-h-screen bg-[#10131c] lg:h-screen lg:overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col lg:h-screen">
        <ChannelHeader />
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
          <ScenePanel />
          <ConversationPanel />
        </div>
      </div>
    </main>
  );
}
