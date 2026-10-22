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

it('drains a pending attachment in one phone round under mobile request cost', { meta: { calibratedMs: 60_000 } }, async () => {
  const host = await createCompanionRequestFixture();
  const bytes = Buffer.alloc(BLOCKS * ATTACHMENT_BLOCK_BYTES, 0x64);
  const key = `${createHash('sha256').update(bytes).digest('hex')}.png`;
  try {
    await host.fixture.right.seed({ nodeId: 'drain-attachment', title: 'Image', content: `![image](asset://${key})` });
    const assets = path.join(host.fixture.rightSnapshot.stateRoot, 'documents', 'Foliole', 'Assets');
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
    const target = path.join(host.fixture.leftSnapshot.stateRoot, 'documents', 'Foliole', 'Assets', key);
    expect((await readFile(target)).equals(bytes)).toBe(true);
  } finally { await host.close(); }
});
