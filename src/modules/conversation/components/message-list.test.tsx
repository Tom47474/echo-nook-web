// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Message } from "../model/types";
import { MessageList } from "./message-list";

const message = (id: string): Message => ({ id, turnId: id, role: "user", content: id, status: "completed" });
const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

const listProps = {
  status: "idle" as const,
  conversationId: "conversation-a",
  hasMore: false,
  loadingMore: false,
  olderError: null,
  onLoadMore: async () => false,
  onRetry: () => {},
};

function mockListGeometry() {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() { return this.querySelectorAll("article").length * 100; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 100; } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // 测试中的布局尺寸只作用于本用例，避免污染同文件其他组件测试。
  if (originalScrollHeight) Object.defineProperty(HTMLElement.prototype, "scrollHeight", originalScrollHeight);
  else delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
  else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
});

it("keeps the same visible message after older messages are prepended", async () => {
  mockListGeometry();

  function Example() {
    const [messages, setMessages] = useState([message("newer")]);
    return <MessageList
      messages={messages}
      status="idle"
      conversationId="conversation-a"
      hasMore={messages.length === 1}
      loadingMore={false}
      olderError={null}
      onLoadMore={async () => { setMessages([message("older"), ...messages]); return true; }}
      onRetry={() => {}}
    />;
  }

  render(<Example />);
  const viewport = screen.getByRole("log");
  viewport.scrollTop = 20;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "加载更早消息" })); });

  expect(viewport.scrollTop).toBe(120);
  expect(screen.getAllByRole("article")).toHaveLength(2);
});

it("does not pull the reader down during streaming and resumes after returning to bottom", () => {
  mockListGeometry();
  const first = [message("1"), message("2"), message("3"), message("4")];
  const { rerender } = render(<MessageList {...listProps} messages={first} status="streaming" />);
  const viewport = screen.getByRole("log");

  viewport.scrollTop = 40;
  fireEvent.scroll(viewport);
  expect(screen.getByRole("button", { name: "回到底部" })).toBeTruthy();
  rerender(<MessageList {...listProps} messages={[...first, message("5")]} status="streaming" />);
  expect(viewport.scrollTop).toBe(40);

  fireEvent.click(screen.getByRole("button", { name: "回到底部" }));
  expect(viewport.scrollTop).toBe(500);
  rerender(<MessageList {...listProps} messages={[...first, message("5"), message("6")]} status="streaming" />);
  expect(viewport.scrollTop).toBe(600);
});

it("keeps following within the bottom threshold and resets on conversation switch", () => {
  mockListGeometry();
  const first = [message("1"), message("2"), message("3"), message("4")];
  const { rerender } = render(<MessageList {...listProps} messages={first} />);
  const viewport = screen.getByRole("log");

  viewport.scrollTop = 250; // 距底部 50px，在 80px 跟随阈值内。
  fireEvent.scroll(viewport);
  expect(screen.queryByRole("button", { name: "回到底部" })).toBeNull();
  rerender(<MessageList {...listProps} messages={[...first, message("5")]} />);
  expect(viewport.scrollTop).toBe(500);

  viewport.scrollTop = 20;
  fireEvent.scroll(viewport);
  rerender(<MessageList {...listProps} conversationId="conversation-b" messages={[message("b-1"), message("b-2")]} />);
  expect(viewport.scrollTop).toBe(200);
  expect(screen.queryByRole("button", { name: "回到底部" })).toBeNull();
});
