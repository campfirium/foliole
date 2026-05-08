import { describe, expect, it } from 'vitest';

import {
  decideClipboardPasteSource,
  hasGfmTableBlock,
  isSourcePresentationHtml
} from './clipboardPasteSource.js';

const GFM_TABLE = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');
const VSCODE_HTML = [
  '<div style="font-family: Cascadia Code; white-space: pre;">',
  '<span>| A | B |</span>',
  '<span>| --- | --- |</span>',
  '<span>| 1 | 2 |</span>',
  '</div>'
].join('');

describe('clipboardPasteSource', () => {
  it('detects a GFM table block by adjacent header and delimiter rows', () => {
    expect(hasGfmTableBlock(GFM_TABLE)).toBe(true);
    expect(hasGfmTableBlock(['| A | B |', '', '| --- | --- |'].join('\n'))).toBe(false);
  });

  it('treats VS Code style markdown copies as plain markdown', () => {
    expect(decideClipboardPasteSource({ html: VSCODE_HTML, plainText: GFM_TABLE })).toMatchObject({
      content: GFM_TABLE,
      kind: 'plain-markdown'
    });
  });

  it('keeps browser rich HTML over markdown-like plain fallback when HTML has document structure', () => {
    expect(decideClipboardPasteSource({ html: '<ul><li>item</li></ul>', plainText: '- item' })).toMatchObject({
      content: '<ul><li>item</li></ul>',
      kind: 'rich-html'
    });
  });

  it('does not let a single inline markdown marker override rich HTML', () => {
    expect(decideClipboardPasteSource({ html: '<p><strong>bold</strong></p>', plainText: '**bold**' })).toMatchObject({
      content: '<p><strong>bold</strong></p>',
      kind: 'rich-html'
    });
  });

  it('handles single-format and internal clipboard payloads', () => {
    expect(decideClipboardPasteSource({ internalText: 'internal', plainText: 'plain' })).toMatchObject({
      content: 'internal',
      kind: 'internal'
    });
    expect(decideClipboardPasteSource({ html: '<p>Only</p>' })).toMatchObject({ kind: 'rich-html' });
    expect(decideClipboardPasteSource({ plainText: 'Only text' })).toMatchObject({ kind: 'plain-text' });
  });

  it('does not classify rich document HTML as source presentation HTML', () => {
    expect(isSourcePresentationHtml('<table><tr><td>A</td></tr></table>')).toBe(false);
    expect(isSourcePresentationHtml(VSCODE_HTML)).toBe(true);
  });
});
