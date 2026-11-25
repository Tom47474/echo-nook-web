"use client";

import { useState } from "react";
import { identityApi, type Identity } from "../services/identity-api";

export function IdentityControls({ identity, busy, onChange }: {
  identity: Identity;
  busy: boolean;
  onChange: (identity: Identity) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [dismissImport, setDismissImport] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mode || working) return;
    setWorking(true);
    setError(null);
    try {
      const next = mode === "login"
        ? await identityApi.login(username, password)
        : await identityApi.register(username, password);
      setMode(null);
      setPassword("");
      setDismissImport(false);
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "身份操作失败，请重试。");
    } finally {
      setWorking(false);
    }
  };

  const importGuest = async () => {
    setWorking(true);
    setError(null);
    try {
      await identityApi.importGuest();
      // 导入后重新挂载会话 Hook，按新身份重新读取会话列表。
      onChange({ ...identity, importable_count: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败，请重试。");
    } finally {
      setWorking(false);
    }
  };

  const logout = async () => {
    setWorking(true);
    setError(null);
    try { onChange(await identityApi.logout()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "退出失败，请重试。"); }
    finally { setWorking(false); }
  };

  return (
    <div className="border-b border-white/10 px-5 py-2 text-xs text-white/70">
      <div className="flex items-center justify-between gap-3">
        <span>{identity.kind === "guest" ? "游客使用中" : `已登录：${identity.username}`}</span>
        {identity.kind === "guest" ? (
          <div className="flex gap-3">
            <button type="button" disabled={busy || working} onClick={() => setMode("login")}>登录</button>
            <button type="button" disabled={busy || working} onClick={() => setMode("register")}>注册</button>
          </div>
        ) : <button type="button" disabled={busy || working} onClick={() => void logout()}>退出</button>}
      </div>
      {mode && identity.kind === "guest" && (
        <form onSubmit={(event) => void submit(event)} className="mt-3 flex flex-wrap items-center gap-2">
          <span>{mode === "login" ? "登录账号" : "注册账号"}</span>
          <input aria-label="用户名" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={100} required placeholder="用户名" autoComplete="username" className="w-28 rounded border border-white/20 bg-transparent px-2 py-1" />
          <input aria-label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required placeholder="密码" autoComplete={mode === "login" ? "current-password" : "new-password"} className="w-32 rounded border border-white/20 bg-transparent px-2 py-1" />
          <button type="submit" disabled={working}>{working ? "处理中…" : "确认"}</button>
          <button type="button" onClick={() => setMode(null)}>取消</button>
        </form>
      )}
      {identity.kind === "account" && identity.importable_count > 0 && !dismissImport && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-200/10 p-2">
          <span>此浏览器有 {identity.importable_count} 个游客会话，是否导入当前账号？</span>
          <button type="button" disabled={busy || working} onClick={() => void importGuest()}>导入</button>
          <button type="button" onClick={() => setDismissImport(true)}>暂不导入</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-red-200">{error}</p>}
    </div>
  );
}
