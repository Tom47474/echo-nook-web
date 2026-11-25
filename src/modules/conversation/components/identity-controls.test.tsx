// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IdentityControls } from "./identity-controls";

const { importGuest } = vi.hoisted(() => ({ importGuest: vi.fn().mockResolvedValue(1) }));
vi.mock("../services/identity-api", () => ({ identityApi: { importGuest } }));

afterEach(() => { cleanup(); importGuest.mockClear(); });

it("asks before importing guest conversations and does not show token usage", async () => {
  const onChange = vi.fn();
  render(<IdentityControls identity={{ id: "account-1", kind: "account", username: "alice", importable_count: 1 }} busy={false} onChange={onChange} />);
  expect(screen.getByText(/是否导入当前账号/)).toBeTruthy();
  expect(importGuest).not.toHaveBeenCalled();
  expect(screen.queryByText(/token/i)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "导入" }));
  await waitFor(() => expect(importGuest).toHaveBeenCalledOnce());
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ importable_count: 0 }));
});
