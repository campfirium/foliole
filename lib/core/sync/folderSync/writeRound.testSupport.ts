import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { hexToBytes } from '@noble/hashes/utils.js';

import { textBranch } from '../../../../electron/database/topicTextState.testSupport.js';
import { openDesktopAttachmentBlockReceiver } from '../../../../electron/sync/desktopAttachmentBlockFiles.js';
import { createDesktopAttachmentBlockSource } from '../../../../electron/sync/desktopAttachmentBlockSource.js';
import { createDesktopFramedSyncFiles } from '../../../../electron/sync/desktopFramedSyncFiles.js';
import { applyConvergentSyncNodesWithDbPort } from '../syncNodeConvergence.js';

import { loadFolderSyncCheckpoint, readFolderSyncMessage, type FolderSyncCheckpoint } from './checkpoint.js';
import { createFolderSourceFixture, inspectStagedObject } from './sourceSnapshot.testSupport.js';
import { writeFolderSyncRound } from './writeRound.js';

export async function createFolderWriterFixture() {
  const source = await createFolderSourceFixture();
  const sourceAssets = path.join(source.root, 'source-assets');
  const targetRoot = path.join(source.root, 'target');
  const targetAssets = path.join(targetRoot, 'attachments');
  await fs.mkdir(sourceAssets, { recursive: true });
  await fs.mkdir(targetRoot, { recursive: true });
  const receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: targetRoot,
    assetsDir: targetAssets, availability: async () => undefined });
  if (receiver.kind !== 'acquired') throw new Error('fixture_target_busy');
  const files = createDesktopFramedSyncFiles(targetRoot);
  const input = { sourceId: 'isolated-source', source: source.host,
    sourceAttachments: createDesktopAttachmentBlockSource(sourceAssets, source.root),
    target: { files, attachments: receiver }, assertCurrent() {} };
  return {
    ...source, input, sourceAssets, targetRoot, targetAssets,
    run: () => writeFolderSyncRound(input),
    checkpoint: () => loadFolderSyncCheckpoint(files, input.sourceId),
    async resources(writeFiles = true, byteLength = 1024) {
      const image = Buffer.alloc(byteLength, 17);
      const pdf = Buffer.from('%PDF-1.7\nrepresentative file bytes\n%%EOF');
      const key = (bytes: Uint8Array, extension: string) => `${createHash('sha256').update(bytes).digest('hex')}.${extension}`;
      const imageKey = key(image, 'png');
      const pdfKey = key(pdf, 'pdf');
      const record = textBranch('with-resources', `![image](asset://${imageKey})`, source.first);
      record.snapshot.resource_references = JSON.stringify([{ storage_key: pdfKey, role: 'reference', original_name: 'Original.pdf' }]);
      await applyConvergentSyncNodesWithDbPort(source.db, [record]);
      source.sqlite.exec('DELETE FROM attachment_pending; DELETE FROM attachment_parse_queue');
      if (writeFiles) {
        await fs.writeFile(path.join(sourceAssets, imageKey), image);
        await fs.writeFile(path.join(sourceAssets, pdfKey), pdf);
      }
      return { image, pdf, imageKey, pdfKey };
    },
    async close() { await receiver.close(); source.close(); }
  };
}

export async function checkpointPayloadCases(f: Awaited<ReturnType<typeof createFolderWriterFixture>>,
  checkpoint: FolderSyncCheckpoint) {
  const cases: string[] = [];
  for (const object of checkpoint.objects) {
    for (const frame of object.frames) cases.push((await readFolderSyncMessage(f.input.target.files, frame)).payloadCase);
  }
  return cases;
}

export async function inspectStoredObject(f: Awaited<ReturnType<typeof createFolderWriterFixture>>,
  object: FolderSyncCheckpoint['objects'][number]) {
  const files = f.input.target.files;
  const snapshot = { contextId: hexToBytes(object.contextId), inventory: [], objects: [object],
    resourceKeys: [], async dispose() {}, async *messages() {
      for (const frame of object.frames) {
        const encoded = (await files.read(frame.key))!;
        yield { encoded, message: await readFolderSyncMessage(files, frame) };
      }
    } };
  return inspectStagedObject({ ...f.host, files }, snapshot, object);
}
