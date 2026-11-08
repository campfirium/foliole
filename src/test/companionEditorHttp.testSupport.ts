import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { vi } from 'vitest';

import { companionAttachmentNativeFiles } from '../shared/platform/companion/sync/framed/companionAttachmentNativeFiles.testSupport';
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
  const accessFile = companionAttachmentNativeFiles(root);
  return async (input: Parameters<typeof accessFile>[0]) => {
    if (input.operation === 'attachment' && input.action === 'append') {
      const partial = path.join(root, `.attachment-${input.key.slice(0, 64)}.partial`);
      if ((await stat(partial)).size !== input.offset) throw new Error('fixture_attachment_offset_mismatch');
    }
    return accessFile(input);
  };
}
