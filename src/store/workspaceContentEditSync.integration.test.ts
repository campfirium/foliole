// @vitest-environment node
import { promises as fs } from 'node:fs';

import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';

import { readFixtureInventory, reconnectFixturePeer } from '../../electron/sync/desktopFramedSyncPublicationRecovery.testSupport';
import { createDesktopFramedSyncTwoProcessFixture } from '../../electron/sync/desktopFramedSyncTwoProcess.testSupport';
import { compareFramedSyncDatabaseInventories } from '../../lib/core/sync/framedSyncDatabaseDifference';
import type { Node } from '../features/nodes/model/nodeTypes';
import { createWorkspaceRuntimeNodeSnapshot } from '../shared/platform/workspaceRuntimeNodeRepository';

import { acknowledgeContentEdit, captureContentEdit, continueContentEdit,
  resetContentEditAcknowledgementsForTests } from './workspaceContentEditAcknowledgements';
import { mergeHydratedNode } from './workspaceHydrateObjectMerge';
import { markNodeContentEdited, resetNodeContentVersionGuardForTests } from './workspaceNodeContentVersionGuard';

const nodeId = 't326-concurrent-editor';
const baseBody = '\ufeffFirst\r\nMiddle 中😀\0\r\nLast\r\n';
const remoteBody = baseBody.replace('Last', 'Remote last');
const localBody = baseBody.replace('First', 'Local first');
const timestamp = (second: number) => `2026-10-09T01:00:0${second}.000Z`;

afterEach(() => {
  resetContentEditAcknowledgementsForTests();
  resetNodeContentVersionGuardForTests();
});

function persisted(databasePath: string) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const node = db.prepare<[string], { content: string; current_version_id: string }>(
      'SELECT content, current_version_id FROM nodes WHERE id = ?').get(nodeId);
    if (!node) throw new Error('concurrent_node_missing');
    const bodies = db.prepare<[string], { body_text: string }>(
      `SELECT json_extract(body.value, '$.text') AS body_text FROM nodes n
        JOIN node_sync_versions v ON v.version_id = n.current_version_id,
        json_each(v.snapshot_json, '$.text_alternative_bodies') body WHERE n.id = ?`).all(nodeId);
    const versions = db.prepare<[string], { version_id: string; body_text: string | null }>(
      'SELECT version_id, body_text FROM node_sync_versions WHERE object_id = ? ORDER BY version_id').all(nodeId);
    const parents = db.prepare('SELECT * FROM node_sync_version_parents ORDER BY version_id, ordinal').all();
    return { node, bodies: new Set([node.content, ...bodies.map((body) => body.body_text)]), versions, parents };
  } finally { db.close(); }
}

function rendererNode(versionId: string, content: string, updatedAt: string): Node {
  return { id: nodeId, kind: 'topic', parentNodeId: null, title: 'Concurrent article', content,
    currentVersionId: versionId, createdAt: timestamp(0), updatedAt, reveal: null, review: null, anchorLink: null };
}

it.each(['saved-before-receive', 'unsaved-during-receive'] as const)(
  'preserves both whole bodies and the real edit basis: %s', async (timing) => {
    const fixture = await createDesktopFramedSyncTwoProcessFixture();
    let succeeded = false;
    try {
      await fixture.left.seed({ nodeId, content: baseBody, title: 'Concurrent article' });
      await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
      const baseId = persisted(fixture.rightSnapshot.databasePath).node.current_version_id;
      await fixture.right.invoke('retain_edit', { nodeId, holdId: 'editor', versionId: baseId });
      const draft = rendererNode(baseId, localBody, timestamp(1));
      markNodeContentEdited(nodeId);
      const edit = captureContentEdit(draft);
      if (!edit) throw new Error('concurrent_edit_basis_missing');
      const save = () => fixture.right.invoke('local_content_edit', {
        ...edit, nodeId, content: draft.content, hostName: 'desktop-b', updatedAt: draft.updatedAt
      });
      if (timing === 'saved-before-receive') await save();
      await fixture.left.invoke('local_content_edit', { nodeId, baseVersionId: baseId,
        versionId: 'ver_remote', content: remoteBody, hostName: 'desktop-a', updatedAt: timestamp(2) });
      await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
      if (timing === 'unsaved-during-receive') {
        const received = persisted(fixture.rightSnapshot.databasePath);
        expect(received.node.content).toBe(remoteBody);
        const hydrated = mergeHydratedNode(draft,
          rendererNode(received.node.current_version_id, received.node.content, timestamp(2)));
        expect(hydrated.content).toBe(localBody);
        expect(hydrated.currentVersionId).toBe(baseId);
        expect(edit.baseVersionId).toBe(baseId);
        expect(received.versions.find((version) => version.version_id === baseId)?.body_text).toBe(baseBody);
        await save();
      }
      await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
      const left = persisted(fixture.leftSnapshot.databasePath);
      const right = persisted(fixture.rightSnapshot.databasePath);
      expect(left.bodies).toEqual(new Set([localBody, remoteBody]));
      expect(right.bodies).toEqual(left.bodies);
      expect(right.parents).toEqual(expect.arrayContaining([
        { version_id: edit.versionId, parent_version_id: baseId, ordinal: 0 }
      ]));
      expect(compareFramedSyncDatabaseInventories({ local: await readFixtureInventory(fixture.left),
        remote: await readFixtureInventory(fixture.right) })).toEqual([]);
      const restart = await fixture.restartRight();
      expect(persisted(restart.snapshot.databasePath)).toEqual(right);
      succeeded = true;
    } finally {
      await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
      if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
      else console.info('Concurrent editor fixture:', fixture.root);
    }
  }, 60_000);

function assertVersionBody(databasePath: string, versionId: string, body: string) {
  expect(persisted(databasePath).versions.find((version) => version.version_id === versionId)?.body_text).toBe(body);
}

it('continues newer input from its acknowledged branch while independent edit holds survive sync receipts', async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture();
  let succeeded = false;
  try {
    await fixture.left.seed({ nodeId, content: baseBody, title: 'Concurrent article' });
    await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
    const databasePath = fixture.rightSnapshot.databasePath;
    const baseId = persisted(databasePath).node.current_version_id;
    for (const holdId of ['editor', 'other-editor']) {
      await fixture.right.invoke('retain_edit', { nodeId, holdId, versionId: baseId });
    }
    const draft = rendererNode(baseId, localBody, timestamp(1));
    const version = markNodeContentEdited(nodeId);
    const edit = captureContentEdit(draft);
    const next = captureContentEdit(draft);
    if (!edit || !next) throw new Error('concurrent_edit_basis_missing');
    await fixture.left.invoke('local_content_edit', { nodeId, baseVersionId: baseId,
      versionId: 'ver_remote', content: remoteBody, hostName: 'desktop-a', updatedAt: timestamp(2) });
    await reconnectFixturePeer(fixture.right, fixture.leftSnapshot);
    expect(mergeHydratedNode(draft, rendererNode(persisted(databasePath).node.current_version_id,
      remoteBody, timestamp(2))).content).toBe(localBody);
    const result = z.object({ submittedVersionId: z.string(), current: z.object({ version_id: z.string() }) })
      .parse(await fixture.right.invoke('local_content_edit', { ...edit, nodeId,
        content: localBody, hostName: 'desktop-b', updatedAt: timestamp(1) }));
    markNodeContentEdited(nodeId);
    const saved = persisted(databasePath).node;
    acknowledgeContentEdit({ edit, node: draft, version, set: () => undefined, result: {
      contentEdit: { currentVersionId: result.current.version_id, submittedVersionId: result.submittedVersionId },
      nodes: [createWorkspaceRuntimeNodeSnapshot(rendererNode(saved.current_version_id, saved.content, timestamp(2)), 0)]
    } });
    continueContentEdit(nodeId, next);
    expect(next.baseVersionId).toBe(edit.versionId);
    await fixture.right.invoke('retain_edit', { nodeId, holdId: 'editor', versionId: next.baseVersionId });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    await fixture.right.invoke('collect_content');
    assertVersionBody(databasePath, baseId, baseBody);
    assertVersionBody(databasePath, edit.versionId, localBody);
    await fixture.right.invoke('release_edit', { nodeId, holdId: 'other-editor' });
    assertVersionBody(databasePath, edit.versionId, localBody);
    const continued = localBody.replace('Last', 'Continued last');
    await fixture.right.invoke('local_content_edit', { ...next, nodeId,
      content: continued, hostName: 'desktop-b', updatedAt: timestamp(3) });
    await reconnectFixturePeer(fixture.left, fixture.rightSnapshot);
    await fixture.right.invoke('release_edit', { nodeId, holdId: 'editor' });
    await fixture.right.invoke('collect_content');
    const right = persisted(databasePath);
    expect([...right.bodies]).toEqual(expect.arrayContaining([continued, remoteBody]));
    expect(right.parents).toContainEqual({ version_id: next.versionId, parent_version_id: edit.versionId, ordinal: 0 });
    expect(persisted(fixture.leftSnapshot.databasePath).bodies).toEqual(right.bodies);
    const restarted = await fixture.restartRight();
    expect(persisted(restarted.snapshot.databasePath)).toEqual(right);
    succeeded = true;
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    if (succeeded) await fs.rm(fixture.root, { recursive: true, force: true });
    else console.info('Editor acknowledgement fixture:', fixture.root);
  }
}, 60_000);
