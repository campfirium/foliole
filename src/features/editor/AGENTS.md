# AGENTS

## Scope

- Applies to `src/features/editor/**`.

## Markdown Parser

- Route all Markdown parsing through `src/features/editor/model/folioleMarkdownParser.ts`.
- The current baseline is CodeMirror/Lezer Markdown: `markdownLanguage.parser` from `@codemirror/lang-markdown`, extended with Foliole syntax through `MarkdownConfig`.
- Do not add an independent Markdown parser, global string preprocessing, or storage-layer rewriting unless explicitly approved by the user in the current request and evaluated for the task.

## Markdown Compatibility

- Common syntax missed by a strict Markdown parser belongs to `Markdown Compatibility`. Handle it through parser extensions or projection by default, preserving the source text.
- Add compatibility syntax through the `MarkdownConfig` extension chain first. Do not reparse or override syntax already recognized by the standard parser.
- Use narrowly scoped compatibility names describing concrete behavior, such as `LenientStrongEmphasis`, rather than the originating scenario.
- Compatibility rules must not scan greedily across lines or run expensive regex backtracking over whole documents. Parse within bounds at relevant trigger characters only.
- New Markdown Compatibility requires at least parser-node and inline-projection tests. Add `markdownTableInline` reuse tests when table inline content may be affected.

## CodeMirror Layout

- Editor body selection/cursor layers are drawn by CodeMirror. Before changing `.cm-scroller`, `.cm-content`, `.cm-selectionLayer`, `.cm-cursorLayer`, scrollbar gutters, content centering, or horizontal padding, verify that text, selection, and cursor layers share the same horizontal coordinate basis.
- Do not apply rules such as `scrollbar-gutter: stable both-edges` to `.cm-scroller` when they change its content box without moving CodeMirror layers with it. If scrollbar space must change, first prove with reproducible screenshots or automated measurements that plain-text selection edges still align with character boundaries.
- Implement dividers, block hints, and reading aids that must align horizontally with editor text, Markdown rules, line boxes, or selection boundaries as CodeMirror decorations/block widgets first, reusing actual `.cm-content` / `.cm-line` geometry. Do not imitate the editor text rail with `max-width`, `padding-inline`, `calc()`, or pixel adjustments in outer React DOM.
- CM6 block widgets must not come directly from a `ViewPlugin` decoration provider. Use `StateField<DecorationSet>` exposed through `EditorView.decorations.from(field)` to avoid the runtime error `Block decorations may not be specified via plugins`.
