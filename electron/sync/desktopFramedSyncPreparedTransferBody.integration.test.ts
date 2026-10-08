// @vitest-environment node
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { expect, it } from 'vitest';

import { clearAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';

import { encodeFramedSyncHttpBody } from './desktopFramedSyncHttpWriter.js';
import { loadDesktopFramedSyncPreparedTransferBody } from './desktopFramedSyncPreparedTransferBody.js';
import { prepareDesktopFramedSyncPublishedDelivery, prepareDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { desktopResourceReadyFixture } from './desktopFramedSyncResourceReady.testSupport.js';

it('sends the exact prepared signed body after the source library closes', async () => {
  const source = await desktopResourceReadyFixture();
  const publication = { ...source.published, manifest: { facts: [source.fact], blobs: source.fact.blobs } };
  let closed = false;
  let body: Awaited<ReturnType<typeof loadDesktopFramedSyncPreparedTransferBody>> | undefined;
  try {
    await source.staging.publishOutbound(publication);
    const attempt = await prepareDesktopFramedSyncPublishedTransfer({ db: source.db, publication,
      groupSecret: Buffer.alloc(32, 5).toString('base64url'), staging: source.staging });
    body = await loadDesktopFramedSyncPreparedTransferBody({ attempt, publication, staging: source.staging });
    source.sqlite.close();
    closed = true;
    const hash = createHash('sha256');
    let length = 0;
    for await (const chunk of encodeFramedSyncHttpBody(body)) { hash.update(chunk); length += chunk.byteLength; }
    expect(length).toBe(body.contentLength);
    expect(hash.digest('hex')).toBe(body.bodySha256);
  } finally {
    await body?.dispose?.();
    if (!closed) source.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(source.root, { recursive: true, force: true });
  }
});

it('captures the same fixed wire bytes as durable replay before the source closes', async () => {
  const source = await desktopResourceReadyFixture();
  const publication = { ...source.published, manifest: { facts: [source.fact], blobs: source.fact.blobs } };
  let closed = false;
  const bodies: Awaited<ReturnType<typeof loadDesktopFramedSyncPreparedTransferBody>>[] = [];
  try {
    await source.staging.publishOutbound(publication);
    const delivery = await prepareDesktopFramedSyncPublishedDelivery({ db: source.db, publication,
      groupSecret: Buffer.alloc(32, 5).toString('base64url'), staging: source.staging });
    bodies.push(delivery.body);
    bodies.push(await loadDesktopFramedSyncPreparedTransferBody({ ...delivery,
      publication, staging: source.staging }));
    source.sqlite.close(); closed = true;
    const hashes = [];
    for (const body of bodies) {
      const hash = createHash('sha256');
      let length = 0;
      for await (const chunk of encodeFramedSyncHttpBody(body)) { hash.update(chunk); length += chunk.byteLength; }
      expect(length).toBe(body.contentLength);
      hashes.push(hash.digest('hex'));
      expect(hashes.at(-1)).toBe(body.bodySha256);
    }
    expect(hashes[0]).toBe(hashes[1]);
  } finally {
    await Promise.all(bodies.map(body => body.dispose?.()));
    if (!closed) source.sqlite.close();
    clearAttachmentLibraryPathSnapshot();
    await rm(source.root, { recursive: true, force: true });
  }
});
