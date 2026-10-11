// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { textBranch, textDevice } from '../database/topicTextState.testSupport.js';

const hosts: ReturnType<typeof textDevice>[] = [];
afterEach(() => { for (const host of hosts.splice(0)) host.sqlite.close(); });

it('does not replace a descendant deletion when an older frozen input is retried', async () => {
  const host = textDevice();
  hosts.push(host);
  const base = textBranch('base', 'Body', undefined, '2026-10-01T00:00:00.000Z');
  const first = textBranch('deleted-first', '', base, '2026-10-02T00:00:00.000Z');
  first.is_tombstone = true;
  first.snapshot.deleted_at = first.updated_at;
  const later = textBranch('deleted-later', '', first, '2026-10-03T00:00:00.000Z');
  later.is_tombstone = true;
  later.snapshot.deleted_at = later.updated_at;
  await host.receive([base, first, later]);
  expect(host.sqlite.prepare('SELECT version_id FROM node_sync_tombstones').pluck().get()).toBe('deleted-later');
  const before = host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all();
  await host.receive([first]);
  expect(host.sqlite.prepare('SELECT * FROM node_sync_tombstones').all()).toEqual(before);
  expect(host.sqlite.prepare('SELECT count(*) FROM nodes').pluck().get()).toBe(0);
});
