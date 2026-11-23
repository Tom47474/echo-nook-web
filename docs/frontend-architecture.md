# 前端架构与目录说明

## 项目目标

本仓库只负责 EchoNook 的浏览器界面。当前版本实现“用户输入 → FastAPI 流式回复 → 页面展示”的前后端闭环。语音、虚拟人物、背景音乐和知识库暂未实现。

本机服务端地址配置在仓库根目录的 `.env.local`：`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`。该变量会进入浏览器代码，只能放可公开的地址，不能放 API Key。修改后重启前端；服务端同时需要把 `FRONTEND_ORIGIN` 设为前端实际访问地址。环境变量模板见 `.env.example`。

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `src/app/` | Next.js App Router 入口。`page.tsx` 组装首页，`layout.tsx` 设置页面元数据和根结构，`globals.css` 定义全局基础样式。这里不写对话业务逻辑。 |
| `src/modules/channel/` | 频道展示模块。`components/` 存放页面结构、页头和场景。`index.ts` 是模块公开入口。以后可在此组装角色与背景场景。 |
| `src/modules/conversation/` | 对话业务模块。封装消息展示、输入、状态和回复来源。`index.ts` 只导出外部需要的组件。 |
| `src/modules/conversation/components/` | 对话界面。`conversation-panel.tsx` 组装消息列表和输入，`message-list.tsx` 管理列表滚动与空状态，`message-item.tsx` 显示单条消息，`message-input.tsx` 处理输入和键盘操作。 |
| `src/modules/conversation/hooks/` | `use-conversation.ts` 管理发送、流式追加、失败保留、停止、重试、重新生成及新对话。它是 UI 与回复服务之间的协调层。 |
| `src/modules/conversation/model/` | `types.ts` 定义消息、回合、状态和错误类型；`conversation-error.ts` 统一错误码、是否可重试及异常转换。以后后端 DTO 类型应另放在对话模块的 `api/` 中，经 mapper 转为此处类型。 |
| `src/modules/conversation/services/` | `reply-provider.ts` 定义回复接口；`http-reply-provider.ts` 发送请求并解析 SSE；`demo-reply-provider.ts` 保留作离线演示。 |
| `src/modules/conversation/components/conversation-debug-panel.tsx` | 仅在受控环境挂载的调试浮动球，提供消息注入、清空和故障场景选择。 |
| `src/modules/conversation/services/debug-reply-provider.ts` | 包装真实回复 Provider，在浏览器端制造阻止请求、断流、缺少完成事件、慢速流和模型服务错误。 |
| `src/shared/ui/` | 按钮等无业务含义的复用组件。不能依赖 `modules/`。 |
| `src/shared/lib/` | 样式类合并等无业务含义的纯函数。不能存放消息或角色逻辑。 |
| `public/` | 静态资源目录。当前保留脚手架素材，后续放经授权的场景、角色等资源。 |
| `docs/` | 开发者文档。 |
| `.env.local` | 本机前端配置，设置后端公开地址；已被 Git 忽略。 |
| `.env.example` | 可提交的环境配置模板，不包含密钥，默认关闭调试能力。 |

## 主要文件

| 文件 | 职责 |
| --- | --- |
| `src/app/page.tsx` | 路由入口，只渲染 `ChannelPage`。 |
| `src/modules/channel/components/channel-page.tsx` | 频道页面布局，组合场景和对话模块。 |
| `src/modules/channel/components/scene-panel.tsx` | 当前的静态场景占位。 |
| `src/modules/conversation/components/conversation-panel.tsx` | 对话模块的客户端入口。 |
| `src/modules/conversation/hooks/use-conversation.ts` | 管理消息、回合、生成状态、取消、失败保留、重试和重新生成。 |
| `src/modules/conversation/services/reply-provider.ts` | 约定流式回复的接口。 |
| `src/modules/conversation/services/http-reply-provider.ts` | 按完整回合构造最近 20 条历史，解析流事件和错误码，并在提前退出时取消响应读取器。 |
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
4. 正常完成时助手消息标记为 `completed`；失败时保留已有文本并标记为 `failed`，同时保存结构化错误。
5. `MessageList` 展示消息；用户可以停止、重试失败或取消的最新回复，也可以重新生成最新的完整回复。

调试启用时，Hook 在每次发送开始时记录当前故障场景，并用 `DebugReplyProvider` 包装 HTTP Provider。一次请求期间更改场景不会改变已经开始的流。插入消息和清空操作只修改浏览器内存，不调用服务端。

当前页面使用 `HttpReplyProvider`。本次输入单独作为 `message` 发送，历史按 `turnId` 保持完整回合并限制在 20 条以内。完成回复原样进入上下文；失败或取消但已有内容的回复附加内部“未完整生成”标记后进入后续上下文；空的失败或取消回复只保留对应用户消息。该标记只发给模型，不修改界面正文。

重试和重新生成只允许操作最新的真实助手回复，复用原用户消息、原助手消息 ID 和回合 ID，清空旧助手正文后原地生成，因此不会重复插入用户消息。配置缺失、鉴权失败和模型不可用属于不可直接重试错误；网络、限流、超时、生成失败及断流允许重试。停止操作通过 `AbortController` 取消请求，Hook 使用同步消息引用避免停止后立即发送恢复旧状态。刷新页面后记录仍不会保留。

## 环境门禁

`src/app/page.tsx` 在服务端读取 `APP_ENV` 和 `ENABLE_CONVERSATION_DEBUG`。只有 `APP_ENV=development|test` 且调试开关为 `true` 时，才把启用标志传给客户端对话组件；环境缺失时按 `production` 处理并关闭调试。正式环境不能通过查询参数或浏览器存储开启面板。测试部署通常仍运行 production 构建，因此不能只依赖 `NODE_ENV`。

调试代码属于主线代码并保留在 `master`，Git 分支不参与运行时门禁。从 `master` 创建开发分支后，本机 `.env.local` 使用 `APP_ENV=development` 和显式调试开关即可显示浮动球；正式部署使用同一份代码，但 `APP_ENV=production` 会强制关闭。

| 变量 | 可见范围 | 作用 |
| --- | --- | --- |
| `APP_ENV` | 服务端构建/渲染 | 标识 development、test、production。 |
| `ENABLE_CONVERSATION_DEBUG` | 服务端构建/渲染 | 显式允许挂载调试能力，默认关闭。 |
| `NEXT_PUBLIC_API_BASE_URL` | 浏览器 | 指定公开的 API 地址；构建后固定，不得包含密钥。 |

## 后续扩展约定

- 后端请求集中在 `conversation/services/` 的适配器中，组件不直接写 `fetch`。
- 后端 JSON 字段与前端消息类型通过 mapper 转换。
- 角色动画放在独立 `avatar` 模块，由页面组装层接收对话活动状态。
- 音频播放放在独立 `audio` 模块，不放进消息组件。
- 新增文件只在真实需求出现时创建，避免空目录和提前设计复杂抽象。

## 验收

先启动 FastAPI，再运行 `npm run dev`，在首页输入文字，确认真实回复逐段显示、停止按钮有效且新对话可清空记录。开启调试时检查部分内容后断流会保留正文并显示重试、不可重试错误不显示重试、停止后可立即发送，以及重新生成不会增加用户消息。执行 `npm test`、`npm run lint` 和 `npm run build`。正式构建需要额外以 `APP_ENV=production ENABLE_CONVERSATION_DEBUG=true` 验证误设开关时仍不挂载浮动球。
