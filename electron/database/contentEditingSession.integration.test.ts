// @vitest-environment node
import { afterEach, expect, it } from 'vitest';

import { beginContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';
import { applyLocalContentEdit } from '../../lib/core/sync/localContentEdit.js';
import { settleContentEditingSession } from '../../lib/core/sync/settleContentEditingSession.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';
import { transferTopicText } from './topicTextRequest.testSupport.js';
import { textBranch, textDevice } from './topicTextState.testSupport.js';

const devices: ReturnType<typeof textDevice>[] = [];
afterEach(() => devices.splice(0).forEach(device => device.sqlite.close()));

it('keeps saving its own branch across incoming forks and returned descendants', async () => {
  const local = textDevice();
  const peer = textDevice();
  devices.push(local, peer);
  const base = textBranch('base', 'Base');
  await local.receive([base]);
  await peer.receive([base]);
  beginContentEditingSession(local.db, 'topic', 'editing');
  const save = async (content: string, versionId: string) => {
    const current = await local.current();
    return (await applyLocalContentEdit(createBetterSqliteDbPort(local.sqlite), {
      nodeId: 'topic', baseVersionId: current.version_id!, baseContent: current.body_text!,
      content, versionId, title: 'Topic', hideTitleHeading: false, hostName: 'local',
      updatedAt: new Date().toISOString()
    })).current;
  };
  const first = await save('Local 1', 'local-1');
  expect(first.version_id).toBe('local-1');
  expect(await transferTopicText(local, peer)).toBe(true);
  expect((await peer.current()).body_text).toBe('Local 1');
  const remote = textBranch('remote', 'Remote', base);
  await local.receive([remote]);
  expect((await local.current()).version_id).toBe('local-1');
  const second = await save('Local 2', 'local-2');
  expect(second.parent_version_ids).toEqual(['local-1']);
  const merged = await peer.receive([remote, second]);
  expect(merged.ancestor_version_ids).toContain('local-2');
  expect(await transferTopicText(peer, local)).toBe(true);
  expect((await local.current()).version_id).toBe('local-2');
  const third = await save('Local 3', 'local-3');
  expect(third.body_text).toBe('Local 3');
  expect(third.parent_version_ids).toEqual(['local-2']);
  expect(local.sqlite.prepare('SELECT count(*) FROM node_sync_versions WHERE object_id = ? AND '
    + 'version_id IN (SELECT version_id FROM node_sync_version_parents GROUP BY version_id HAVING count(*) > 1)')
    .pluck().get('topic')).toBe(1); // Only the peer resolution, never a local resolution.
  expect(await settleContentEditingSession(local.db, 'topic', 'editing')).toBe(true);
  const final = await local.current();
  expect(await local.wholeBodies()).toContain('Local 3');
  expect(await transferTopicText(local, peer)).toBe(true);
  expect((await peer.current()).version_id).toBe(final.version_id);
  expect((await peer.current()).body_text).toBe(final.body_text);
  expect(await local.wholeBodies()).toEqual(await peer.wholeBodies());
});

it('adopts a returned descendant at exit without adding a resolution and rejects old exit tokens', async () => {
  const host = textDevice();
  devices.push(host);
  const base = textBranch('base', 'Base');
  const remote = textBranch('remote', 'Remote', base);
  await host.receive([base]);
  beginContentEditingSession(host.db, 'topic', 'old');
  await host.receive([remote]);
  beginContentEditingSession(createBetterSqliteDbPort(host.sqlite), 'topic', 'new');
  expect(await settleContentEditingSession(host.db, 'topic', 'old')).toBe(false);
  expect((await host.current()).version_id).toBe('base');
  expect(await settleContentEditingSession(host.db, 'topic', 'new')).toBe(true);
  expect((await host.current()).version_id).toBe('remote');
  expect(host.sqlite.prepare('SELECT count(*) FROM node_sync_versions').pluck().get()).toBe(2);
});

it.each(['write', 'commit'])('leaves other databases free to adopt and restores a failed %s for retry', async failure => {
  const host = textDevice();
  const other = textDevice();
  devices.push(host, other);
  const base = textBranch('base', 'Base');
  const remote = textBranch('remote', 'Remote', base);
  await host.receive([base]);
  await other.receive([base]);
  beginContentEditingSession(host.db, 'topic', 'editing');
  await host.receive([remote]);
  await other.receive([remote]);
  expect((await other.current()).version_id).toBe('remote');
  if (failure === 'write') {
    host.sqlite.exec("CREATE TRIGGER fail_exit BEFORE UPDATE ON nodes BEGIN SELECT RAISE(ABORT, 'exit_failed'); END");
  } else {
    host.sqlite.exec(`CREATE TABLE exit_failure (parent_id TEXT REFERENCES nodes(id) DEFERRABLE INITIALLY DEFERRED);
      CREATE TRIGGER fail_exit AFTER UPDATE ON nodes BEGIN INSERT INTO exit_failure VALUES ('missing'); END`);
  }
  await expect(settleContentEditingSession(host.db, 'topic', 'editing')).rejects.toThrow();
  host.sqlite.exec('DROP TRIGGER fail_exit');
  const later = textBranch('later', 'Later', remote);
  await host.receive([later]);
  expect((await host.current()).version_id).toBe('base');
  expect(await settleContentEditingSession(host.db, 'topic', 'editing')).toBe(true);
  expect((await host.current()).version_id).toBe('later');
});
