export const allowedRegexInventory = [
  { path: 'src/features/editor/adapters/codeMirrorTextHistory.ts', line: '!USER_TEXT_EVENT.test(userEvent)', owner: 'editor text history', reason: 'Limits native history capture to CodeMirror user text events.' },
  {
    path: 'src/features/editor/adapters/markdownInputAssist.ts',
    line: 'const CODE_FENCE_PATTERN = /^\\s*`{3,}/;',
    owner: 'typing assist'
  },
  {
    path: 'src/features/editor/adapters/markdownInputAssist.ts',
    line: 'return /^\\s*``$/.test(before) && after.length === 0;',
    owner: 'typing assist'
  },
  {
    path: 'src/features/editor/adapters/markdownInputAssist.ts',
    line: "const indent = lineText.match(/^\\s*/)?.[0] ?? '';",
    owner: 'typing assist'
  },
  {
    path: 'src/features/editor/adapters/markdownInputAssist.ts',
    line: "openingFenceIndent = line.text.match(/^\\s*/)?.[0] ?? '';",
    owner: 'typing assist'
  },
  {
    path: 'src/features/editor/adapters/markdownInputAssist.ts',
    line: 'if (!CODE_FENCE_PATTERN.test(line.text)) {',
    owner: 'typing assist'
  },
  {
    path: 'src/features/editor/adapters/markdownInputAssist.ts',
    line: 'if (nextLine && CODE_FENCE_PATTERN.test(nextLine.text)) {',
    owner: 'typing assist'
  },
  {
    path: 'src/features/editor/components/MarkdownTablePreviewDialog.tsx',
    line: 'const COLUMN_SPLIT_PATTERN = /[\\s,，、/|;；:：()[\\]{}]+/;',
    owner: 'column width measurement'
  },
  {
    path: 'src/features/editor/components/MarkdownTablePreviewDialog.tsx',
    line: 'if (/\\s/.test(character)) return sum + 0.35;',
    owner: 'column width measurement'
  },
  {
    path: 'src/features/editor/components/MarkdownTablePreviewDialog.tsx',
    line: 'if (/[A-Za-z0-9]/.test(character)) return sum + 1;',
    owner: 'column width measurement'
  },
  {
    path: 'src/features/editor/model/anchorClipboardExport.ts',
    line: 'const HIGHLIGHT_MARKER_PATTERN = /==([\\s\\S]+?)==/g;',
    owner: 'external clipboard HTML export'
  },
  {
    path: 'src/features/editor/model/anchorClipboardExport.ts',
    line: 'const withUnderline = withImages.replaceAll(/<u>([\\s\\S]*?)<\\/u>/g, (_match, text: string) => {',
    owner: 'external clipboard HTML export'
  },
  {
    path: 'src/features/editor/model/anchorClipboardExport.ts',
    line: '.split(/\\n{2,}/)',
    owner: 'external clipboard block export'
  },
  {
    path: 'src/features/editor/model/editorMouseGestureSettings.ts',
    line: "const match = /^#([0-9a-fA-F]{6})$/.exec(value?.trim() ?? '');",
    owner: 'color setting validation'
  },
  { path: 'src/features/editor/model/editorTextOperationGrouping.ts', line: 'JOINABLE_USER_EVENT.test(next.userEvent) &&', owner: 'editor text history', reason: 'Groups adjacent typing and delete events without parsing Markdown.' },
  {
    path: 'src/features/editor/model/highlightAnnotationPrefixSetting.ts',
    line: "const normalized = (value ?? '').replace(/\\r\\n?/g, '\\n').split('\\n')[0]?.slice(0, HIGHLIGHT_ANNOTATION_PREFIX_MAX_LENGTH) ?? '';",
    owner: 'single-line annotation prefix setting'
  },
  {
    path: 'src/features/editor/model/markdownCompatibilityExtension.ts',
    line: 'const match = /^(#{1,6})([ \\t]+)(\\S.*)$/.exec(inner);',
    owner: 'lenient strong ATX heading compatibility'
  },
  {
    path: 'src/features/editor/model/markdownCompatibilityExtension.ts',
    line: 'function addLenientStrongATXHeading(cx: BlockContext, line: Line, text: string, match: RegExpExecArray) {',
    owner: 'lenient strong ATX heading compatibility'
  },
  {
    path: 'src/features/editor/model/markdownCompatibilityExtension.ts',
    line: 'return /\\p{P}/u.test(String.fromCodePoint(value));',
    owner: 'lenient strong marker punctuation guard'
  },
  {
    path: 'src/features/editor/model/markdownCompatibilityExtension.ts',
    line: 'return /^(#{1,6})([ \\t]+)(\\S.*)$/.test(inner);',
    owner: 'lenient strong ATX heading compatibility'
  },
  {
    path: 'src/features/editor/adapters/htmlPaste.ts',
    line: "const baseName = originalName.replace(/\\.[^.]+$/, '').trim();",
    owner: 'clipboard image filename cleanup'
  },
  { path: 'src/features/editor/adapters/liveMarkdownFrontmatterWidget.ts', line: 'if (!/^[^\\s:/?#]+\\.[^\\s:/?#]+(?:[/?#].*)?$/.test(text)) return null;', owner: 'frontmatter link widget', reason: 'Recognizes bare host-like values before rendering an external link widget.' },
  { path: 'src/features/editor/adapters/liveMarkdownFrontmatterWidget.ts', line: "return url ? url.hostname.replace(/^www\\./i, '') : value;", owner: 'frontmatter link widget', reason: 'Normalizes displayed host labels without changing the stored frontmatter value.' },
  { path: 'src/features/editor/adapters/liveMarkdownTableScaffolds.ts', line: "return text.includes('|') && /^[\\s|]+$/.test(text);", owner: 'table scaffold rendering', reason: 'Detects pipe-only scaffold rows for table editing assistance.' },
  {
    path: 'src/features/editor/adapters/lineDiffDecorations.ts',
    line: "return text.replace(/^\\s*#{1,6}\\s*/, '');",
    owner: 'diff spacer display normalization'
  },
  {
    path: 'src/features/editor/adapters/lineDiffDecorations.ts',
    line: "return text.replace(/^(\\s*(?:>\\s*)+)/, '');",
    owner: 'diff spacer display normalization'
  },
  {
    path: 'src/features/editor/adapters/lineDiffDecorations.ts',
    line: "return text.replace(/^(\\s*[-*+]\\s+)/, '• ');",
    owner: 'diff spacer display normalization'
  },
  {
    path: 'src/features/editor/adapters/lineDiffDecorations.ts',
    line: "return text.replace(/^(\\s*)(\\d+)([.)])(\\s+)/, '$2$3 ');",
    owner: 'diff spacer display normalization'
  },
  {
    path: 'src/features/editor/model/documentOutline.ts',
    line: "return collectMarkdownHeadingRanges(content.replace(/\\r\\n/g, '\\n')).map((heading) => ({",
    owner: 'document outline line ending normalization'
  },
  {
    path: 'src/features/editor/model/markdownHeadingProjection.ts',
    line: "return sliceWithoutRanges(source, from, to, hiddenRanges).trim().replace(/\\s+/g, ' ');",
    owner: 'heading text whitespace normalization'
  },
  { path: 'src/features/editor/model/markdownImageSize.ts', line: 'const match = OBSIDIAN_IMAGE_SIZE_SUFFIX.exec(label);', owner: 'image size suffix parsing', reason: 'Parses the Obsidian-compatible image width suffix without owning general Markdown rendering.' },
  { path: 'src/features/editor/model/markdownFrontmatterProjection.ts', line: 'return /^https?:\\/\\/\\S+$/i.test(value);', owner: 'frontmatter URL projection', reason: 'Classifies complete HTTP(S) frontmatter values for link projection.' },
  {
    path: 'src/features/editor/model/markdownInlineProjection.ts',
    line: 'const PUNCTUATION_PATTERN = /^[.,;:!?]+$/;',
    owner: 'autolink punctuation trimming'
  },
  {
    path: 'src/features/editor/model/markdownInlineProjection.ts',
    line: 'if (!rawText || PUNCTUATION_PATTERN.test(rawText)) return null;',
    owner: 'autolink punctuation trimming'
  },
  {
    path: 'src/features/editor/model/markdownInlineProjection.ts',
    line: 'if (!rawText || PUNCTUATION_PATTERN.test(rawText)) return null;',
    owner: 'autolink punctuation trimming'
  },
  {
    path: 'src/features/editor/model/markdownLinkReferences.ts',
    line: "return value.trim().split(/\\s+/).join(' ');",
    owner: 'link reference label normalization'
  },
  {
    path: 'src/features/editor/model/markdownOblikeInlineProjection.ts',
    line: "return note.replace(/\\\\([\\\\}])/g, '$1').trim() || null;",
    owner: 'OB-like footnote note unescape'
  },
  { path: 'src/features/editor/model/markdownTableCells.ts', line: 'const leadingWhitespace = rawText.match(/^\\s*/)?.[0].length ?? 0;', owner: 'markdown table cell projection', reason: 'Preserves table cell offsets while projecting cell text.' },
  {
    path: 'src/features/editor/model/markdownThematicBreakProjection.ts',
    line: "from: offset + lineStart + (line.match(/^\\s*/)?.[0].length ?? 0),",
    owner: 'thematic break marker trimming'
  },
  {
    path: 'src/features/editor/model/markdownThematicBreakProjection.ts',
    line: "if (/^\\s*(```|~~~)/.test(line)) {",
    owner: 'thematic break fence guard'
  },
  {
    path: 'src/features/editor/model/markdownThematicBreakProjection.ts',
    line: "to: offset + lineEnd - (line.match(/\\s*$/)?.[0].length ?? 0)",
    owner: 'thematic break marker trimming'
  },
  {
    path: 'src/features/editor/model/markdownThematicBreakProjection.ts',
    line: "} else if (!inFence && /^\\s*-{3,}\\s*$/.test(line)) {",
    owner: 'thematic break marker detection'
  },
  { path: 'src/features/editor/adapters/liveMarkdownCodeFenceHighlight.ts', line: "const match = /^[0-9]+(?:\\.[0-9]+)?/.exec(code.slice(from));", owner: 'code fence syntax highlight', reason: 'Tokenizes number literals inside rendered code fences.' },
  { path: 'src/features/editor/adapters/liveMarkdownCodeFenceHighlight.ts', line: "return /[A-Za-z0-9_$-]/.test(char);", owner: 'code fence syntax highlight', reason: 'Classifies identifier continuation characters for code fence highlighting.' },
  { path: 'src/features/editor/adapters/liveMarkdownCodeFenceHighlight.ts', line: "return /[A-Za-z_$]/.test(char);", owner: 'code fence syntax highlight', reason: 'Classifies identifier start characters for code fence highlighting.' },
  { path: 'src/features/editor/adapters/liveMarkdownCodeFenceHighlight.ts', line: "while (index < code.length && /\\s/.test(code[index] ?? '')) index += 1;", owner: 'code fence syntax highlight', reason: 'Skips local whitespace while tokenizing code fence contents.' },
  { path: 'src/features/editor/adapters/liveMarkdownCodeFenceHighlight.ts', line: "} else if (/[0-9]/.test(char)) {", owner: 'code fence syntax highlight', reason: 'Routes numeric characters to the code fence number tokenizer.' },
  { path: 'src/features/editor/adapters/liveMarkdownLinePlugin.ts', line: 'const LINE_MARKDOWN_DECORATION_CONTEXT_PATTERN = /[\\\\`*_{}[\\]()#+|<>]/;', owner: 'live markdown parse reuse', reason: 'Detects inline Markdown decoration context before using mapped decoration reuse for plain text input.' },
  { path: 'src/features/editor/adapters/liveMarkdownLinePlugin.ts', line: 'const LINE_MARKDOWN_STRUCTURAL_CONTEXT_PATTERN = /^\\s*(?:[-+]\\s|\\d+[.)]\\s|>{1,}\\s|#{1,6}\\s|---+\\s*$|___+\\s*$)/;', owner: 'live markdown parse reuse', reason: 'Detects structural line Markdown context before using mapped decoration reuse.' },
  { path: 'src/features/editor/adapters/liveMarkdownLinePlugin.ts', line: 'const MARKDOWN_INSERTION_CONTEXT_PATTERN = /[\\\\`*_{}[\\]()#+\\-!|<>]/;', owner: 'live markdown parse reuse', reason: 'Avoids mapped decoration reuse when inserted text can introduce Markdown syntax.' },
  { path: 'src/features/editor/adapters/liveMarkdownLinePlugin.ts', line: 'return LINE_MARKDOWN_DECORATION_CONTEXT_PATTERN.test(lineText) ||', owner: 'live markdown parse reuse', reason: 'Combines line decoration and structural context guards for mapped reuse.' },
  { path: 'src/features/editor/adapters/liveMarkdownLinePlugin.ts', line: '!/[\\n\\r]/.test(text) &&', owner: 'live markdown parse reuse', reason: 'Allows mapped decoration reuse only for single-line input.' },
  { path: 'src/features/editor/adapters/liveMarkdownLinePlugin.ts', line: '!MARKDOWN_INSERTION_CONTEXT_PATTERN.test(text) &&', owner: 'live markdown parse reuse', reason: 'Avoids mapped decoration reuse when inserted text can add Markdown syntax.' },
  { path: 'src/features/editor/adapters/liveMarkdownLinePlugin.ts', line: 'LINE_MARKDOWN_STRUCTURAL_CONTEXT_PATTERN.test(lineText);', owner: 'live markdown parse reuse', reason: 'Guards structural Markdown lines before mapped decoration reuse.' },
  { path: 'src/features/editor/adapters/liveMarkdownFormulaOverlay.ts', line: "return value.replace(/\\r\\n/g, '\\n').trim();", owner: 'formula overlay source normalization', reason: 'Normalizes formula line endings before overlay rendering.' },
  { path: 'src/features/editor/adapters/liveMarkdownMathSource.ts', line: "const TOKEN_PATTERNS: Array<[RegExp, string]> = [", owner: 'math source token highlight', reason: 'Defines local TeX token patterns for math source rendering.' },
  { path: 'src/features/editor/adapters/liveMarkdownMathSource.ts', line: "for (let match = pattern.exec(tex); match; match = pattern.exec(tex)) {", owner: 'math source token highlight', reason: 'Iterates approved TeX token patterns inside math source rendering.' },
  { path: 'src/features/editor/adapters/liveMarkdownMermaid.ts', line: "return BARE_MERMAID_START.test(lineText.trim());", owner: 'mermaid block detection', reason: 'Recognizes bare Mermaid starts before rendering a diagram block.' },
  { path: 'src/features/editor/adapters/liveMarkdownMermaid.ts', line: "return lineText.trim() !== '' && /^\\s/.test(lineText);", owner: 'mermaid block detection', reason: 'Keeps indented continuation lines in the Mermaid block.' },
  { path: 'src/features/editor/adapters/liveMarkdownMermaid.ts', line: "return source.trimStart().split(/\\s+/, 1)[0]?.toLowerCase() || 'diagram';", owner: 'mermaid diagram label', reason: 'Extracts a compact diagram type label from Mermaid source.' },
  { path: 'src/features/editor/adapters/liveMarkdownMermaidRenderer.ts', line: ".split(/\\s+/u)", owner: 'mermaid renderer class parsing', reason: 'Parses Mermaid renderer class tokens from generated markup.' },
  { path: 'src/features/editor/adapters/localizeRemoteMarkdownImages.ts', line: "before: hasTextBefore ? `${input.textBeforeImage.replace(/[ \\t]+$/u, '')}\\n\\n` : input.textBeforeImage,", owner: 'remote image localization spacing', reason: 'Trims trailing horizontal space before inserting localized image blocks.' },
  { path: 'src/features/editor/adapters/markdownImageWrappingLinks.ts', line: "const escapedAlt = altText.replace(/\\]/gu, '\\\\]');", owner: 'image wrapping link command', reason: 'Escapes image alt text while wrapping images in links.' },
  { path: 'src/features/editor/adapters/markdownImageWrappingLinks.ts', line: "while (cursor > 0 && /\\s/u.test(markdown[cursor - 1] ?? '')) cursor -= 1;", owner: 'image wrapping link command', reason: 'Finds the local image boundary while preserving surrounding Markdown.' },
  { path: 'src/features/editor/components/MarkdownMermaidPreviewDialog.tsx', line: "return source.trimStart().split(/\\s+/, 1)[0]?.toLowerCase() || 'diagram';", owner: 'mermaid preview dialog label', reason: 'Extracts a compact diagram type label for the preview dialog.' },
  { path: 'src/features/editor/model/formulaDomSelection.ts', line: "return value.trim().replace(/\\s+/g, ' ');", owner: 'formula DOM selection normalization', reason: 'Normalizes selected formula text copied from rendered DOM.' },
  { path: 'src/features/editor/model/inlineTextDecorationPlans.ts', line: "const match = /^(\\s*(?:>\\s*)?)(\\\\?)\\*注[：:]/u.exec(text);", owner: 'inline annotation decoration', reason: 'Recognizes the local annotation prefix marker for inline decoration.' },
  { path: 'src/features/editor/model/markdownCodeFenceProjection.ts', line: "const language = info.trim().split(/\\s+/, 1)[0]?.toLowerCase();", owner: 'code fence projection language label', reason: 'Extracts code fence language from the info string.' },
  { path: 'src/features/editor/model/markdownImageWrappingLink.ts', line: "while (cursor > 0 && /\\s/u.test(markdown[cursor - 1] ?? '')) cursor -= 1;", owner: 'image wrapping link model', reason: 'Finds the local image boundary while preserving surrounding Markdown.' },
  { path: 'src/features/editor/model/markdownInlineLinkProjection.ts', line: "const listItem = /^(?:[ \\t]+)(?:[-+*]|\\d{1,9}[.)])[ \\t]+/.exec(args.text);", owner: 'inline link list projection guard', reason: 'Keeps projected inline links from crossing list item marker boundaries.' },
  { path: 'src/features/editor/model/markdownLenientSpacedStrongProjection.ts', line: "return value !== undefined && /\\p{P}/u.test(value);", owner: 'lenient spaced strong projection', reason: 'Guards punctuation adjacency in the compatibility projection.' },
  { path: 'src/features/editor/model/markdownLenientSpacedStrongProjection.ts', line: "return value !== undefined && /\\s/u.test(value);", owner: 'lenient spaced strong projection', reason: 'Guards whitespace adjacency in the compatibility projection.' },
  { path: 'src/features/editor/model/markdownLenientTripleStarProjection.ts', line: "if (!/\\s/u.test(text[from - 1] ?? '')) return false;", owner: 'lenient triple-star projection', reason: 'Checks local whitespace before triple-star compatibility markers.' },
  { path: 'src/features/editor/model/markdownLenientTripleStarProjection.ts', line: "return after !== undefined && !/\\s/u.test(after);", owner: 'lenient triple-star projection', reason: 'Checks local trailing whitespace for triple-star compatibility markers.' },
  { path: 'src/features/editor/model/markdownLenientTripleStarProjection.ts', line: "return text[from + 3] === undefined || /\\s/u.test(text[from + 3] ?? '');", owner: 'lenient triple-star projection', reason: 'Checks marker boundary whitespace in triple-star compatibility projection.' },
  { path: 'src/features/editor/model/markdownTableRepair.ts', line: "return /^ {0,3}(?:```|~~~)/.test(text);", owner: 'markdown table repair fence guard', reason: 'Prevents table repair from crossing fenced code blocks.' },
  { path: 'src/features/editor/model/markdownTableRepair.ts', line: "return /^:?-{3,}:?$/.test(cell);", owner: 'markdown table repair delimiter detection', reason: 'Recognizes table delimiter cells during repair.' },
  { path: 'src/features/editor/model/markdownTableRepair.ts', line: "return /^\\s*>/.test(text) || /^\\s*(?:[-*+]|\\d+\\.)\\s+.*\\|/.test(text);", owner: 'markdown table repair boundary guard', reason: 'Stops table repair at blockquote or list boundaries.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "const downloadUrl = DOWNLOAD_RE.exec(line.text)?.[1] ?? RAW_CONTENT_RE.exec(line.text)?.[1] ?? null;", owner: 'readwise original file placeholder', reason: 'Extracts legacy Readwise original-file links from imported placeholder text.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "const omittedMatch = OMITTED_RE.exec(line.text);", owner: 'readwise original file placeholder', reason: 'Recognizes legacy omitted-line counts in imported placeholder text.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "for (const text of source.split(/\\n/u)) {", owner: 'readwise original file placeholder', reason: 'Scans legacy placeholder source line by line.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "hasBookImportPending ||= LEGACY_BOOK_IMPORT_PENDING_RE.test(text);", owner: 'readwise original file placeholder', reason: 'Detects legacy pending import status lines.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "hasDownloadAction ||= LEGACY_DOWNLOAD_ACTION_RE.test(text);", owner: 'readwise original file placeholder', reason: 'Detects legacy download action lines.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "hasLoadAction ||= LEGACY_LOAD_ACTION_RE.test(text);", owner: 'readwise original file placeholder', reason: 'Detects legacy load action lines.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "hasOriginalFileMissing ||= LEGACY_ORIGINAL_FILE_MISSING_RE.test(text);", owner: 'readwise original file placeholder', reason: 'Detects legacy original-file missing status lines.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "if (!line || !LEGACY_STATUS_HEADING_RE.test(line.text.trim())) {", owner: 'readwise original file placeholder', reason: 'Finds the legacy status heading before placeholder projection.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "if (LEGACY_IN_PROGRESS_RE.test(text)) {", owner: 'readwise original file placeholder', reason: 'Detects legacy in-progress status lines.' },
  { path: 'src/features/editor/model/readwiseOriginalFilePlaceholder.ts', line: "if (text.startsWith('# ') || (text.startsWith('## ') && !LEGACY_NEXT_ACTIONS_HEADING_RE.test(text))) {", owner: 'readwise original file placeholder', reason: 'Stops legacy placeholder scanning at the next heading boundary.' }
];
