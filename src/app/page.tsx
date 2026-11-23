import { ChannelPage } from "@/modules/channel";

export default function Home() {
  const appEnv = process.env.APP_ENV ?? "production";
  // The server decides whether debug code is mounted. Browser state and query
  // parameters therefore cannot turn the panel on in a production deployment.
  const debugEnabled = (appEnv === "development" || appEnv === "test")
    && process.env.ENABLE_CONVERSATION_DEBUG === "true";

  return <ChannelPage conversationDebugEnabled={debugEnabled} />;
}
