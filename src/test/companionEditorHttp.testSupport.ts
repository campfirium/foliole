import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, rm, stat, truncate, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { vi } from 'vitest';

import type { NativeCompanionFramedFileRequest } from '../../lib/platform/nativeCompanionFramedFilesContract';
import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';

import type { createJoiningMobile } from './companionJoinedMobile.testSupport';

export async function seedEditorHttpAttachment(host: Awaited<ReturnType<typeof createJoiningMobile>>) {
  const bytes = Buffer.alloc(2 * 1024 * 1024, 0x37);
  const key = `${digest(bytes)}.png`;
  const source = path.resolve(host.peer.database, '../../Assets');
  const target = path.resolve(host.local.database, '../../Assets');
  await mkdir(source, { recursive: true });
  await mkdir(target, { recursive: true });
  await writeFile(path.join(source, key), bytes);
  const spy = vi.spyOn(FolioleCompanionSync, 'accessFramedSyncFile').mockImplementation(attachmentFiles(target));
  await host.provider.send('seed', { id: 'attachment-holder', content: `![Image](asset://${key})` });
  return { key, target, bytes, close: () => spy.mockRestore() };
}

function digest(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }

// Substitute native filesystem calls only; the production receiver owns offsets, hashes and database availability.
function attachmentFiles(root: string) {
  return async (input: NativeCompanionFramedFileRequest) => {
    if (input.operation !== 'attachment') throw new Error('Unexpected native operation');
    const partial = path.join(root, `.attachment-${input.key.slice(0, 64)}.partial`);
    const file = input.partial ? partial : path.join(root, input.key);
    switch (input.action) {
      case 'acquire': case 'source-close': return {};
      case 'source-stat-batch': return { presence: await Promise.all(input.keys!.map(async key => {
        try { return (await stat(path.join(root, key))).isFile(); } catch { return false; }
      })) };
      case 'stat': case 'source-open': {
        try { const info = await stat(file); return { present: true, length: info.size,
          hash: input.partial || input.action === 'source-open' ? '' : digest(await readFile(file)) }; }
        catch { return { present: false, length: 0, hash: '' }; }
      }
      case 'source-read': return { base64: (await readFile(file)).subarray(input.offset, input.offset! + input.length!).toString('base64') };
      case 'truncate': await appendFile(partial, ''); await truncate(partial, input.length); return {};
      case 'append': {
        if ((await stat(partial)).size !== input.offset) throw new Error('fixture_attachment_offset_mismatch');
        await appendFile(partial, Buffer.from(input.base64!, 'base64'));
        return {};
      }
      case 'hash': return { hash: digest(await readFile(file)) };
      case 'discard': await rm(partial, { force: true }); return {};
      case 'publish': await rename(partial, file); return {};
      default: throw new Error(`Unexpected attachment action: ${input.action}`);
    }
  };
}
