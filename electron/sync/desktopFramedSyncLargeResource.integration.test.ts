// @vitest-environment node
import { createCipheriv } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';
import { z } from 'zod';

import { reconnectFixturePeer } from './desktopFramedSyncPublicationRecovery.testSupport.js';
import { createDesktopFramedSyncTwoProcessFixture } from './desktopFramedSyncTwoProcess.testSupport.js';
import { hashResourceFile } from './resourceFileHash.js';

async function createResource(file: string) {
  const cipher = createCipheriv('aes-256-ctr', Buffer.alloc(32, 7), Buffer.alloc(16, 3));
  const output = await fs.open(file, 'wx');
  const block = Buffer.alloc(64 * 1024);
  try {
    for (let index = 0; index < 800; index++) {
      const bytes = cipher.update(block);
      if (index === 0) bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = await output.write(bytes, offset, bytes.byteLength - offset);
        if (written.bytesWritten < 1) throw new Error('fixture_resource_write_failed');
        offset += written.bytesWritten;
      }
    }
  } finally { await output.close(); }
}

it('transfers a deterministic incompressible 50 MiB file through independent authenticated HTTP libraries', { meta: { calibratedMs: 120_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    const source = path.join(fixture.root, 'large-resource.png');
    await createResource(source);
    const hash = await hashResourceFile(source);
    const storageKey = `${hash}.png`;
    expect(await fixture.left.invoke('seed_resource', { filePath: source,
      includeImageInBody: true, nodeId: 'large-resource' })).toEqual({ hash, storageKey });
    const resultSchema = z.object({ complete: z.boolean(), attachmentProgress: z.number().optional(),
      attachmentYielded: z.boolean().optional(), dynamicBacklog: z.boolean().optional() });
    let completed = false;
    for (let round = 0; round < 8; round++) {
      const result = resultSchema.parse(await reconnectFixturePeer(fixture.right, fixture.leftSnapshot));
      if (result.complete) { completed = true; break; }
      expect((result.attachmentProgress ?? 0) > 0 || result.attachmentYielded || result.dynamicBacklog).toBe(true);
    }
    expect(completed).toBe(true);
    const target = path.join(fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', storageKey);
    expect((await fs.stat(target)).size).toBe(50 * 1024 * 1024);
    expect(await hashResourceFile(target)).toBe(hash);
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});
