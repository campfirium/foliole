// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';

import { createBetterSqliteDbPort } from '../../../../../electron/database/betterSqliteDbPort.js';
import { observeAlternativeLookup } from '../../../../../electron/database/nodeTextAlternativeScope.testSupport.js';
import { textBranch, textDevice } from '../../../../../electron/database/topicTextState.testSupport.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import { loadCurrentSyncNodeRecord } from '../../../../../lib/core/sync/syncNodeGraph.js';
import { invalidateCompanionReadingScope } from '../reading/companionReadingScope.js';

import { updateCompanionNodeTextAlternativeStatus } from './companionNodeTextAlternativeRepository.js';

const runtime = vi.hoisted(() => ({ db: null as DbPort | null }));
vi.mock('./iosCompanionActiveDatabase', () => ({ writeIosCompanionDatabase: (write: (db: DbPort) => unknown) => write(runtime.db!) }));
const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => {
  vi.useRealTimers();
  invalidateCompanionReadingScope();
  runtime.db = null;
  devices.splice(0).forEach(device => device.sqlite.close());
});

async function fixture() {
  const device = textDevice();
  devices.push(device);
  runtime.db = device.db;
  device.sqlite.exec("CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO companion_meta VALUES ('host_name', 'mobile')");
  const base = textBranch('base', 'Base');
  await device.receive([base, textBranch('main', 'Long main body', base)]);
  const current = await device.receive([textBranch('other', 'Other', base)]);
  return { ...device, alternative: current.snapshot.text_alternatives![0]! };
}

it.each([24, 240, 2400].flatMap(count => (['dismissed', 'promoted'] as const).map(status => ({ count, status }))))(
  'bounds unrelated JSON work at $count nodes for $status and persists it', async ({ count, status }) => {
    const device = await fixture();
    const observer = observeAlternativeLookup(device.sqlite, count);
    try {
      expect(await updateCompanionNodeTextAlternativeStatus('topic', device.alternative.id, status))
        .toMatchObject({ status, node_id: 'topic' });
      expect(observer.evaluatedIds.filter(id => id.startsWith('unrelated-'))).toEqual([]);
      const current = await device.current();
      expect(current.body_text).toBe(status === 'promoted' ? 'Other' : 'Long main body');
      expect(current.snapshot.text_alternatives).toEqual([]);
      await expect(updateCompanionNodeTextAlternativeStatus('topic', device.alternative.id, status)).rejects.toThrow('text_alternative_unavailable');
      const reopened = new Database(device.sqlite.serialize());
      try {
        expect(await loadCurrentSyncNodeRecord(createBetterSqliteDbPort(reopened), 'topic')).toEqual(current);
      } finally { reopened.close(); }
    } finally { observer.close(); }
  }
);

it.each(['dismissed', 'promoted'] as const)('isolates unavailable %s pairs and rolls back failed writes', async status => {
  const device = await fixture();
  device.sqlite.exec("INSERT INTO nodes (id, kind, title, created_at, updated_at) VALUES ('wrong', 'topic', 'Other topic', '2026-01-01', '2026-01-01')");
  const before = device.sqlite.serialize();
  await expect(updateCompanionNodeTextAlternativeStatus('wrong', device.alternative.id, status)).rejects.toThrow('text_alternative_unavailable');
  await expect(updateCompanionNodeTextAlternativeStatus('topic', 'stale', status)).rejects.toThrow('text_alternative_unavailable');
  expect(device.sqlite.serialize()).toEqual(before);
  device.sqlite.exec(`CREATE TRIGGER reject_selection BEFORE UPDATE OF current_version_id ON nodes
    BEGIN SELECT RAISE(ABORT, 'selection_failed'); END`);
  const withTrigger = device.sqlite.serialize();
  await expect(updateCompanionNodeTextAlternativeStatus('topic', device.alternative.id, status)).rejects.toThrow('selection_failed');
  expect(device.sqlite.serialize()).toEqual(withTrigger);
});

it.each(['dismissed', 'promoted'] as const)('leaves expired %s alternatives unchanged', async status => {
  const device = await fixture();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(device.alternative.expires_at) + 1);
  const before = device.sqlite.serialize();
  expect(await updateCompanionNodeTextAlternativeStatus('topic', device.alternative.id, status)).toMatchObject({ status: 'unavailable' });
  expect(device.sqlite.serialize()).toEqual(before);
});

it.each(['dismissed', 'promoted'] as const)('rejects a deleted owner for %s', async status => {
  const device = await fixture();
  device.sqlite.exec("UPDATE nodes SET deleted_at = '2026-01-01' WHERE id = 'topic'");
  const before = device.sqlite.serialize();
  await expect(updateCompanionNodeTextAlternativeStatus('topic', device.alternative.id, status)).rejects.toThrow('text_alternative_unavailable');
  expect(device.sqlite.serialize()).toEqual(before);
});
