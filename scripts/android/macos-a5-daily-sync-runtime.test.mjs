import { expect, it, vi } from 'vitest';
import { assertMacosA5DailySyncRuntime } from './macos-a5-daily-sync-runtime.mjs';

function fixture(listener = '42\n', owner = '42\n') {
  return { readSnapshot: () => ({ running: true, ready: { appReady: { pid: 42 } } }),
    execute: vi.fn().mockResolvedValueOnce({ stdout: listener }).mockResolvedValueOnce({ stdout: owner }) };
}

it('accepts only the ready daily process owning both listener and library', async () => {
  await expect(assertMacosA5DailySyncRuntime('/repo', fixture())).resolves.toEqual({ pid: 42 });
});

it.each(['9\n', '42\n9\n', ''])('rejects another or ambiguous listener %j', async listener => {
  await expect(assertMacosA5DailySyncRuntime('/repo', fixture(listener))).rejects.toThrow('daily_sync_listener_mismatch');
});

it('rejects a daily runtime that does not own the daily library', async () => {
  await expect(assertMacosA5DailySyncRuntime('/repo', fixture('42\n', '9\n')))
    .rejects.toThrow('daily_sync_library_mismatch');
});

it('rejects missing readiness without querying sockets', async () => {
  const execute = vi.fn();
  await expect(assertMacosA5DailySyncRuntime('/repo', { readSnapshot: () => ({ running: false }), execute }))
    .rejects.toThrow('daily_sync_runtime_not_ready');
  expect(execute).not.toHaveBeenCalled();
});
