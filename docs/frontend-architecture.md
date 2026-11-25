# 前端架构与目录说明

## 项目目标

本仓库只负责 EchoNook 的浏览器界面。当前版本实现“当前身份唯一窗口 → 数据库消息恢复 → 用户输入 → FastAPI 持久化流式回复 → 页面展示”的前后端闭环。语音、虚拟人物、背景音乐和知识库暂未实现。

本机服务端地址配置在仓库根目录的 `.env.local`：`NEXT_PUBLIC_API_BASE_URL=http://localhost:8000`。该变量会进入浏览器代码，只能放可公开的地址，不能放 API Key。修改后重启前端；服务端同时需要把 `FRONTEND_ORIGIN` 设为前端实际访问地址。环境变量模板见 `.env.example`。

## 目录职责

| 路径 | 作用 |
| --- | --- |
| `src/app/` | Next.js App Router 入口。`page.tsx` 组装首页，`layout.tsx` 设置页面元数据和根结构，`globals.css` 定义全局基础样式。这里不写对话业务逻辑。 |
| `src/modules/channel/` | 频道展示模块。`components/` 存放页面结构、页头和场景。`index.ts` 是模块公开入口。以后可在此组装角色与背景场景。 |
| `src/modules/conversation/` | 对话业务模块。封装消息展示、输入、状态和回复来源。`index.ts` 只导出外部需要的组件。 |
| `src/modules/conversation/components/` | 对话界面。`conversation-panel.tsx` 组装单窗口消息、输入和清空入口；`identity-controls.tsx` 在页头提供登录、注册、默认头像和退出菜单。 |
| `src/modules/conversation/hooks/` | `use-current-conversation.ts` 管理当前窗口、消息恢复、分页、清空、发送、流式追加、失败保留和停止。它是 UI 与服务之间的协调层。 |
| `src/modules/conversation/model/` | `types.ts` 定义消息、回合、会话、状态和错误类型；`conversation-error.ts` 统一错误码、是否可再次提问及异常转换。后端 DTO 保留在 `services/conversation-api.ts` 的适配边界内，经 mapper 转为此处类型。 |
| `src/modules/conversation/services/` | `conversation-api.ts` 适配会话 REST API 和 DTO；`reply-provider.ts` 定义流事件接口；`http-reply-provider.ts` 调用持久化流式接口并解析 SSE；`demo-reply-provider.ts` 保留作离线演示。 |
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
| `src/modules/conversation/hooks/use-current-conversation.ts` | 管理唯一窗口、消息恢复、生成状态、取消、清空和分页。 |
| `src/modules/conversation/services/conversation-api.ts` | 调用当前窗口、消息查询和清空接口，把后端 snake_case DTO 映射为前端模型。 |
| `src/modules/conversation/services/reply-provider.ts` | 约定流式回复的接口。 |
| `src/modules/conversation/services/http-reply-provider.ts` | 只提交会话 ID 和本次输入，解析 `started/delta/completed/failed` 流事件，并在提前退出时取消响应读取器。 |
| `src/modules/conversation/services/demo-reply-provider.ts` | 离线演示文本实现，目前未接入页面。 |
| `src/shared/ui/button/index.tsx` | 通用按钮。 |
| `src/shared/lib/cn.ts` | 合并条件样式和 Tailwind 类名。 |

## 依赖方向

```text
app → channel → conversation → shared
               ↘ shared
```

`app` 负责路由，`channel` 负责页面组装，`conversation` 独立管理对话，`shared` 只提供通用能力。模块外部应从各模块的 `index.ts` 导入，不直接依赖其他模块内部文件。新模块如 `avatar`、`audio` 应由频道组装层连接，不让对话模块直接调用角色动画代码。

`ChannelPage` 是客户端身份协调入口；先初始化游客或账号身份，再挂载以身份 ID 为 key 的 `ConversationPanel`。`page.tsx` 仍负责服务端环境门禁。

## 数据流

1. `ChannelPage` 调用 `/identity/bootstrap`；页头按身份显示登录/注册或头像菜单，不显示游客状态文字。
2. 对话 Hook 调用 `GET /api/v1/conversations/current` 获取当前身份唯一窗口，再读取最新 100 条消息。账号登录或退出使 Hook 以新身份重新挂载；游客与账号消息始终隔离。
3. 发送时先乐观显示用户和助手消息，SSE 的 `message.started` 返回正式 UUID/sequence，之后 `delta/completed/failed` 更新助手气泡。停止时取消浏览器请求，服务端保存终态。
4. 消息向上分页仍使用 `before_sequence`；滚动补偿和回到底部箭头保持原行为。
5. 点击对话区清空按钮并确认后，Hook 停止当前流，调用 `DELETE /api/v1/conversations/current/messages`。成功清空本地消息；失败时重新加载服务端真值。内部用量记录由服务端保留。

多会话列表、新建、切换、逐会话删除和 `?conversation=` URL 参数已从前端移除。服务端旧路由暂保留兼容，不参与当前页面。调试浮动球的“清空并重置”只影响浏览器内存；页面标题栏的“清空对话”会删除服务端持久化消息，两者用途不同。模型上下文仍由服务端根据当前窗口的数据库消息构造。

登录只切换到账号窗口，退出恢复本浏览器的游客窗口，不提供游客消息导入。Cookie 失效后旧游客窗口无法靠页面链接恢复。界面不展示 token 用量。正式部署仍须联调同站 HTTPS Cookie。

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

先启动 FastAPI，再运行 `npm run dev`，确认游客与账号各自的单窗口可加载，登录和退出切换内容且互不混合，清空只作用于当前身份，刷新后消息能够恢复。开启调试时检查部分内容后断流会保留正文、不可重试错误不显示再次提问、停止后可立即发送。执行 `npm test`、`npm run lint` 和 `npm run build`。正式构建需要额外以 `APP_ENV=production ENABLE_CONVERSATION_DEBUG=true` 验证误设开关时仍不挂载浮动球。
