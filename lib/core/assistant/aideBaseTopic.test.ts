import { describe, expect, it } from 'vitest';

import type { AideContextNode } from './aideAttachedContextSource.js';
import { describeAideBaseTopic } from './aideBaseTopic.js';

const BASE_TEXT = 'Intro. More context is not always better. Outro.';

function node(id: string, kind: string, quoted?: string, content = ''): AideContextNode {
  const from = quoted ? BASE_TEXT.indexOf(quoted) : 0;
  return {
    anchor: quoted ? { id: `a-${id}`, kind: 'highlight', locator: { from, originalText: quoted, to: from + quoted.length } } : null,
    content,
    id,
    kind,
    title: id
  } as AideContextNode;
}

const folder = node('Folder', 'folder');
const base = node('Base', 'topic', undefined, BASE_TEXT);

describe('describeAideBaseTopic', () => {
  it('finds the Base Topic of a derived Topic with its folder path and position', () => {
    const derived = node('Derived', 'topic', 'More context is not always better.');
    const result = describeAideBaseTopic(derived, [base, folder]);
    expect(result).toEqual({ ok: true, payload: expect.objectContaining({
      base_topic: expect.objectContaining({ focus_position: { from: 7, to: 41 }, folder_path: ['Folder'], id: 'Base', title: 'Base' }),
      material_id: 'Derived',
      material_kind: 'topic'
    }) });
    expect(result.ok && result.payload.derivation_path).toEqual([
      expect.objectContaining({ id: 'Derived', parent_id: 'Base', quoted_text: 'More context is not always better.' })
    ]);
  });

  it('follows an Item through its derived Topic to the Base Topic', () => {
    const derived = node('Derived', 'topic', 'More context is not always better.');
    const item = { ...node('Item', 'item'), anchor: { id: 'a-item', kind: 'highlight', locator: { from: 0, originalText: 'More', to: 4 } } } as AideContextNode;
    const result = describeAideBaseTopic(item, [derived, base, folder]);
    expect(result.ok && (result.payload.base_topic as { id: string }).id).toBe('Base');
    expect(result.ok && (result.payload.derivation_path as { id: string }[]).map((level) => level.id)).toEqual(['Item', 'Derived']);
  });

  it('treats a Base Topic as its own Base Topic and a Folder as not derived material', () => {
    const result = describeAideBaseTopic(base, [folder]);
    expect(result.ok && result.payload).toMatchObject({ base_topic: { id: 'Base' }, derivation_path: [] });
    expect(describeAideBaseTopic(folder, [])).toEqual({ ok: false, payload: { error: 'not_derived', kind: 'folder' } });
  });

  it('reports an Item without an excerpt anchor as having no Base Topic', () => {
    expect(describeAideBaseTopic(node('Item', 'item'), [base, folder])).toEqual({ ok: false, payload: { error: 'no_base_topic' } });
  });
});
