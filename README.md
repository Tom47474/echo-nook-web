# EchoNook Web

EchoNook 是一个面向桌面浏览器的虚拟陪伴频道。当前仓库是独立的前端项目，基于 Next.js、React、TypeScript 和 Tailwind CSS。当前版本提供频道场景、文字对话界面、连接 FastAPI 的可停止流式回复，以及由服务端数据库保存的历史会话。语音和虚拟人物将在后续迭代中接入。

## 本地运行

需要 Node.js 20.19 或更高版本及 npm；该版本要求同时覆盖 Next.js 运行和 jsdom 测试环境。

```bash
npm ci
npm run dev
```

先在独立的 `echo-nook-api` 仓库启动服务端（默认 `http://localhost:8000`），再访问 <http://localhost:3000>。前端仓库根目录已有本机 `.env.local`，其中 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`；如果服务端地址或端口变化，修改这个值并重启前端。模型 API Key 只放在服务端 `.env`。运行质量检查：

```bash
npm run lint
npm run build
```

输入文字后，前端调用服务端 `/api/v1/conversations/{conversation_id}/messages:stream` 并逐段显示回复。首次发送前如果没有活动会话，前端会先创建会话；刷新页面会读取服务端会话列表并打开最近会话。服务端的 `FRONTEND_ORIGIN` 应与浏览器访问前端的地址一致。

当前浏览器会先通过 `/api/v1/identity/bootstrap` 建立游客身份，之后的会话 REST 和 SSE 请求都携带服务端签发的 HttpOnly Cookie。顶部可注册、登录和退出；登录后若本浏览器有游客会话，页面会先询问是否导入，用户确认后才转移到账号。游客与账号都可使用文字对话；登录账号可在另一浏览器登录恢复自己的会话，游客凭证丢失后无法仅凭链接找回。界面不展示 token 用量。正式部署需同站 HTTPS，并检查 Cookie 和 `FRONTEND_ORIGIN` 配置。

## 环境与对话调试

复制 `.env.example` 可以查看完整配置。`APP_ENV` 使用 `development`、`test` 或 `production`，`ENABLE_CONVERSATION_DEBUG=true` 用于显式开启对话调试浮动球。调试面板只有在 `APP_ENV` 为 `development` 或 `test` 且开关为 `true` 时才挂载；`production` 即使误设开关也会强制关闭。`NEXT_PUBLIC_API_BASE_URL` 会进入浏览器构建产物，不能在任何 `NEXT_PUBLIC_` 变量中保存密钥。

浮动球提供消息插入、长文本、Markdown、批量消息、清空状态，以及阻止 SSE、部分回复后断流、缺少完成事件、慢速流、配置缺失、鉴权失败和模型限流等场景。故障模拟发生在浏览器端，不修改后端接口，也不代表模型供应商已经停止计算或计费。

调试工具代码保留在 `master` 及其派生分支中，确保从主分支创建的本地开发分支可以使用。是否显示只由运行环境门禁决定：本机使用 `APP_ENV=development`，测试服务器使用 `APP_ENV=test`，正式服务器使用 `APP_ENV=production`。

## 当前功能

- 桌面频道页面与窄屏纵向布局
- 消息输入、Enter 发送和 Shift + Enter 换行
- 真实流式回复、停止生成和新建对话
- 会话列表、新建、切换、删除及最近消息恢复
- 使用服务端数据库历史继续对话，浏览器不再提交历史上下文
- 失败时保留部分回答，可把原问题作为新回合再次提问
- 区分配置、鉴权、模型、限流、超时、网络和断流错误
- Markdown 回复安全渲染
- 对话区域独立状态和可替换的回复提供器
- 仅限开发与测试环境的对话调试浮动球和流式故障模拟

## 项目结构

```text
src/
├── app/                 Next.js 路由、根布局、全局样式
├── modules/
│   ├── channel/         频道页面、页头、静态场景
│   └── conversation/    消息 UI、状态 Hook、消息类型、回复提供器
└── shared/
    ├── lib/             无业务含义的通用函数
    └── ui/              无业务含义的基础组件
docs/                    架构和目录说明
public/                  可直接访问的静态资源
```

详细职责、依赖规则和后续接入方案见 [前端架构与目录说明](docs/frontend-architecture.md)。

## 前后端连接

后端位于独立仓库 `echo-nook-api`。`conversation-api.ts` 负责会话列表、创建、消息读取和删除；`http-reply-provider.ts` 负责持久化流式接口、SSE 解析和后端错误处理；`use-conversation.ts` 管理活动会话、消息状态、停止、切换隔离和再次提问，页面组件不直接调用接口。历史上下文由服务端数据库构造，前端只提交本次输入。`NEXT_PUBLIC_API_BASE_URL` 可覆盖默认后端地址。`demo-reply-provider.ts` 保留为离线演示实现，目前页面不使用它。

运行 `npm test` 执行会话 API 映射、对话 Hook、SSE 解析、切换隔离和流取消测试；提交前同时运行 `npm run lint` 与 `npm run build`。

第三阶段 S3-1 至 S3-4 已完成。当前会话写入 `/?conversation=<会话UUID>`；刷新或直接打开链接会恢复指定会话，浏览器后退/前进也会切换。已删除或无效链接会回退到最近会话并提示；其他加载失败会显示错误。首次读取最新 100 条消息；滚动到消息顶部或点击“加载更早消息”，会按 `before_sequence` 每次再读 50 条，并保持原阅读位置。新内容仅在用户接近底部时平滑跟随；向上阅读时可点击输入框上方、消息区水平居中的向下箭头平滑回到底部。
