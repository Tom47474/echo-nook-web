// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Message } from "../model/types";
import { MessageList } from "./message-list";

const message = (id: string): Message => ({ id, turnId: id, role: "user", content: id, status: "completed" });

afterEach(() => vi.restoreAllMocks());

it("keeps the same visible message after older messages are prepended", async () => {
  vi.stubGlobal("scrollIntoView", vi.fn());
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() { return this.querySelectorAll("article").length * 100; },
  });

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
