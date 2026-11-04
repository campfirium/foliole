import { webcrypto } from 'node:crypto';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createCadenceFixture, nextCompletedWrite } from '../shared/platform/companion/folderSync/folderSyncCadence.testSupport';
import type { createFolderSyncService } from '../shared/platform/companion/folderSync/folderSyncService';
import { publishCompanionHighValueMutation } from '../shared/platform/companion/sync/mutation/companionSyncMutationRevision';

const native = vi.hoisted(() => ({ active: true, ready: false, foreground: () => {}, background: () => {},
  service: null as unknown as ReturnType<typeof createFolderSyncService> }));
vi.mock('../shared/platform/appLifecycle', () => ({
  readNativeAppActiveState: async () => native.active,
  subscribeNativeAppForeground: async (callback: () => void) => { native.foreground = callback; return () => { native.foreground = () => {}; }; },
  subscribeNativeAppEnteredBackground: async (callback: () => void) => { native.background = callback; return () => { native.background = () => {}; }; }
}));
vi.mock('../shared/platform/companion/folderSync/companionFolderSync', () => ({
  supportsCompanionFolderSync: () => true,
  readCompanionFolderSyncState: () => native.service.read(),
  companionFolderSync: new Proxy({}, { get: (_target, key) => (...args: unknown[]) =>
    (native.service[key as keyof typeof native.service] as (...values: unknown[]) => unknown)(...args) })
}));

import { useCompanionFolderBackup } from './useCompanionFolderBackup';

const cleanups: (() => void | Promise<void>)[] = [];
// Match the one typed-array realm of a real WebView when Node SQLite/files are exercised under jsdom.
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
});
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); vi.unstubAllGlobals(); });

it('connects real committed mutation events and native foreground callbacks to persisted folder writes after readiness', async () => {
  const f = await createCadenceFixture(true);
  f.cadence.stop();
  native.service = f.service;
  let failure: unknown;
  const write = f.service.write;
  f.service.write = () => { const run = write(); void run.catch(error => { failure = error; }); return run; };
  native.active = true;
  cleanups.push(f.close);
  const hook = renderHook(({ ready }) => useCompanionFolderBackup(ready, 'library'), { initialProps: { ready: false } });
  cleanups.push(hook.unmount);
  expect((await f.service.read()).location!.completion).toBeNull();
  const first = nextCompletedWrite(f);
  await act(async () => { hook.rerender({ ready: true }); });
  await act(async () => { await first; });
  expect(failure).toBeUndefined();
  expect((await f.service.read()).location!.completion!.generation).toBe(1);
  const next = nextCompletedWrite(f);
  await act(async () => { await f.edit('v2'); publishCompanionHighValueMutation({ kind: 'full' }); await next; });
  expect((await f.service.read()).location!.completion!.generation).toBe(2);
  await act(async () => {
    native.active = false;
    native.background();
    await f.edit('v3');
    publishCompanionHighValueMutation({ kind: 'full' });
  });
  expect((await f.service.read()).location!.completion!.generation).toBe(2);
  const resumed = nextCompletedWrite(f);
  await act(async () => { native.active = true; native.foreground(); await resumed; });
  expect((await f.service.read()).location!.completion!.generation).toBe(3);
});
