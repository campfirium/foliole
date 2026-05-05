import { EditorSelection } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { recoverAnchorMutation } from './anchorMutationRecovery';

const content = 'AA<highlight id="1">BC</highlight id="1">DD';
const ANCHOR_TAG_PATTERN = /<\/?(?:highlight|cloze)\s+id="[^"]+"\s*>/g;

function recover(from: number, to: number, insert = '') {
  const nextContent = `${content.slice(0, from)}${insert}${content.slice(to)}`;
  const selection = EditorSelection.single(from + insert.length);
  return recoverAnchorMutation({
    changes: [{ from, insert, to }],
    content,
    nextContent,
    selection
  });
}

function toVisibleOffset(rawContent: string, rawPosition: number) {
  return rawContent.slice(0, rawPosition).replace(ANCHOR_TAG_PATTERN, '').length;
}

describe('anchorMutationRecovery', () => {
  it('keeps the anchor when deleting across the left boundary into anchor text', () => {
    const result = recover(1, content.indexOf('BC') + 1);

    expect(result?.content).toBe('A<highlight id="1">C</highlight id="1">DD');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(1);
  });

  it('collapses to an empty anchor when deletion removes the whole anchored text', () => {
    const result = recover(1, content.indexOf('</highlight id="1">') + '</highlight id="1">'.length + 1);

    expect(result?.content).toBe('A<highlight id="1"></highlight id="1">D');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(1);
  });

  it('keeps replacement text inside the anchor when the replacement crosses the boundary', () => {
    const result = recover(1, content.indexOf('BC') + 1, 'Z');

    expect(result?.content).toBe('A<highlight id="1">ZC</highlight id="1">DD');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(2);
  });

  it('allows replacing the full anchored span and keeps the relation on the new text', () => {
    const result = recover(1, content.indexOf('</highlight id="1">') + '</highlight id="1">'.length + 1, 'Q');

    expect(result?.content).toBe('A<highlight id="1">Q</highlight id="1">D');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(2);
  });

  it('returns null when the change does not touch anchor tags', () => {
    expect(recover(content.indexOf('BC'), content.indexOf('BC') + 1)).toBeNull();
  });

  it('returns null for insertion inside a tag token', () => {
    const position = content.indexOf('id="1"');
    const nextContent = `${content.slice(0, position)}X${content.slice(position)}`;
    const selection = EditorSelection.single(position + 1);

    expect(
      recoverAnchorMutation({
        changes: [{ from: position, insert: 'X', to: position }],
        content,
        nextContent,
        selection
      })
    ).toBeNull();
  });
});
