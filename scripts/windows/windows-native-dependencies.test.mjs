// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { ensureWindowsNativeDependencies } from './windows-native-dependencies.mjs';

function result(code, detail = '') {
  return { code, stderr: detail, stdout: '' };
}

it('keeps a valid Windows dependency tree unchanged', async () => {
  const capture = vi.fn(async () => result(0));
  const checked = vi.fn();
  await ensureWindowsNativeDependencies({ capture, checked, log: vi.fn(), repoRoot: 'D:\\C\\foliole' });
  expect(capture).toHaveBeenCalledOnce();
  expect(checked).not.toHaveBeenCalled();
});

it('repairs an invalid tree from the lockfile and verifies it again', async () => {
  const capture = vi.fn()
    .mockResolvedValueOnce(result(1, 'invalid dependency'))
    .mockResolvedValueOnce(result(0));
  const checked = vi.fn(async () => {});
  await ensureWindowsNativeDependencies({ capture, checked, log: vi.fn(), repoRoot: 'D:\\C\\foliole' });
  expect(checked.mock.calls[0][1]).toEqual(expect.arrayContaining(['ci', '--no-audit', '--no-fund']));
  expect(capture).toHaveBeenCalledTimes(2);
});

it('fails when the repaired dependency tree remains invalid', async () => {
  const capture = vi.fn(async () => result(1, 'still invalid'));
  await expect(ensureWindowsNativeDependencies({
    capture, checked: vi.fn(async () => {}), log: vi.fn(), repoRoot: 'D:\\C\\foliole'
  })).rejects.toThrow('still invalid');
});
