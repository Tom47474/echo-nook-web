# 前端架构与目录说明

## 项目目标

本仓库只负责 EchoNook 的浏览器界面。当前版本实现“用户输入 → FastAPI 流式回复 → 页面展示”的前后端闭环。语音、虚拟人物、背景音乐和知识库暂未实现。

本机服务端地址配置在仓库根目录的 `.env.local`：`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`。该变量会进入浏览器代码，只能放可公开的地址，不能放 API Key。修改后重启前端；服务端同时需要把 `FRONTEND_ORIGIN` 设为前端实际访问地址。

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `src/app/` | Next.js App Router 入口。`page.tsx` 组装首页，`layout.tsx` 设置页面元数据和根结构，`globals.css` 定义全局基础样式。这里不写对话业务逻辑。 |
| `src/modules/channel/` | 频道展示模块。`components/` 存放页面结构、页头和场景。`index.ts` 是模块公开入口。以后可在此组装角色与背景场景。 |
| `src/modules/conversation/` | 对话业务模块。封装消息展示、输入、状态和回复来源。`index.ts` 只导出外部需要的组件。 |
| `src/modules/conversation/components/` | 对话界面。`conversation-panel.tsx` 组装消息列表和输入，`message-list.tsx` 管理列表滚动与空状态，`message-item.tsx` 显示单条消息，`message-input.tsx` 处理输入和键盘操作。 |
| `src/modules/conversation/hooks/` | `use-conversation.ts` 管理发送、流式追加、停止、新对话及错误状态。它是 UI 与回复服务之间的协调层。 |
| `src/modules/conversation/model/` | `types.ts` 定义前端内部的消息与状态类型。以后后端 DTO 类型应另放在对话模块的 `api/` 中，经 mapper 转为此处类型。 |
| `src/modules/conversation/services/` | `reply-provider.ts` 定义回复接口；`http-reply-provider.ts` 发送请求并解析 SSE；`demo-reply-provider.ts` 保留作离线演示。 |
| `src/shared/ui/` | 按钮等无业务含义的复用组件。不能依赖 `modules/`。 |
| `src/shared/lib/` | 样式类合并等无业务含义的纯函数。不能存放消息或角色逻辑。 |
| `public/` | 静态资源目录。当前保留脚手架素材，后续放经授权的场景、角色等资源。 |
| `docs/` | 开发者文档。 |
| `.env.local` | 本机前端配置，设置后端公开地址；已被 Git 忽略。 |

## 主要文件

| 文件 | 职责 |
| --- | --- |
| `src/app/page.tsx` | 路由入口，只渲染 `ChannelPage`。 |
| `src/modules/channel/components/channel-page.tsx` | 频道页面布局，组合场景和对话模块。 |
| `src/modules/channel/components/scene-panel.tsx` | 当前的静态场景占位。 |
| `src/modules/conversation/components/conversation-panel.tsx` | 对话模块的客户端入口。 |
| `src/modules/conversation/hooks/use-conversation.ts` | 管理消息、生成状态、取消请求和错误。 |
| `src/modules/conversation/services/reply-provider.ts` | 约定流式回复的接口。 |
| `src/modules/conversation/services/http-reply-provider.ts` | 发送消息和最近 20 条历史，解析 `message.delta`、`message.completed`、`message.failed` 事件。 |
| `src/modules/conversation/services/demo-reply-provider.ts` | 离线演示文本实现，目前未接入页面。 |
| `src/shared/ui/button/index.tsx` | 通用按钮。 |
| `src/shared/lib/cn.ts` | 合并条件样式和 Tailwind 类名。 |

## 依赖方向

```text
app → channel → conversation → shared
               ↘ shared
```

`app` 负责路由，`channel` 负责页面组装，`conversation` 独立管理对话，`shared` 只提供通用能力。模块外部应从各模块的 `index.ts` 导入，不直接依赖其他模块内部文件。新模块如 `avatar`、`audio` 应由频道组装层连接，不让对话模块直接调用角色动画代码。

Next.js 页面默认保持服务端组件；需要事件与状态的 `ConversationPanel` 是客户端入口。这样客户端代码集中在交互模块中。

## 数据流

1. `MessageInput` 把文本交给 `useConversation`。
2. Hook 立即加入用户消息和空的助手消息。
3. `HttpReplyProvider` 请求 FastAPI，按 SSE 事件逐段返回文本，Hook 更新助手消息。
4. `MessageList` 展示消息；用户点击停止时，Hook 取消当前生成。

当前页面使用 `HttpReplyProvider`。本次输入单独作为 `message` 发送，已完成的消息作为 `history` 发送；停止操作通过 `AbortController` 取消请求。刷新页面后记录不会保留。后续增加服务端会话保存时，再引入会话 ID 和历史读取。

## 后续扩展约定

- 后端请求集中在 `conversation/services/` 的适配器中，组件不直接写 `fetch`。
- 后端 JSON 字段与前端消息类型通过 mapper 转换。
- 角色动画放在独立 `avatar` 模块，由页面组装层接收对话活动状态。
- 音频播放放在独立 `audio` 模块，不放进消息组件。
- 新增文件只在真实需求出现时创建，避免空目录和提前设计复杂抽象。

## 验收

先启动 FastAPI，再运行 `npm run dev`，在首页输入文字，确认真实回复逐段显示、停止按钮有效且新对话可清空记录。再执行 `npm run lint` 和 `npm run build`。
