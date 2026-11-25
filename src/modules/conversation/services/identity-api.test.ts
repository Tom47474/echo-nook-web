import { afterEach, expect, it, vi } from "vitest";
import { ensureIdentity, identityApi } from "./identity-api";

afterEach(() => vi.unstubAllGlobals());

it("shares guest bootstrap and sends cookie credentials for account login", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "guest-1", kind: "guest", username: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "account-1", kind: "account", username: "alice" })));
  vi.stubGlobal("fetch", fetchMock);

  const [first, second] = await Promise.all([ensureIdentity(), ensureIdentity()]);
  expect(first.id).toBe("guest-1");
  expect(second.id).toBe("guest-1");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining("/identity/bootstrap"),
    expect.objectContaining({ credentials: "include" }));

  const account = await identityApi.login("alice", "test-password");
  expect(account.id).toBe("account-1");
  expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/identity/login"),
    expect.objectContaining({ credentials: "include", body: JSON.stringify({ username: "alice", password: "test-password" }) }));
  expect((await ensureIdentity()).id).toBe("account-1");
});
