import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { anchorStructureGuard, shouldBlockAnchorTagMutation } from './anchorStructureGuard';

describe('anchorStructureGuard', () => {
  const content = 'AA<highlight id="1">BC</highlight id="1">DD';

  it('allows edits outside anchor tags', () => {
    expect(shouldBlockAnchorTagMutation(content, [{ from: 0, to: 1 }])).toBe(false);
  });

  it('allows edits inside anchor content range', () => {
    const contentStart = content.indexOf('BC');
    expect(shouldBlockAnchorTagMutation(content, [{ from: contentStart, to: contentStart + 1 }])).toBe(false);
  });

  it('blocks deletion that intersects open or close tags', () => {
    const openTagStart = content.indexOf('<highlight');
    const closeTagStart = content.indexOf('</highlight id="1">');
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagStart, to: openTagStart + 1 }])).toBe(true);
    expect(shouldBlockAnchorTagMutation(content, [{ from: closeTagStart, to: closeTagStart + 2 }])).toBe(true);
  });

  it('blocks insertion inside tag body but allows insertion at tag boundaries', () => {
    const openTagStart = content.indexOf('<highlight');
    const openTagEnd = content.indexOf('>') + 1;
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagStart + 1, to: openTagStart + 1 }])).toBe(true);
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagStart, to: openTagStart }])).toBe(false);
    expect(shouldBlockAnchorTagMutation(content, [{ from: openTagEnd, to: openTagEnd }])).toBe(false);
  });

  it('protects malformed anchor tags from being partially edited', () => {
    const malformed = '<highlight id="2">oops';
    const insideTag = malformed.indexOf('id=');
    expect(shouldBlockAnchorTagMutation(malformed, [{ from: insideTag, to: insideTag + 2 }])).toBe(true);
  });

  it('rewrites boundary deletion so the anchor survives with remaining text', () => {
    const state = EditorState.create({ doc: content, extensions: [anchorStructureGuard] });
    const transaction = state.update({
      changes: { from: 1, to: content.indexOf('BC') + 1, insert: '' },
      selection: { anchor: 1 }
    });

    expect(transaction.newDoc.toString()).toBe('A<highlight id="1">C</highlight id="1">DD');
    expect(transaction.newSelection.main.anchor).toBe(1);
  });

  it('rewrites full-span replacement so the anchor wraps the replacement text', () => {
    const state = EditorState.create({ doc: content, extensions: [anchorStructureGuard] });
    const to = content.indexOf('</highlight id="1">') + '</highlight id="1">'.length + 1;
    const transaction = state.update({
      changes: { from: 1, to, insert: 'Q' },
      selection: { anchor: 2 }
    });

    expect(transaction.newDoc.toString()).toBe('A<highlight id="1">Q</highlight id="1">D');
    expect(transaction.newSelection.main.anchor).toBe(20);
  });
});
