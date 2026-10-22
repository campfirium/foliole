// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES } from '../../lib/core/sync/attachmentBlockReceiver.js';
import { hasRetryWork } from '../companion/companionSyncContinuation.js';

import { createCompanionRequestFixture, native } from './companionRequestSync.testSupport';

const BLOCKS = 48;
const REQUEST_DELAY_MS = 50;

it.each([
  { direction: 'pull', source: 'right', target: 'left' },
  { direction: 'push', source: 'left', target: 'right' }
] as const)('drains a pending $direction attachment in one phone round under mobile request cost', { meta: { calibratedMs: 60_000 } }, async ({ source, target: receiver }) => {
  const host = await createCompanionRequestFixture();
  const bytes = Buffer.alloc(BLOCKS * ATTACHMENT_BLOCK_BYTES, 0x64);
  const key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  const assetsOf = (side: 'left' | 'right') =>
    path.join(host.fixture[`${side}Snapshot`].stateRoot, 'documents', 'Foliole', 'Assets');
  try {
    await host.fixture[source].seed({ nodeId: 'drain-attachment', title: 'Image', content: `![image](asset://${key})` });
    if (source === 'left') await host.sync();
    const assets = assetsOf(source);
    await mkdir(assets, { recursive: true });
    await writeFile(path.join(assets, key), bytes);
    let attachmentRequests = 0;
    native.post.mockImplementation(async input => {
      if (new URL(input.url).searchParams.get('request') === 'attachments') attachmentRequests++;
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
      return host.post(input);
    });
    const result = await host.sync();
    // Only the attachment remains after the data stage; it must not be split across rounds or retries.
    expect(result.remainingAttachmentResourceCount).toBe(0);
    expect(result.transferredAttachmentBlockCount).toBe(BLOCKS);
    expect(hasRetryWork(result)).toBe(false);
    expect(attachmentRequests).toBeLessThanOrEqual(BLOCKS / 8 + 6);
    expect((await readFile(path.join(assetsOf(receiver), key))).equals(bytes)).toBe(true);
  } finally { await host.close(); }
});
