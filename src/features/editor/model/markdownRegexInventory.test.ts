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

const regexTruthBoundary = /const\s+\w*PATTERN\b|RegExp|\.match\(|\.exec\(/;

const allowedRegexInventory = [
  {
    path: 'src/features/editor/adapters/localizeRemoteMarkdownImages.ts',
    line: 'const MARKDOWN_IMAGE_PATTERN = /!\\[([^\\]]*)\\]\\(([^)\\n]+)\\)/g;',
    owner: 'remote image import cleanup'
  },
  {
    path: 'src/features/editor/adapters/localizeRemoteMarkdownImages.ts',
    line: 'const match = /^(\\S+)([\\s\\S]*)$/.exec(trimmedTarget);',
    owner: 'remote image import target split'
  },
  {
    path: 'src/features/editor/adapters/localizeRemoteMarkdownImages.ts',
    line: 'let match = MARKDOWN_IMAGE_PATTERN.exec(markdown);',
    owner: 'remote image import cleanup'
  },
  {
    path: 'src/features/editor/adapters/localizeRemoteMarkdownImages.ts',
    line: 'match = MARKDOWN_IMAGE_PATTERN.exec(markdown);',
    owner: 'remote image import cleanup'
  },
  {
    path: 'src/features/editor/adapters/markdownInputAssist.ts',
    line: 'const CODE_FENCE_PATTERN = /^\\s*`{3,}/;',
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
    path: 'src/features/editor/components/MarkdownTablePreviewDialog.tsx',
    line: 'const COLUMN_SPLIT_PATTERN = /[\\s,，、/|;；:：()[\\]{}]+/;',
    owner: 'column width measurement'
  },
  {
    path: 'src/features/editor/model/anchorClipboardExport.ts',
    line: 'const HIGHLIGHT_MARKER_PATTERN = /==([\\s\\S]+?)==/g;',
    owner: 'external clipboard HTML export'
  },
  {
    path: 'src/features/editor/model/anchorClipboardExport.ts',
    line: 'const ASSET_URL_PATTERN = /asset:\\/\\/[^\\s<>)\\]]+/g;',
    owner: 'external clipboard asset URL export'
  },
  {
    path: 'src/features/editor/model/editorMouseGestureSettings.ts',
    line: "const match = /^#([0-9a-fA-F]{6})$/.exec(value?.trim() ?? '');",
    owner: 'color setting validation'
  },
  {
    path: 'src/features/editor/model/markdownFrontmatterProjection.ts',
    line: 'const FRONTMATTER_DELIMITER_PATTERN = /^\\s*---\\s*$/;',
    owner: 'centralized frontmatter projection'
  },
  {
    path: 'src/features/editor/model/markdownFrontmatterProjection.ts',
    line: 'const FRONTMATTER_KEY_VALUE_PATTERN = /^([^:#\\s][^:]*?)(\\s*:\\s*)(.*)$/;',
    owner: 'centralized frontmatter projection'
  },
  {
    path: 'src/features/editor/model/markdownFrontmatterProjection.ts',
    line: 'const FRONTMATTER_LIST_ITEM_PATTERN = /^(\\s*)-\\s+(.*)$/;',
    owner: 'centralized frontmatter projection'
  },
  {
    path: 'src/features/editor/model/markdownFrontmatterProjection.ts',
    line: 'const WIKILINK_WRAPPER_PATTERN = /\\[\\[([^\\]]+)\\]\\]/g;',
    owner: 'centralized frontmatter projection'
  },
  {
    path: 'src/features/editor/model/markdownFrontmatterProjection.ts',
    line: 'const keyMatch = line.match(FRONTMATTER_KEY_VALUE_PATTERN);',
    owner: 'centralized frontmatter projection'
  },
  {
    path: 'src/features/editor/model/markdownFrontmatterProjection.ts',
    line: 'const listMatch = line.match(FRONTMATTER_LIST_ITEM_PATTERN);',
    owner: 'centralized frontmatter projection'
  },
  {
    path: 'src/features/editor/model/markdownInlineProjection.ts',
    line: 'const PUNCTUATION_PATTERN = /^[.,;:!?]+$/;',
    owner: 'autolink punctuation trimming'
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
