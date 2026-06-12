// @vitest-environment node

import { expect, it } from 'vitest';

import { NATIVE_COMMANDS } from '../../lib/platform/nativeCommands.js';
import type { NativeInvoke } from '../../lib/platform/nativeContract.js';
import type { NativeSyncObjectRecord } from '../../lib/platform/nativeSyncContract.js';
import { createNativeSyncRuntimePort } from '../../lib/platform/nativeSyncRuntimePort.js';

interface SyncObjectInvokeArgs {
  objectIds?: string[];
  objects?: NativeSyncObjectRecord[];
  objectTypes?: string[];
}

function createSyncObject(index: number): NativeSyncObjectRecord {
  return {
    content_hash: `hash-${index}`,
    deleted_at: null,
    object_id: `setting-${index}`,
    object_type: 'setting',
    payload_json: JSON.stringify({ index }),
    updated_at: '2026-06-10T00:00:00.000Z'
  };
}

it('loads generic sync objects through bounded IPC chunks', async () => {
  const calls: Array<{ args: SyncObjectInvokeArgs; command: string }> = [];
  const invoke = (async (command: string, args: SyncObjectInvokeArgs = {}) => {
    calls.push({ args, command });
    expect(command).toBe(NATIVE_COMMANDS.loadSyncObjects);
    const objectIds = args.objectIds ?? [];
    return objectIds.map((_, index) => createSyncObject(index));
  }) as NativeInvoke;
  const port = createNativeSyncRuntimePort(invoke);
  const objectIds = Array.from({ length: 257 }, (_, index) => `setting-${index}`);

  await expect(port.loadSyncObjects(objectIds, ['setting'])).resolves.toHaveLength(257);

  expect(calls).toHaveLength(3);
  expect(calls.map(({ args }) => args.objectIds?.length)).toEqual([128, 128, 1]);
  expect(calls[0]?.args).toMatchObject({ objectTypes: ['setting'] });
});

it('applies generic sync objects through bounded IPC chunks', async () => {
  const calls: Array<{ args: SyncObjectInvokeArgs; command: string }> = [];
  const invoke = (async (command: string, args: SyncObjectInvokeArgs = {}) => {
    calls.push({ args, command });
    expect(command).toBe(NATIVE_COMMANDS.applySyncObjects);
    return args.objects?.map((object) => `${object.object_type}:${object.object_id}`) ?? [];
  }) as NativeInvoke;
  const port = createNativeSyncRuntimePort(invoke);
  const objects = Array.from({ length: 260 }, (_, index) => createSyncObject(index));

  await expect(port.applySyncObjects(objects)).resolves.toHaveLength(260);

  expect(calls).toHaveLength(3);
  expect(calls.map(({ args }) => args.objects?.length)).toEqual([128, 128, 4]);
});
