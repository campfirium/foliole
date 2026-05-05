# AGENTS

## Scope

- 本规则适用于 `src/features/editor/**`。
- 触及 renderer UI 时仍必须按根规则读取 `DESIGN.md` 与 `.lab/specs/shared/ui/llm-ui-rules.md`。

## Markdown Parser

- Markdown 解析统一从 `src/features/editor/model/folioleMarkdownParser.ts` 进入。
- 当前基线是 CodeMirror / Lezer Markdown parser：`@codemirror/lang-markdown` 的 `markdownLanguage.parser`，再通过 `MarkdownConfig` 扩展 Foliole 语法。
- 不新增独立 Markdown parser、全局字符串预处理或存储层改写，除非用户当次明确批准并完成任务评估。

## Markdown Compatibility

- 常见但严格 Markdown parser 漏收的写法，归入 `Markdown Compatibility`，默认通过 parser extension 或 projection 层兼容，保持原文不变。
- 新增兼容语法时优先加在 `MarkdownConfig` 扩展链路中；标准 parser 已能识别的语法不得重复解析或覆盖。
- 兼容规则必须窄范围命名，节点名表达具体行为，例如 `LenientStrongEmphasis`，不要用来源场景命名。
- 兼容规则不得跨行贪婪扫描，不得对整篇文档做高成本正则回溯；只在相关触发字符处做有界解析。
- 新增 Markdown Compatibility 必须至少补 parser 节点测试与 inline projection 测试；若表格 inline 会受影响，必须补 `markdownTableInline` 复用测试。

## CodeMirror Layout

- 编辑器正文使用 CodeMirror 自绘 selection / cursor layer；改动 `.cm-scroller`、`.cm-content`、`.cm-selectionLayer`、`.cm-cursorLayer`、滚动条 gutter、内容居中或横向 padding 时，必须先确认文字层、选区层、光标层使用同一个横向坐标基准。
- 禁止在 `.cm-scroller` 上使用 `scrollbar-gutter: stable both-edges` 这类会改变 scroller 内容盒但不同步移动 CodeMirror layer 的规则；若必须调整滚动条占位，先用可复现截图或自动化测量证明普通文本选区边缘和字符边界仍贴合。
- 需要与编辑器正文、Markdown 水平线、行盒或选区横向边界对齐的分隔线、块级提示和阅读辅助元素，必须优先实现为 CodeMirror decoration / block widget，并复用 `.cm-content` / `.cm-line` 的真实几何；禁止在外层 React DOM 里用 `max-width`、`padding-inline`、`calc()` 或 px 微调去模拟编辑器文本 rail。
- CM6 block widget 不得由 `ViewPlugin` 的 decorations 直接提供；这类块级装饰必须使用 `StateField<DecorationSet>` 并通过 `EditorView.decorations.from(field)` 暴露，避免运行时 `Block decorations may not be specified via plugins`。
