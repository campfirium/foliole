// @vitest-environment node
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, it } from 'vitest';
import { z } from 'zod';

import { ATTACHMENT_BLOCK_BYTES as BLOCK } from '../../lib/core/sync/attachmentBlockReceiver.js';

import { createBlockReceiverFixture, deliverBlocks } from './desktopAttachmentBlockReceiver.testSupport.js';
import { createLargeCrashFixture } from './desktopAttachmentCrash.testSupport.js';
import { hashResourceFile } from './resourceFileHash.js';

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

it('recovers a published file after its owner is killed before writing availability', async () => {
  const bytes = Buffer.alloc(3 * BLOCK + 19, 0x79);
  const fixture = await createBlockReceiverFixture(bytes);
  const child = fork(path.resolve('electron/sync/desktopAttachmentCrash.fixture.ts'),
    [fixture.root, fixture.resource.storageKey, 'published'], {
      execPath: process.execPath,
      execArgv: ['--experimental-strip-types', '--experimental-loader', './scripts/android/ts-js-extension-loader.mjs'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    });
  try {
    expect((await once(child, 'message', { signal: AbortSignal.timeout(10000) }))[0]).toBe('published-before-index');
    const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    expect(await readFile(fixture.final)).toEqual(bytes);
    expect(fixture.available()).not.toBe(1);
    await expect(stat(fixture.partial)).rejects.toMatchObject({ code: 'ENOENT' });
    const receiver = await reacquire(fixture.open);
    expect(await receiver.status(fixture.resource)).toEqual({ kind: 'complete', offset: bytes.length });
    expect(fixture.available()).toBe(1);
    expect(await readFile(fixture.final)).toEqual(bytes);
    await expect(stat(fixture.partial)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
    await fixture.close();
  }
});

it.each([['prefix', 3], ['tail', 3], ['aligned', 3], ['short', 3], ['prefix', 30], ['tail', 30],
  ['prefix', 300], ['tail', 300]])('recovers %s after process death with %s MiB of original bytes', async (mode, mebibytes) => {
  const fixture = await createLargeCrashFixture(Number(mebibytes));
  const worker = (action: string) => fork(path.resolve('electron/sync/desktopAttachmentCrash.fixture.ts'),
    [fixture.root, fixture.resource.storageKey, action, String(fixture.resource.byteLength), fixture.sourcePath], {
      execPath: process.execPath,
      execArgv: ['--experimental-strip-types', '--experimental-loader', './scripts/android/ts-js-extension-loader.mjs'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    });
  const crashed = worker(String(mode));
  let resumed: ReturnType<typeof worker> | undefined;
  try {
    expect((await once(crashed, 'message', { signal: AbortSignal.timeout(10000) }))[0]).toBe('partial-written');
    const exited = once(crashed, 'exit'); crashed.kill('SIGKILL'); await exited;
    const partialBytes = mode === 'short' ? BLOCK : mode === 'aligned' ? 3 * BLOCK : 2 * BLOCK + (mode === 'tail' ? 31 : 0);
    expect((await stat(fixture.partial)).size).toBe(partialBytes);
    await expect(stat(fixture.final)).rejects.toMatchObject({ code: 'ENOENT' });
    resumed = worker('resume');
    const finished = once(resumed, 'exit');
    const profile = z.object({ initialOffset: z.number(), offsets: z.array(z.number()),
      startingRss: z.number(), peakRss: z.number(), finalRss: z.number() })
      .parse((await once(resumed, 'message', { signal: AbortSignal.timeout(80000) }))[0]);
    expect(await finished).toEqual([0, null]);
    const expectedOffset = mode === 'short' ? 0 : mode === 'aligned' ? 2 * BLOCK : BLOCK;
    expect(profile.initialOffset).toBe(expectedOffset);
    expect(profile.offsets).toEqual(Array.from({ length: Math.ceil((fixture.resource.byteLength - expectedOffset) / BLOCK) },
      (_, index) => expectedOffset + index * BLOCK));
    expect((await stat(fixture.final)).size).toBe(fixture.resource.byteLength);
    expect(await hashResourceFile(fixture.final)).toBe(fixture.hash);
    expect(fixture.available()).toBe(1);
    await expect(stat(fixture.partial)).rejects.toMatchObject({ code: 'ENOENT' });
    const evidence = path.resolve('.tmp/artifacts/t343-4/attachment-crash');
    await mkdir(evidence, { recursive: true });
    await writeFile(path.join(evidence, `${mode}-${mebibytes}m.json`), JSON.stringify({
      mode, bytes: fixture.resource.byteLength, hash: fixture.hash, ...profile
    }, null, 2));
  } finally {
    for (const child of [crashed, resumed]) {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      }
    }
    await fixture.close();
  }
}, 90_000);

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
