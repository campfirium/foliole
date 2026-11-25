// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  checkAddedLines,
  checkCommitMessage,
  extractCopyValues,
  findTermIssues,
  loadTerms,
  parseAddedLines
} from './check-terms.mjs';

const terms = loadTerms();

describe('terms.json', () => {
  it('points every avoid rule at defined product terms', () => {
    const ids = new Set(terms.terms.map((term) => term.id));
    for (const rule of terms.avoid) {
      expect(['decided', 'open']).toContain(rule.status);
      for (const preferred of rule.prefer) expect(ids).toContain(preferred);
    }
  });
});

describe('check-terms', () => {
  it('reads only copy values from catalog lines, not translation keys', () => {
    expect(extractCopyValues("  'desktop.nodeReview.aria': 'Review settings',")).toEqual(['Review settings']);
    expect(extractCopyValues("import { X } from './enNodes';")).toEqual([]);
  });

  it('blocks decided avoid-words and only warns on open ones, in both controlled languages', () => {
    expect(findTermIssues('Move it and its children to Trash', 'en', terms)).toEqual([
      expect.objectContaining({ rule: 'tree-children', severity: 'error' })
    ]);
    expect(findTermIssues('移动子节点', 'zhHans', terms)).toEqual([
      expect.objectContaining({ rule: 'tree-children', severity: 'error' })
    ]);
    expect(findTermIssues('Review card', 'en', terms)).toEqual([
      expect.objectContaining({ rule: 'card', severity: 'error' })
    ]);
    const withOpenRule = {
      ...terms,
      avoid: [{ id: 'pending', en: ['widget'], zhHans: [], prefer: [], status: 'open', reason: 'undecided' }]
    };
    expect(findTermIssues('Open widget', 'en', withOpenRule)).toEqual([
      expect.objectContaining({ rule: 'pending', severity: 'warn' })
    ]);
    expect(findTermIssues('No topics in this folder', 'en', terms)).toEqual([]);
    expect(findTermIssues('Open release notes', 'en', terms)).toEqual([]);
  });

  it('checks only added lines of English and Simplified Chinese catalogs in a staged diff', () => {
    const diff = [
      'diff --git a/src/shared/localization/locales/enCompanion.ts b/src/shared/localization/locales/enCompanion.ts',
      '+++ b/src/shared/localization/locales/enCompanion.ts',
      '@@ -10,1 +10,2 @@',
      "-  'a.old': 'Delete children',",
      "+  'a.new': 'Delete children',",
      "+  'a.fine': 'Delete topics',",
      '+++ b/src/shared/localization/locales/de/companion.json',
      '@@ -1 +1 @@',
      '+  "a.new": "children"'
    ].join('\n');
    const issues = checkAddedLines(parseAddedLines(diff), terms);
    expect(issues).toEqual([
      expect.objectContaining({ file: 'src/shared/localization/locales/enCompanion.ts', line: 10, severity: 'error' })
    ]);
  });

  it('keeps commit-message findings advisory and ignores code in backticks', () => {
    const issues = checkCommitMessage('000001 fix cards that skip the queue\n\ncontext: `childNodes` was stale.', terms);
    expect(issues).toEqual([expect.objectContaining({ rule: 'card', severity: 'warn' })]);
  });
});
