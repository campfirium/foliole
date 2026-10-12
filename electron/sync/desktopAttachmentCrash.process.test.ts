// @vitest-environment node
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it } from 'vitest';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { createBlockReceiverFixture, deliverBlocks } from './desktopAttachmentBlockReceiver.testSupport.js';

it('recovers a killed owner with a non-aligned partial and completes the original file', async () => {
  const bytes = Buffer.alloc(3 * BLOCK + 19, 0x79);
  const fixture = await createBlockReceiverFixture(bytes);
  const child = fork(path.resolve('electron/sync/desktopAttachmentCrash.fixture.ts'), [fixture.root, fixture.resource.storageKey], {
    execPath: process.execPath,
    execArgv: ['--experimental-strip-types', '--experimental-loader', './scripts/android/ts-js-extension-loader.mjs'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc']
  });
  try {
    expect((await once(child, 'message', { signal: AbortSignal.timeout(10000) }))[0]).toBe('partial-written');
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    const receiver = await reacquire(fixture.open);
    expect(await receiver.status(fixture.resource)).toEqual({ kind: 'partial', offset: BLOCK });
    await deliverBlocks(receiver, fixture.resource, bytes, BLOCK);
    expect(await readFile(fixture.final)).toEqual(bytes);
    expect(fixture.available()).toBe(1);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
    await fixture.close();
  }
});

async function reacquire(open: Awaited<ReturnType<typeof createBlockReceiverFixture>>['open']) {
  const deadline = Date.now() + 5000;
  for (;;) {
    try { return await open(); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== 'attachment_receiver_busy' || Date.now() >= deadline) throw error;
      await delay(25);
    }
  }
}
