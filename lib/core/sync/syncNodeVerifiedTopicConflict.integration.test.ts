// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { BASE_AT, FORMED_AT, branches, nodeMetadata, observeReads, referencedNode, seededDevice }
  from '../../../electron/database/syncNodeVerifiedTopicConflict.testSupport.js';
import { textBranch } from '../../../electron/database/topicTextState.testSupport.js';
import { BODY_CONTENT_CHUNK_BYTES } from '../database/bodyContentSchema.js';

import { resolveTopicConflict } from './syncNodeConvergence.js';
import { loadCurrentVerifiedSyncNode, loadVerifiedSyncNodeVersion } from './syncNodeVerifiedGraph.js';
import { resolveVerifiedTopicConflict } from './syncNodeVerifiedTopicConflict.js';
import { alternativeForBody } from './topicTextState.js';
import { readBodyText } from './verifiedBody.js';

afterEach(() => vi.useRealTimers());

it.each([
  { name: 'empty current', local: '', incoming: 'Changed' },
  { name: 'UTF-16 length rather than encoded byte length', local: '中文', incoming: 'abc' },
  { name: 'identical text with different selection identity', local: 'Same', incoming: 'Same' },
  { name: 'child evidence ahead of body length', local: 'A', incoming: 'Long replacement', anchor: 'local' },
  { name: 'incoming child evidence', local: 'Long current', incoming: 'B', anchor: 'incoming' },
  { name: 'large UTF-8 text with preserved BOM and CRLF', local: '\ufeff---\r\n' + 'x'.repeat(3 * 1024 * 1024 - 13) + '\r\n---', incoming: '中😀\r\n' }
])('preserves whole-version conflict results for $name without loading complete bodies', async ({ local, incoming, anchor }) => {
  vi.useFakeTimers(); vi.setSystemTime(FORMED_AT);
  const records = branches(local, incoming);
  const old = await seededDevice(records.base, records.local, [records.incoming], false, anchor);
  const stable = await seededDevice(records.base, records.local, [records.incoming], true, anchor);
  try {
    const expected = await resolveTopicConflict(old.db, [records.incoming]);
    const reads = observeReads(stable.db);
    const current = await loadCurrentVerifiedSyncNode(reads.port, 'topic');
    const remote = await loadVerifiedSyncNodeVersion(reads.port, records.incoming.version_id!);
    if (!current || !remote || remote.body.kind !== 'readable') throw new Error('readable_fixture_required');
    const actual = await resolveVerifiedTopicConflict(reads.port, current, [{ ...remote, body: remote.body }], FORMED_AT);
    expect(actual.metadata).toEqual(nodeMetadata(expected));
    expect(actual.body.kind).toBe('readable');
    if (actual.body.kind !== 'readable') throw new Error('readable_result_required');
    expect(await readBodyText(stable.db, actual.body.ref)).toBe(expected.body_text);
    expect(actual.alternativeBodies.map((ref) => ref.hash).sort())
      .toEqual(expected.alternative_bodies!.map((body) => body.hash).sort());
    expect(Math.max(0, ...reads.sizes)).toBeLessThanOrEqual(BODY_CONTENT_CHUNK_BYTES);
    expect(stable.sqlite.prepare('SELECT count(*) AS count FROM content_blob_data').get()).toEqual({ count: 0 });
    expect(actual.metadata).not.toHaveProperty('body_text');
    expect(actual.metadata.snapshot).not.toHaveProperty('content');
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('preserves branch order and bounded alternative membership', async () => {
  vi.useFakeTimers(); vi.setSystemTime(FORMED_AT);
  const { base, local } = branches('Main longest version', 'unused');
  const incoming = ['b', 'c', 'd', 'e'].map((id, index) => textBranch(id, id, base,
    `2026-10-07T0${index + 2}:00:00.000Z`));
  const old = await seededDevice(base, local, incoming, false);
  const stable = await seededDevice(base, local, incoming, true);
  try {
    const expected = await resolveTopicConflict(old.db, incoming);
    const current = await referencedNode(stable.db, stable.current);
    const remotes = [];
    for (const record of incoming) remotes.push(await referencedNode(stable.db, record));
    const actual = await resolveVerifiedTopicConflict(stable.db, current, remotes.reverse(), FORMED_AT);
    expect(actual.metadata).toEqual(nodeMetadata(expected));
    expect(actual.alternativeBodies).toHaveLength(3);
    expect(actual.metadata.snapshot.text_alternatives).toEqual(expected.snapshot.text_alternatives);
    expect(actual.metadata.parent_version_ids).toEqual(expected.parent_version_ids);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it.each(['unchanged selection', 'metadata deletion'])('preserves the existing $0 decision', async (scenario) => {
  vi.useFakeTimers(); vi.setSystemTime(FORMED_AT);
  const { base, local, incoming } = branches('Changed', 'Original');
  incoming.snapshot.text_selection = { version_id: base.version_id!, created_at: BASE_AT };
  if (scenario === 'metadata deletion') incoming.snapshot.deleted_at = incoming.updated_at;
  const old = await seededDevice(base, local, [incoming], false);
  const stable = await seededDevice(base, local, [incoming], true);
  try {
    const expected = await resolveTopicConflict(old.db, [incoming]);
    const actual = await resolveVerifiedTopicConflict(stable.db, await referencedNode(stable.db, stable.current),
      [await referencedNode(stable.db, incoming)], FORMED_AT);
    expect(actual.metadata).toEqual(nodeMetadata(expected));
    expect(actual.alternativeBodies).toEqual([]);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('rejects unavailable retained content without changing the current version', async () => {
  vi.useFakeTimers(); vi.setSystemTime(FORMED_AT);
  const { base, local, incoming } = branches('Main much longer version', 'Peer');
  const old = await seededDevice(base, local, [incoming], false);
  const stable = await seededDevice(base, local, [incoming], true);
  try {
    const current = await referencedNode(stable.db, stable.current);
    const remote = await referencedNode(stable.db, incoming);
    if (remote.body.kind !== 'readable') throw new Error('readable_fixture_required');
    await stable.db.run('DELETE FROM content_bodies WHERE hash = ?', [remote.body.ref.hash]);
    await expect(resolveVerifiedTopicConflict(stable.db, current, [remote], FORMED_AT))
      .rejects.toThrow('text_alternative_body_unavailable');
    expect(stable.sqlite.prepare("SELECT current_version_id FROM nodes WHERE id = 'topic'").pluck().get())
      .toBe(stable.current.version_id);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});

it('does not resurrect a dismissed alternative while merging concurrent whole versions', async () => {
  vi.useFakeTimers(); vi.setSystemTime(FORMED_AT);
  const { base } = branches('unused', 'unused');
  const alternative = textBranch('other', 'Dismissed', undefined, BASE_AT);
  const entry = alternativeForBody(alternative, BASE_AT);
  base.snapshot.text_alternatives = [entry];
  base.alternative_bodies = [{ hash: entry.body_blob_hash, text: alternative.body_text! }];
  const local = textBranch('local', 'Main long version', base, '2026-10-07T01:00:00.000Z');
  const incoming = textBranch('incoming', 'Peer', base, '2026-10-07T02:00:00.000Z');
  local.snapshot.text_alternatives = [];
  const old = await seededDevice(base, local, [incoming], false);
  const stable = await seededDevice(base, local, [incoming], true);
  try {
    const expected = await resolveTopicConflict(old.db, [incoming]);
    const actual = await resolveVerifiedTopicConflict(stable.db, await referencedNode(stable.db, stable.current),
      [await referencedNode(stable.db, incoming)], FORMED_AT);
    expect(actual.metadata).toEqual(nodeMetadata(expected));
    expect(actual.alternativeBodies.some((body) => body.hash === entry.body_blob_hash)).toBe(false);
    expect(actual.metadata.snapshot.text_alternatives?.some((value) => value.id === entry.id)).toBe(false);
  } finally { old.sqlite.close(); stable.sqlite.close(); }
});
