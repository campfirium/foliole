import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { openDesktopAttachmentBlockReceiver } from './desktopAttachmentBlockFiles.js';

const [root, key] = process.argv.slice(2);
if (!root || !key || !process.send) throw new Error('attachment_crash_fixture_invalid');
const assetsDir = path.join(root, 'Assets');
const receiver = await openDesktopAttachmentBlockReceiver({ libraryRoot: root, assetsDir, availability: async () => {} });
if (receiver.kind !== 'acquired') throw new Error('attachment_crash_fixture_busy');
const resource = { storageKey: key, byteLength: 3 * BLOCK + 19 };
await receiver.receive(resource, 0, new Uint8Array(BLOCK).fill(0x79));
await receiver.receive(resource, BLOCK, new Uint8Array(BLOCK).fill(0x79));
// Leave the observable bytes of a process interrupted partway through its third write.
await fs.appendFile(path.join(assetsDir, `.attachment-${key.slice(0, 64)}.partial`), new Uint8Array(31).fill(0x79));
process.send('partial-written');
process.on('message', () => {});
