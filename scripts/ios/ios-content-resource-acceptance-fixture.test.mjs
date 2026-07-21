// @vitest-environment node
/* global Buffer */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { readPackRowsFromZip } from '../../electron/database/syncPackZipReaderTestSupport.ts';

import {
  createIosContentResourceAcceptanceFixture,
  IOS_CONTENT_RESOURCE_TOKENS
} from './ios-content-resource-acceptance-fixture.ts';

let tempRoot = '';

afterEach(async () => {
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('uses the authoritative producer for three-domain content and resource manifests', async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-ios-content-resource-'));
  const fixture = await createIosContentResourceAcceptanceFixture({
    outputDirectory: tempRoot,
    toPeerId: 'ios-content-device'
  });
  const pack = readPackRowsFromZip(fixture.packPath, tempRoot);
  const objects = pack.syncObjects.map((record) => ({
    ...record,
    payload: JSON.parse(record.payload_json)
  }));

  expect(pack.manifest).toMatchObject({ to_peer_id: 'ios-content-device', to_state_seq: 10 });
  expect(pack.blobDataTable).toBeUndefined();
  expect(pack.blobs.map((row) => row.hash).sort()).toEqual(
    Object.values(fixture.contentBlobs).map((blob) => blob.hash).sort()
  );
  expect(pack.nodes).toEqual(expect.arrayContaining([
    expect.objectContaining({ body_blob_hash: fixture.contentBlobs.topic.hash, id: 'ios-content-topic' }),
    expect.objectContaining({ body_blob_hash: fixture.contentBlobs.corrupt.hash, id: 'ios-content-corrupt' }),
    expect.objectContaining({ body_blob_hash: fixture.contentBlobs.missing.hash, id: 'ios-content-missing' })
  ]));
  expect(pack.externalDocuments).toEqual([
    expect.objectContaining({ body_blob_hash: fixture.contentBlobs.external.hash, document_id: 'ios-external:orchid.md' })
  ]);
  expect(pack.nodeAttachments).toEqual([
    { attachment_id: fixture.attachments.valid.id, node_id: 'ios-content-topic', role: 'reference' }
  ]);
  expect(objects.filter((record) => record.object_type === 'attachment')).toHaveLength(4);
  expect(objects).toContainEqual(expect.objectContaining({
    object_id: `${fixture.attachments.valid.id}:1`,
    object_type: 'pdf_page_text',
    payload: expect.objectContaining({ text: expect.stringContaining(IOS_CONTENT_RESOURCE_TOKENS.pdf) })
  }));
  expect(Buffer.from(fixture.contentBlobs.topic.bytes).toString()).toContain(IOS_CONTENT_RESOURCE_TOKENS.topic);
  expect(Buffer.from(fixture.contentBlobs.external.bytes).toString()).toContain(IOS_CONTENT_RESOURCE_TOKENS.external);
});
