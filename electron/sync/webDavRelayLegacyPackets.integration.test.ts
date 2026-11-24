// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { webDavRelayStatus, type WebDavRelayRequest } from '../../lib/core/sync/webDavRelayPublication.js';
import { hasWebDavRelayRepairToSend } from '../../lib/core/sync/webDavRelayRepairOutbox.js';
import type { RestorePeer } from '../database/requestSyncRestoreRecovery.testSupport.js';

import { edit as editArticle, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';
import { edit, text, withRelayPeers } from './webDavRelayBodyRound.testSupport.js';

it('receives an already published v0.8.2 body once after reopening', async () => {
  await withRelayPeers(async ({ source, target, sync }) => {
    await edit(source, 'old-body', 'Originally published by v0.8.2');
    expect(await sync(source)).toMatchObject({ published: 1 });
    source.reopen();
    expect(await sync(source)).toMatchObject({ published: 0 });

    target.reopen();
    expect(await sync(target)).toMatchObject({ applied: 1 });
    target.reopen();
    expect(await text(target, 'old-body')).toBe('Originally published by v0.8.2');
    expect(await sync(target)).toMatchObject({ applied: 0 });
  }, (_response, request) => {
    if (request.method === 'MOVE' && typeof request.headers.destination === 'string') {
      request.headers.destination = oldName(request.headers.destination);
    }
    return false;
  });
});

it('resumes an unsent v0.8.2 body before publishing new DAT work', async () => {
  let rejectPut = true;
  const publications: string[] = [];
  await withRelayPeers(async ({ source, target, sync, scope }) => {
    await edit(source, 'old-pending', 'Already staged by v0.8.2');
    await expect(sync(source)).rejects.toThrow('webdav_relay_stage_failed:500');
    const { key } = await scope(source);
    const old = await preserveLegacyOutboxName(source, `${key}:outbox`);
    await edit(source, 'new-pending', 'Created after the upgrade');

    source.reopen();
    rejectPut = false;
    expect(await sync(source)).toMatchObject({ published: 2, retries: 1 });
    expect(publications).toEqual([old, expect.stringMatching(/\.dat$/u)]);
    source.reopen();
    expect(await sync(source)).toMatchObject({ published: 0 });
    expect(await sync(target)).toMatchObject({ applied: 2 });
    target.reopen();
    expect(await text(target, 'old-pending')).toBe('Already staged by v0.8.2');
    expect(await text(target, 'new-pending')).toBe('Created after the upgrade');
  }, (response, request) => {
    if (rejectPut && request.method === 'PUT') {
      response.writeHead(500).end();
      return true;
    }
    if (request.method === 'MOVE' && typeof request.headers.destination === 'string') {
      publications.push(path.posix.basename(new URL(request.headers.destination).pathname));
    }
    return false;
  });
});

it('settles a legacy attachment after a lost MOVE response without a duplicate upload', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('Legacy attachment');
    const attachment = storageKey(bytes);
    await writeFile(path.join(source.assets, attachment), bytes);
    await editArticle(source.peer, [attachment], 'legacy-attachment');
    fixture.loseAttachmentPublicationResponse();
    await expect(fixture.sync(source)).rejects.toThrow('lost_attachment_publication_response');

    const { key } = (await fixture.scope(source.peer))!;
    await preserveLegacyOutboxName(source.peer, `${key}:attachment-outbox`, '$.name');
    await movePublishedToLegacyName(fixture.request, fixture.uploads[0]!);
    await source.reopen();
    expect(await fixture.sync(source)).toMatchObject({ published: 1, retries: 1 });
    expect(fixture.uploads).toHaveLength(1);

    expect(await fixture.sync(target)).toMatchObject({ applied: 2 });
    await target.reopen();
    expect(await readFile(path.join(target.assets, attachment))).toEqual(bytes);
    expect(await fixture.sync(target)).toMatchObject({ applied: 0 });
  } finally { await fixture.close(); }
});

it('resumes a legacy repair packet and the peer uses it to recover a missing file', async () => {
  const fixture = await relayFixture();
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('File requested by a legacy repair');
    const attachment = storageKey(bytes);
    await editArticle(source.peer, [attachment], 'needs-legacy-repair');
    await fixture.sync(source);
    fixture.dav.dropNextMove();
    await expect(fixture.sync(target)).rejects.toThrow();

    const scope = (await fixture.scope(target.peer))!;
    const targetRequests = () => fixture.repairUploads.filter(upload => upload.startsWith(scope.outgoing.href));
    expect(targetRequests()).toHaveLength(1);
    await preserveLegacyOutboxName(target.peer, `${scope.key}:repair-outbox`);
    await movePublishedToLegacyName(fixture.request, targetRequests()[0]!);
    await target.reopen();
    await fixture.sync(target);
    expect(targetRequests()).toHaveLength(1);
    expect(await hasWebDavRelayRepairToSend(target.peer.db, scope)).toBe(false);

    await writeFile(path.join(source.assets, attachment), bytes);
    const { key: sourceKey } = (await fixture.scope(source.peer))!;
    await fixture.sync(source);
    const [receipt] = await source.peer.db.query<{ value: string }>(
      'SELECT value FROM sync_group_metadata WHERE key LIKE ?', [`${sourceKey}:repair-received:%`]);
    expect(receipt?.value).toBe('true');
    await fixture.sync(target);
    await target.reopen();
    expect(await readFile(path.join(target.assets, attachment))).toEqual(bytes);
  } finally { await fixture.close(); }
});

function oldName(value: string) {
  expect(value).toMatch(/\.dat$/u);
  return value.replace(/\.dat$/u, '.bin');
}

async function preserveLegacyOutboxName(peer: RestorePeer, key: string, namePath = '$.packet.name') {
  const [row] = await peer.db.query<{ name: string }>(
    'SELECT json_extract(value, ?) AS name FROM sync_group_metadata WHERE key = ?', [namePath, key]);
  const legacy = oldName(row!.name);
  await peer.db.run('UPDATE sync_group_metadata SET value = json_set(value, ?, ?) WHERE key = ?',
    [namePath, legacy, key]);
  return legacy;
}

async function movePublishedToLegacyName(request: WebDavRelayRequest, upload: string) {
  const current = upload.replace(/\.partial$/u, '');
  expect(await request(new URL(current), { method: 'MOVE', headers: { Destination: oldName(current) } },
    webDavRelayStatus)).toBe(201);
}
