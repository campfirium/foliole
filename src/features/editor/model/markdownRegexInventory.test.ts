import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface RegexFinding {
  line: string;
  path: string;
}

const scannedRoots = [
  'src/features/editor/model',
  'src/features/editor/adapters',
  'src/features/editor/components'
];

const regexTruthBoundary =
  /const\s+\w*PATTERN\b|RegExp|\.match\(|\.exec\(|\.test\(|\.replace(?:All)?\s*\(\s*\/|\.split\s*\(\s*\//;

const allowedRegexInventory = [
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
  }
];

function listSourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = path.join(root, entry);
    if (statSync(fullPath).isDirectory()) return listSourceFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(fullPath) || /\.test\.(ts|tsx)$/.test(fullPath)) return [];
    return [fullPath];
  });
}

function collectRegexFindings(): RegexFinding[] {
  return scannedRoots.flatMap(listSourceFiles).flatMap((filePath) => {
    const relativePath = path.relative(process.cwd(), filePath).replaceAll(path.sep, '/');
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => regexTruthBoundary.test(line))
      .map((line) => ({ line, path: relativePath }));
  });
}

describe('markdown regex inventory', () => {
  it('keeps remaining editor regex outside markdown renderer truth', () => {
    const findings = collectRegexFindings().map((finding) => `${finding.path} :: ${finding.line}`);
    const allowed = allowedRegexInventory.map((item) => `${item.path} :: ${item.line}`);

    expect(findings.sort()).toEqual(allowed.sort());
    expect(allowedRegexInventory.map((item) => item.owner).every(Boolean)).toBe(true);
  });
});
