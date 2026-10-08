# dsh-wide-session-drag

DSH（DeepSeek Harness）Windows 桌面端插件：实现左侧会话列表到右侧主工作区的**宽域拖拽引用**。

按住左侧任意会话卡片，拖过侧边栏分界线后，在右侧消息流、工具栏、空白区或底部输入框任意位置松开，都会自动聚焦到底部输入框并插入：

```markdown
@[会话标题](dsh-session:会话ID)
```

## 通过 GitHub 安装

在 DSH 客户端插件安装处输入仓库地址：

```text
https://github.com/qq625424994-svg/dsh-wide-session-drag
```

或在命令行执行：

```powershell
dsh plugin --profile desktop add github:qq625424994-svg/dsh-wide-session-drag
```

然后完全退出并重启 DSH 桌面端。

如果 `dsh` 命令不可用，先在 DSH 桌面端里启用命令行：`Application → Manage dsh Command`。

查看是否安装成功：

```powershell
dsh plugin --profile desktop list
```

## 使用方式

1. 在左侧会话列表按住一个会话。
2. 向右拖过分隔线，右侧会出现蓝色接收提示。
3. 在右侧任意位置松开鼠标。
4. 底部输入框自动聚焦并插入会话引用。

## 特性

- 零构建：`lib/client.js` 是 DSH 客户端可直接加载的 `window.__ModuleLoader__.load` 格式。
- 宽域释放：只要鼠标越过侧边栏/分隔条进入右侧区域即判定有效。
- 数据隔离：使用自定义 `application/x-dsh-session-drag` MIME，避免和原生文本拖拽、侧边栏重排序混淆。
- 生成中保护：如果底部输入框锁定，会 Toast 提示并暂存引用，生成结束后自动填入。
- 降级策略：DOM 中拿不到会话 ID 时，会尝试通过客户端 `sessions.list()` 按标题匹配；仍失败则插入纯 `@标题`。

## 引用解析说明

本插件负责**交互与插入引用文本**。如果你的 DSH 版本不会自动把 `dsh-session:` 引用解析成上下文快照，可再安装负责 host 侧解析的插件，例如 `dsh-session-link`：

```powershell
dsh plugin --profile desktop add dsh-session-link
```

## 目录结构

```text
dsh-wide-session-drag/
├── package.json        # DSH bundle + client manifest
├── cordis.patch.yml    # 宿主侧注册插件
├── lib/
│   ├── index.js        # Node 半，空 apply
│   └── client.js       # 浏览器半，宽域拖拽逻辑
└── README.md
```

## 已知限制

- 依赖 DSH 当前 DOM 结构中的侧边栏、分隔条和输入框特征；如果官方大改版，需要更新选择器。
- 多层 iframe 内部不会冒泡原生 drag 事件；本插件在顶层窗口判定坐标，因此释放到 iframe 上方时仍可由顶层 `drop` 捕获，但不保证所有嵌入式编辑器都响应 `input` 事件。
- 直接操作 contenteditable 的降级路径可能被 React/Lexical 重渲染覆盖；优先使用 `execCommand('insertText')` 和 `InputEvent` 触发编辑器自身更新。
