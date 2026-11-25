"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { identityApi, type Identity } from "../services/identity-api";

/** 页头身份入口：游客只显示登录/注册，账号显示默认头像和下拉菜单。 */
export function IdentityControls({ identity, busy, onChange }: {
  identity: Identity | null;
  busy: boolean;
  onChange: (identity: Identity) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mode || working) return;
    setWorking(true);
    setError(null);
    try {
      const next = mode === "login"
        ? await identityApi.login(username, password)
        : await identityApi.register(username, password);
      // 只切换身份；游客消息仍归原游客，账号窗口重新从服务端读取。
      setMode(null);
      setPassword("");
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "身份操作失败，请重试。");
    } finally {
      setWorking(false);
    }
  };

  const logout = async () => {
    setWorking(true);
    setError(null);
    try {
      const guest = await identityApi.logout();
      setMenuOpen(false);
      onChange(guest);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "退出失败，请重试。");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="relative text-sm text-white/75">
      {identity?.kind === "guest" && (
        <div className="flex items-center gap-4">
          <button type="button" disabled={busy || working} onClick={() => { setError(null); setMode("login"); }}>登录</button>
          <button type="button" disabled={busy || working} onClick={() => { setError(null); setMode("register"); }} className="rounded-lg border border-emerald-200/30 px-3 py-1.5 text-emerald-100">注册</button>
        </div>
      )}
      {identity?.kind === "account" && (
        <>
          <button type="button" aria-label="账号菜单" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 hover:bg-white/20">
            <UserRound size={19} aria-hidden="true" />
          </button>
          {menuOpen && <div className="absolute right-0 top-11 z-30 min-w-40 rounded-xl border border-white/15 bg-[#202631] p-2 shadow-xl">
            <p className="truncate border-b border-white/10 px-2 py-2 text-white" title={identity.username ?? ""}>{identity.username}</p>
            <button type="button" disabled={busy || working} onClick={() => void logout()} className="mt-1 w-full rounded px-2 py-2 text-left hover:bg-white/10">退出登录</button>
          </div>}
        </>
      )}
      {mode && identity?.kind === "guest" && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMode(null); }}>
        <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm space-y-4 rounded-2xl border border-white/15 bg-[#202631] p-6 shadow-2xl" aria-label={mode === "login" ? "登录账号" : "注册账号"}>
          <h2 className="text-lg font-medium text-white">{mode === "login" ? "登录" : "注册"}</h2>
          <label className="block text-xs">用户名<input aria-label="用户名" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={100} required autoComplete="username" className="mt-1 w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 text-sm text-white" /></label>
          <label className="block text-xs">密码<input aria-label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoComplete={mode === "login" ? "current-password" : "new-password"} className="mt-1 w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 text-sm text-white" /></label>
          {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
          <div className="flex justify-end gap-3"><button type="button" onClick={() => setMode(null)}>取消</button><button type="submit" disabled={working} className="rounded-lg bg-emerald-200 px-4 py-2 text-[#17251f]">{working ? "处理中…" : "确认"}</button></div>
        </form>
      </div>}
      {!mode && error && <p role="alert" className="absolute right-0 top-12 z-30 min-w-48 rounded bg-red-900 px-3 py-2 text-xs text-red-100">{error}</p>}
    </div>
  );
}
