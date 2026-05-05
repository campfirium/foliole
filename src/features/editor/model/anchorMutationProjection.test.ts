import { describe, expect, it } from 'vitest';

import { projectAnchorMutation } from './anchorMutationProjection';
import { mapRawPositionToVisibleOffset } from './anchorTextOffsets';

const content = 'AA<highlight id="1">BC</highlight id="1">DD';
const opaqueIdContent = 'AA<highlight id="anchor-1">BC</highlight id="anchor-1">DD';

function project(from: number, to: number, insert = '') {
  const nextContent = `${content.slice(0, from)}${insert}${content.slice(to)}`;
  return projectAnchorMutation({
    changes: [{ from, insert, to }],
    content,
    nextContent,
    selection: {
      anchor: from + insert.length,
      head: from + insert.length
    }
  });
}

function toVisibleOffset(rawContent: string, rawPosition: number) {
  return mapRawPositionToVisibleOffset(rawContent, rawPosition);
}

function projectOpaqueId(from: number, to: number, insert = '') {
  const nextContent = `${opaqueIdContent.slice(0, from)}${insert}${opaqueIdContent.slice(to)}`;
  return projectAnchorMutation({
    changes: [{ from, insert, to }],
    content: opaqueIdContent,
    nextContent,
    selection: {
      anchor: from + insert.length,
      head: from + insert.length
    }
  });
}

describe('anchorMutationProjection', () => {
  it('keeps the anchor when deleting across the left boundary into anchor text', () => {
    const result = project(1, content.indexOf('BC') + 1);

    expect(result?.content).toBe('A<highlight id="1">C</highlight id="1">DD');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(1);
  });

  it('collapses to an empty anchor when deletion removes the whole anchored text', () => {
    const result = project(1, content.indexOf('</highlight id="1">') + '</highlight id="1">'.length + 1);

    expect(result?.content).toBe('A<highlight id="1"></highlight id="1">D');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(1);
  });

  it('keeps replacement text inside the anchor when the replacement crosses the boundary', () => {
    const result = project(1, content.indexOf('BC') + 1, 'Z');

    expect(result?.content).toBe('A<highlight id="1">ZC</highlight id="1">DD');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(2);
  });

  it('allows replacing the full anchored span and keeps the relation on the new text', () => {
    const result = project(1, content.indexOf('</highlight id="1">') + '</highlight id="1">'.length + 1, 'Q');

    expect(result?.content).toBe('A<highlight id="1">Q</highlight id="1">D');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(2);
  });

  it('preserves opaque highlight ids during boundary recovery', () => {
    const result = projectOpaqueId(1, opaqueIdContent.indexOf('BC') + 1, 'Z');

    expect(result?.content).toBe('A<highlight id="anchor-1">ZC</highlight id="anchor-1">DD');
    expect(result && toVisibleOffset(result.content, result.selection.head)).toBe(2);
  });

  it('returns null when the change does not touch anchor tags', () => {
    expect(project(content.indexOf('BC'), content.indexOf('BC') + 1)).toBeNull();
  });

  it('returns null for insertion inside a tag token', () => {
    const position = content.indexOf('id="1"');
    const nextContent = `${content.slice(0, position)}X${content.slice(position)}`;

    expect(
      projectAnchorMutation({
        changes: [{ from: position, insert: 'X', to: position }],
        content,
        nextContent,
        selection: {
          anchor: position + 1,
          head: position + 1
        }
      })
    ).toBeNull();
  });
});
