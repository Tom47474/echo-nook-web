// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { IdentityControls } from "./identity-controls";

const { login, logout } = vi.hoisted(() => ({
  login: vi.fn().mockResolvedValue({ id: "account-1", kind: "account", username: "alice" }),
  logout: vi.fn().mockResolvedValue({ id: "guest-1", kind: "guest", username: null }),
}));
vi.mock("../services/identity-api", () => ({ identityApi: { login, logout } }));

afterEach(() => { cleanup(); login.mockClear(); logout.mockClear(); });

it("shows login and register for guests without guest status text", async () => {
  const onChange = vi.fn();
  render(<IdentityControls identity={{ id: "guest-1", kind: "guest", username: null }} busy={false} onChange={onChange} />);
  expect(screen.queryByText("游客使用中")).toBeNull();
  expect(screen.getByRole("button", { name: "注册" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  fireEvent.change(screen.getByRole("textbox", { name: "用户名" }), { target: { value: "alice" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } });
  fireEvent.click(screen.getByRole("button", { name: "确认" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "account-1" })));
});

it("shows username and logout only after opening account avatar", async () => {
  const onChange = vi.fn();
  render(<IdentityControls identity={{ id: "account-1", kind: "account", username: "alice" }} busy={false} onChange={onChange} />);
  expect(screen.queryByText("alice")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "账号菜单" }));
  expect(screen.getByText("alice")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: "guest-1" })));
  expect(screen.queryByText(/token/i)).toBeNull();
});
