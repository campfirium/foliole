// @vitest-environment node
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { ensureFramedSyncFileResourceDemand, readFramedSyncFileResourceDemand,
  startFramedSyncFileResourceDemand } from '../../lib/core/sync/framedSyncFileResourceDemands.js';
import { createFramedSyncFileStaging } from '../../lib/core/sync/framedSyncFileStaging.js';
import { decodeFrameHeader } from '../../lib/core/sync/framedSyncFraming.js';
import { clearAttachmentLibraryPathSnapshot, publishAttachmentLibraryPathSnapshot } from '../attachments/attachmentLibraryPathSnapshot.js';
import { textDevice } from '../database/topicTextState.testSupport.js';

import { createDesktopFramedSyncFiles } from './desktopFramedSyncFiles.js';
import { prepareDesktopFramedSyncPublishedTransfer } from './desktopFramedSyncProcessOutbound.js';
import { desktopResourceReadyFixture } from './desktopFramedSyncResourceReady.testSupport.js';
import { receiveVerifiedDesktopFramedSyncTransfer } from './desktopFramedSyncVerifiedReceiver.js';

it('recovers resource demand completion after its file receipt without losing the verified attachment', async () => {
  const source = await desktopResourceReadyFixture();
  const target = textDevice();
  try {
    const senderFiles = createDesktopFramedSyncFiles(path.join(source.root, 'sender-files'));
    const sender = createFramedSyncFileStaging(senderFiles);
    const publication = { ...source.published, manifest: { facts: [source.fact], blobs: source.fact.blobs } };
    await sender.publishOutbound(publication);
    const groupKey = new Uint8Array(32).fill(5);
    const attempt = await prepareDesktopFramedSyncPublishedTransfer({ db: source.db, files: senderFiles,
      staging: sender, publication, groupSecret: Buffer.from(groupKey).toString('base64url') });
    const targetAssets = path.join(source.root, 'target', 'Assets');
    publishAttachmentLibraryPathSnapshot({ assetsDir: targetAssets, libraryScope: path.dirname(targetAssets) });
    const files = createDesktopFramedSyncFiles(path.join(source.root, 'target-files'));
    const key = { groupId: 'group', receiverDeviceId: 'receiver', receiverLibraryEpoch: 'r', globalId: 'article',
      versionId: 'version', bodyHash: 'a'.repeat(64), storageKey: source.resource.storageKey };
    await ensureFramedSyncFileResourceDemand(files, key, () => 'demand-1');
    await startFramedSyncFileResourceDemand(files, key, 'demand-1', source.fact.sharedStateHash);
    const interrupted = { ...files, async write(name: string, data: Uint8Array) {
      if (name.startsWith('demands/') && new TextDecoder().decode(data).includes('"state":"verified_present"')) {
        throw new Error('demand_completion_interrupted');
      }
      await files.write(name, data);
    } };
    const receive = (store: typeof files) => receiveVerifiedDesktopFramedSyncTransfer({ db: target.db, files: store,
      staging: createFramedSyncFileStaging(store), groupKey, context: publication.context,
      stream: { preamble: attempt.preamble, frames: (async function* () {
        for await (const frame of sender.streamReplayableFrames(publication.transferId, attempt.attemptId)) {
          yield { headerBytes: frame.frameHeader, ciphertext: frame.ciphertext, header: decodeFrameHeader(frame.frameHeader) };
        }
      })() } });
    await expect(receive(interrupted)).rejects.toThrow('demand_completion_interrupted');
    expect(await createFramedSyncFileStaging(files).loadReceipt(publication.transferId)).not.toBeNull();
    expect((await readFramedSyncFileResourceDemand(files, key))?.state).toBe('pending');
    const response = await receive(files);
    await response.dispose();
    expect((await readFramedSyncFileResourceDemand(files, key))?.state).toBe('verified_present');
    expect(await readFile(path.join(targetAssets, source.resource.storageKey))).toEqual(source.bytes);
    for (const table of ['framed_sync_resource_demands', 'framed_sync_receipts', 'framed_sync_resource_pins', 'framed_sync_outbound_frames']) {
      expect(target.sqlite.prepare(`SELECT count(*) FROM ${table}`).pluck().get()).toBe(0);
    }
  } finally {
    source.sqlite.close(); target.sqlite.close(); clearAttachmentLibraryPathSnapshot();
    await rm(source.root, { recursive: true, force: true });
  }
});
