# Planned Remediation Priority

**日期**：2026-04-26
**范围**：汇总 `.lab/atlas/1planned/` 下各审计报告，形成后续实施顺序。
**用途**：后续按本文档顺序逐项实施；每次只领取一个 30-90 分钟内可验证的小任务。

---

## 结论

`1planned` 目录当前不是单一待办，而是多份审计报告。后续不按文件顺序处理，统一按以下优先级推进：

1. 用户会被误导的数据 / 状态 bug
2. 键盘与可访问性阻断
3. 跨平台功能缺口
4. 共享 UI / token 规范债
5. 阅读观感专项
6. 信息架构再确认
7. 发布前基础设施

实施时遵循根 `AGENTS.md`：小步、可验证、只改当前任务相关文件；涉及 renderer UI 时先读 `DESIGN.md` 与 `.lab/specs/shared/ui/llm-ui-rules.md`；涉及 UI 文案、空状态、按钮和命名时先读 `.lab/specs/_product/terminology-and-copy.md`。

**当前提交进度（2026-04-26）**：已推进到 `000759 refine external preview selection ui`。P0-A / P0-B / P0-C1 / P1-A-D1 / P1-A-D2 / P1-B-1 / P1-B-2 已提交；另已提交外部库预览 header / breadcrumb / import 浮层与列表多选态显示改进。下一项默认从 P1-B-3 行距三档设置开始，但该项属于永久设置，实施前必须走 settings provider 与持久化闭环。

**当前预览状态（2026-04-26）**：相关本地检查通过；`npm run windows:preview` 已执行，镜像同步成功（`status: SYNCED`），但 Windows 客户端 fallback start 失败：`status: START_FAILED reason=startup health check failed: app-ready-timeout`。日志停在 `database_open_connection_start`，未进入 renderer，需作为独立桌面启动链路问题处理。

---

## 0. 执行前固定检查

每次从本文档领取任务前：

1. 先确认当前工作区已有改动，避免混入他人未提交修改。
2. 如果任务涉及 `src/app/**`、`src/features/**`、`src/shared/ui/**` 或 `src/companion/**`，先读取：
   - `DESIGN.md`
   - `.lab/specs/shared/ui/llm-ui-rules.md`
3. 如果任务涉及空状态、错误状态、按钮、设置项、命令、菜单或用户可见文案，先读取：
   - `.lab/specs/_product/terminology-and-copy.md`
4. 可复现 bug 修复必须补至少 1 条自动化回归测试。
5. 修改仓库文件后，相关验证通过再按受影响宿主执行预览；桌面 renderer 默认执行 `npm run windows:preview`。

---

## P0-A. 空状态 / 错误状态误导

**来源文档**：`empty-error-state-audit.md`

### A1. External library loading 被渲染为空状态

**当前状态**：已实施（2026-04-26）。

**问题**：`ExternalLibraryListPanel` 把 `entriesByFolderId[id] === undefined` 当成 `[]`，用户会先看到 `No documents`，但真实含义可能是还在加载。

**实施范围**：

- `src/app/components/ExternalLibraryListPanel.tsx`
- 对应测试文件

**目标行为**：

- `undefined` 表示 loading。
- `[]` 表示真实 empty。
- 已加载数组正常展示。

**验收**：

- 新增或更新回归测试，覆盖 `undefined -> loading` 与 `[] -> empty`。
- 相关测试通过。

### A2. Import catalog IPC 失败静默变空态

**当前状态**：已实施（2026-04-26）。

**问题**：Import Overview、Readwise Books、PDF imports 在 runtime inventory 加载失败时会停留在 `null` 或空态，用户无法区分“真的没有数据”和“加载失败”。

**实施范围**：

- `src/app/components/importOverviewState.ts`
- `src/app/components/ImportOverviewPage.tsx`
- `src/app/components/ImportSourceWorkspaceReadwiseBooksPage.tsx`
- `src/app/components/ImportSourceWorkspacePdfPage.tsx`
- 必要时先补 `src/shared/ui` 错误状态原语

**目标行为**：

- `null` 表示 loading。
- `error` 表示失败并提供可重试入口。
- 空数组才显示真实 empty。

**验收**：

- 至少覆盖一个 IPC reject 的回归测试。
- 错误态不能复用真实 empty 文案。

### A3. Search / source details 错误吞没

**来源文档**：`empty-error-state-audit.md`

**当前状态**：已实施（2026-04-26）。

**范围**：

- `SearchPalette` 搜索 IPC reject。
- `useNodeSourceDetails` 与 `WorkspaceRightSidebarSourcePanel` 的 error 分支。

---

## P0-B. a11y 阻断

**来源文档**：`a11y-baseline-audit.md`

### B1. 三个 palette dialog 缺 focus trap / modal 语义

**当前状态**：已实施（2026-04-26）。

**问题**：`CommandPalette`、`SearchPalette`、`GoToNodePalette` 仍是手写 `role="dialog"`；缺 `aria-modal` 与焦点边界，Tab 可能走到背景 UI。

**实施范围**：

- `src/app/components/CommandPalette.tsx`
- `src/app/components/SearchPalette.tsx`
- `src/app/components/GoToNodePalette.tsx`
- 可能复用 `src/shared/ui/Dialog.tsx`

**建议策略**：

优先评估迁移到已有 `AppDialog`。如果结构代价过高，再补最小 focus trap、`aria-modal="true"` 与标题关联。

**验收**：

- 键盘 Tab / Shift+Tab 不离开打开的 palette。
- Esc 与遮罩关闭仍正常。
- 覆盖至少一个焦点行为或 dialog 语义测试；若测试环境不适合焦点断言，写清人工验证步骤。

### B2. 无可访问名的 input

**当前状态**：已实施（2026-04-26）。

**范围**：审计报告列出的搜索框、页码框、筛选框。

**目标**：不能只依赖 placeholder，补 `aria-label` 或正式 label。

---

## P0-C. 快捷键跨平台缺口

**来源文档**：`keyboard-shortcut-map.md`

### C1. Mac 缺少 priority mode 与 devtools 绑定

**当前状态**：已实施（2026-04-26）。

**范围**：

- `src/shared/commands/defaultShortcuts.ts`

**目标行为**：

- `enterPriorityMode` 增加 `Meta+M` secondary。
- `toggleDevTools` 增加 `Meta+Alt+I` secondary。

**验收**：

- 快捷键匹配 / 命令相关测试通过。
- 不改变 Windows/Linux 现有绑定。

### C2. 菜单 accelerator 与沉浸式快捷键登记

**处理时机**：C1 后，作为独立 P1 任务。

**注意**：涉及 Electron 菜单时，实施前读取 `electron/AGENTS.md`。

---

## P1-A. Design token 规范债

**来源文档**：`design-token-audit.md`

### D1. 建立错误态 semantic token

**当前状态**：已实施（2026-04-26）：已补 Tailwind `error` token，并替换 desktop settings / shared UI、companion 与启动错误页错误文案；编辑器 diff surface 已改为语义变量。

**范围**：

- `src/app/styles.css`
- `tailwind.config.js`
- 相关 settings / companion / shared UI 错误文案

**目标行为**：

- 建立 `error` / `error-subtle` / `error-foreground` 等语义 token。
- 替换普通错误文案的 Tailwind 原始红色。

**注意**：

- 涉及 `src/companion/**` 时读取 `src/companion/AGENTS.md`。
- 不把 color picker 光谱、alpha 棋盘这类工具型视觉一并卷入第一轮。

### D2. 启动错误页与编辑器 diff token

**当前状态**：已实施（2026-04-26）。

**范围**：

- `src/startupErrorView.ts`
- `src/features/editor/adapters/liveMarkdownTheme.ts`

---

## P1-B. 阅读观感专项

**来源文档**：`reading-typography-rules.md`

**当前判断**：

- `src/app/styles.css` 已经包含 `-webkit-font-smoothing: antialiased` 与 `text-rendering: optimizeLegibility`，所以审计报告第一项已部分落地。
- 仍需确认 `font-synthesis-weight: none`、`strong/b` 字重、深色正文字色与行高策略。

**建议拆分**：

1. 补 `font-synthesis-weight: none` 与 `strong/b` 字重策略。（已实施，2026-04-26）
2. 单独评估深色 token，避免直接按报告里的色值机械替换。（已实施，2026-04-26：仅收敛阅读正文 token，不改全局暗色 foreground）
3. 行距三档属于设置能力，若要做，必须先声明该设置为永久态，并走 settings provider 与持久化闭环。（下一项）

---

## P2. 信息架构再确认

**来源文档**：`information-architecture-audit.md`

**当前判断**：该报告有过期点。

审计报告提到 `menuModel.ts` 的 `SECTION_ORDER`，但当前 `menuModel.ts` 已经不再保留该常量，命令面板现在折成单个 `Commands` 分组。因此不能直接按报告修改。

**下一步**：

1. 先重新确认命令面板目标结构：单分组还是恢复多分组。
2. 如果恢复多分组，再处理 Import / Developer / Create 的排序与归属。
3. Settings 分组调整单独拆任务，避免与 command palette 一起改。

**实施前必读**：

- `.lab/specs/_product/methodology.md`
- `.lab/specs/_product/terminology-and-copy.md`

---

## P3. 发布前基础设施

**来源文档**：`preflight-checklist.md`

**当前定位**：

这些是首次公开发布阻断项，但不是日常产品可用性 bug。如果当前目标不是马上发安装包，排在 P0/P1 产品体验问题之后。

**升为 P0 的条件**：

- 用户明确要准备 0.1.0 安装包或公开发布。
- 需要实际分发 Windows/macOS/Linux 桌面包。

**发布前必须处理**：

- 图标全家桶。
- Windows 签名。
- macOS 签名与公证。
- 自动更新策略。
- `better-sqlite3` native module / asar 构建验证。

**实施前必读**：

- `electron/AGENTS.md`
- `.lab/specs/desktop/electron/windows-dev-loop.md`
- Electron builder / signing / notarization 官方文档

---

## 非实施类文档

**来源文档**：`non-code-audit-cadence.md`

该文档是审计节奏表，不是代码实施任务。后续用途：

- 记录哪些审计已完成。
- 决定下一轮何时复扫。
- 不直接作为 `.lab/atlas/todo.md` 的任务来源。

---

## 推荐实施顺序

1. A1 External library loading/empty 修复。
2. A2 Import catalog loading/error/retry 修复。
3. B1 Palette dialog focus trap / modal 语义。
4. C1 Mac 快捷键缺口。
5. D1 错误态 semantic token。
6. B2 input 可访问名。
7. A3 Search / source details 错误分支。
8. D2 启动错误页与编辑器 diff token。
9. 阅读观感专项。
10. 信息架构再确认。
11. 发布前基础设施。

每次实施完成后，在对应来源审计报告或后续台账中标记真实状态，避免 `1planned` 再次积累过期结论。
