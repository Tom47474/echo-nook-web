const queryKey = "conversation";

/** 读取当前地址中的会话 ID；空参数也交给服务端校验为无效资源。 */
export function readConversationId(): string | null {
  return new URL(window.location.href).searchParams.get(queryKey);
}

/** 保留页面其他查询参数和 hash，只更新会话 ID，避免切换时页面滚回顶部。 */
export function writeConversationId(conversationId: string | null, mode: "push" | "replace"): void {
  const url = new URL(window.location.href);
  if (conversationId === null) url.searchParams.delete(queryKey);
  else url.searchParams.set(queryKey, conversationId);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", next);
}
