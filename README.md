# EchoNook Web

EchoNook 是一个面向桌面浏览器的虚拟陪伴频道。当前仓库是独立的前端项目，基于 Next.js、React、TypeScript 和 Tailwind CSS。第一版提供频道场景、文字对话界面，以及连接 FastAPI 服务端的可停止流式回复。会话保存、语音和虚拟人物将在后续迭代中接入。

## 本地运行

需要 Node.js 20.9 或更高版本及 npm。

```bash
npm ci
npm run dev
```

先在独立的 `echo-nook-api` 仓库启动服务端（默认 `http://localhost:8000`），再访问 <http://localhost:3000>。前端仓库根目录已有本机 `.env.local`，其中 `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`；如果服务端地址或端口变化，修改这个值并重启前端。模型 API Key 只放在服务端 `.env`。运行质量检查：

```bash
npm run lint
npm run build
```

输入文字后，前端调用服务端 `/api/v1/conversations/messages:stream` 并逐段显示回复；刷新页面会清空当前对话。服务端的 `FRONTEND_ORIGIN` 应与浏览器访问前端的地址一致。

## 环境与对话调试

复制 `.env.example` 可以查看完整配置。`APP_ENV` 使用 `development`、`test` 或 `production`，`ENABLE_CONVERSATION_DEBUG=true` 用于显式开启对话调试浮动球。调试面板只有在 `APP_ENV` 为 `development` 或 `test` 且开关为 `true` 时才挂载；`production` 即使误设开关也会强制关闭。`NEXT_PUBLIC_API_BASE_URL` 会进入浏览器构建产物，不能在任何 `NEXT_PUBLIC_` 变量中保存密钥。

浮动球提供消息插入、长文本、Markdown、批量消息、清空状态，以及阻止 SSE、部分回复后断流、缺少完成事件和慢速流等场景。故障模拟发生在浏览器端，不修改后端接口，也不代表模型供应商已经停止计算或计费。

调试工具代码保留在 `master` 及其派生分支中，确保从主分支创建的本地开发分支可以使用。是否显示只由运行环境门禁决定：本机使用 `APP_ENV=development`，测试服务器使用 `APP_ENV=test`，正式服务器使用 `APP_ENV=production`。

## 当前功能

- 桌面频道页面与窄屏纵向布局
- 消息输入、Enter 发送和 Shift + Enter 换行
- 真实流式回复、停止生成和新建对话
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

后端位于独立仓库 `echo-nook-api`。`http-reply-provider.ts` 负责 `fetch`、SSE 解析及后端错误处理；`use-conversation.ts` 管理消息状态和停止操作，页面组件不直接调用接口。`NEXT_PUBLIC_API_BASE_URL` 可覆盖默认后端地址。`demo-reply-provider.ts` 保留为离线演示实现，目前页面不使用它。
