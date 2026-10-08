// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice } from '../../../electron/database/topicTextState.testSupport.js';
import { NODE_TEXT_MAX_BYTES } from '../nodes/nodeTextBudget.js';

import { upsertRemoteVersion } from './syncNodeApplyAcceptedRemote.js';
import { applySyncNodesWithDbPort } from './syncNodeApplyExecutor.js';

const now = '2026-10-09T00:00:00.000Z';
const hosts: ReturnType<typeof textDevice>[] = [];
afterEach(() => hosts.splice(0).forEach(host => host.sqlite.close()));

function persisted(host: ReturnType<typeof textDevice>) {
  return ['nodes', 'node_sync_versions', 'node_sync_version_parents'].map(table =>
    host.sqlite.prepare(`SELECT * FROM ${table} ORDER BY 1`).all());
}

it.each(['title', 'reveal', 'anchorText', 'groupedAnchorText'] as const)(
  'rejects oversized UTF-8 %s before changing current rows or version history', async field => {
    const host = textDevice(); hosts.push(host);
    const base = textBranch('base', 'Original', undefined, now);
    await applySyncNodesWithDbPort(host.db, [base]);
    const initial = persisted(host);
    const incoming = textBranch('oversized', 'Changed', base, now);
    const oversized = '中'.repeat(Math.floor(NODE_TEXT_MAX_BYTES / 3) + 1);
    if (field === 'title' || field === 'reveal') incoming.snapshot[field] = oversized;
    else incoming.snapshot.anchor_link = JSON.stringify({ id: 'original-anchor', kind: 'highlight', locator:
      field === 'anchorText' ? { from: 0, to: oversized.length, originalText: oversized }
        : { ranges: [0, 1].map(index => ({ from: index, to: index + NODE_TEXT_MAX_BYTES / 2 + 1,
          originalText: 'x'.repeat(NODE_TEXT_MAX_BYTES / 2 + 1) })) } });
    const valid = { ...textBranch('valid', 'First', undefined, now), object_id: 'first',
      snapshot: { ...base.snapshot, id: 'first', content: 'First' } };
    await expect(applySyncNodesWithDbPort(host.db, [valid, incoming]))
      .rejects.toThrow(`node_text_too_large:${field === 'groupedAnchorText' ? 'anchorText' : field}`);
    expect(persisted(host)).toEqual(initial);
    await expect(upsertRemoteVersion(host.db, incoming)).rejects.toThrow('node_text_too_large');
    expect(persisted(host)).toEqual(initial);
  }
);

it.each(['title', 'reveal', 'anchorText', 'groupedAnchorText'] as const)(
  'accepts exact 1 MiB UTF-8 %s without truncating facts', async field => {
    const host = textDevice(); hosts.push(host);
    const incoming = textBranch('exact', 'Body', undefined, now);
    const exact = '中'.repeat(Math.floor(NODE_TEXT_MAX_BYTES / 3)) + 'x';
    if (field === 'title' || field === 'reveal') incoming.snapshot[field] = exact;
    else incoming.snapshot.anchor_link = JSON.stringify({ id: 'original-anchor', kind: 'highlight', locator:
      field === 'anchorText' ? { from: 0, to: exact.length, originalText: exact }
        : { ranges: [0, 1].map(index => ({ from: index, to: index + NODE_TEXT_MAX_BYTES / 2,
          originalText: 'x'.repeat(NODE_TEXT_MAX_BYTES / 2) })) } });
    await expect(applySyncNodesWithDbPort(host.db, [incoming])).resolves.toMatchObject({ appliedIds: ['topic'] });
    const stored = host.sqlite.prepare('SELECT title, reveal, anchor_link FROM nodes WHERE id = ?').get('topic');
    expect(stored).toEqual({ title: incoming.snapshot.title, reveal: incoming.snapshot.reveal,
      anchor_link: incoming.snapshot.anchor_link });
    expect(host.sqlite.prepare('SELECT version_id FROM node_sync_versions').pluck().all()).toEqual(['exact']);
  }
);

it('retains long historical body and identity-only facts without imposing a new body limit', async () => {
  const host = textDevice(); hosts.push(host);
  const historical = textBranch('historical', 'x'.repeat(NODE_TEXT_MAX_BYTES + 1), undefined, now);
  await upsertRemoteVersion(host.db, historical);
  const identity = { ...textBranch('identity', '', undefined, now), body_text: null,
    snapshot: { ...historical.snapshot, content: null } };
  await applySyncNodesWithDbPort(host.db, [identity]);
  expect(host.sqlite.prepare('SELECT version_id, length(body_text) AS bytes FROM node_sync_versions ORDER BY version_id').all())
    .toEqual([{ version_id: 'historical', bytes: NODE_TEXT_MAX_BYTES + 1 }, { version_id: 'identity', bytes: null }]);
  expect(host.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
});
