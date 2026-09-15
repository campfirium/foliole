import { afterEach, expect, it, vi } from 'vitest';

import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  freezeWorkspaceRuntimeWrites,
  resetWorkspaceRuntimeWriteGateForTests,
  runWithWorkspaceRuntimeWriteGate,
  unfreezeWorkspaceRuntimeWrites,
  waitForWorkspaceRuntimeWrites
} from './runtimeInvoke';

afterEach(resetWorkspaceRuntimeWriteGateForTests);

it('waits for writes accepted before the restore freeze', async () => {
  let resolveWrite: (() => void) | undefined;
  const write = runWithWorkspaceRuntimeWriteGate(NATIVE_COMMANDS.updateNodeContent, () =>
    new Promise<void>((resolve) => { resolveWrite = resolve; })
  );
  freezeWorkspaceRuntimeWrites();
  let settled = false;
  const barrier = waitForWorkspaceRuntimeWrites().then(() => { settled = true; });

  await Promise.resolve();
  expect(settled).toBe(false);
  resolveWrite?.();
  await Promise.all([write, barrier]);
  expect(settled).toBe(true);
});

it('blocks new workspace writes while allowing the restore command', async () => {
  freezeWorkspaceRuntimeWrites();
  const invoke = vi.fn().mockResolvedValue('ok');

  await expect(runWithWorkspaceRuntimeWriteGate(NATIVE_COMMANDS.moveNodes, invoke)).rejects.toThrow('frozen');
  await expect(runWithWorkspaceRuntimeWriteGate(NATIVE_COMMANDS.restoreSqliteDatabase, invoke)).resolves.toBe('ok');
  expect(invoke).toHaveBeenCalledOnce();

  unfreezeWorkspaceRuntimeWrites();
  await expect(runWithWorkspaceRuntimeWriteGate(NATIVE_COMMANDS.moveNodes, invoke)).resolves.toBe('ok');
});
