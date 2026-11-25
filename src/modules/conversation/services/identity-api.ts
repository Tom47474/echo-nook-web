const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Identity = { id: string; kind: "guest" | "account"; username: string | null };

function endpoint(path: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}/api/v1/identity${path}`;
}

async function identityRequest(path: string, body?: object): Promise<Identity> {
  // 认证信息仅由浏览器 Cookie 携带；前端不读取或存储原始会话凭证。
  const response = await fetch(endpoint(path), {
    method: "POST", credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: { message?: string } } | null;
    throw new Error(payload?.detail?.message ?? "身份服务暂时不可用，请稍后重试。");
  }
  return response.json() as Promise<Identity>;
}

// 同一页面的消息和流式请求共用首次游客初始化，避免并发创建多个游客身份。
let bootstrapPromise: Promise<Identity> | null = null;
export function ensureIdentity(): Promise<Identity> {
  if (!bootstrapPromise) {
    bootstrapPromise = identityRequest("/bootstrap").catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}

async function changeIdentity(path: string, body?: object): Promise<Identity> {
  const identity = await identityRequest(path, body);
  // 登录或退出后，后续会话请求应识别新身份，不沿用首次游客初始化结果。
  bootstrapPromise = Promise.resolve(identity);
  return identity;
}

export const identityApi = {
  bootstrap: ensureIdentity,
  register: (username: string, password: string) => changeIdentity("/register", { username, password }),
  login: (username: string, password: string) => changeIdentity("/login", { username, password }),
  logout: () => changeIdentity("/logout"),
};
