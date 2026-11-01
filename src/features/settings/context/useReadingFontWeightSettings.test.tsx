import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';

import { useReadingFontWeightSettings } from './useReadingFontWeightSettings';

const invoke = vi.fn();
beforeEach(() => {
  window.localStorage.clear();
  invoke.mockReset().mockResolvedValue(null);
  window.electronAPI = { invoke: invoke as NativeInvoke } as NonNullable<typeof window.electronAPI>;
});

it('keeps rapid adjustments ordered through the runtime snapshot and hydrates the last value', async () => {
  const first = renderHook(useReadingFontWeightSettings);
  expect(first.result.current.value).toBe(400);
  await act(async () => {
    void first.result.current.update(400);
    void first.result.current.update(450);
    await first.result.current.update(500);
  });
  expect(invoke.mock.calls.map(([, args]) => args.settings[APP_SETTINGS_STORAGE_KEYS.readingFontWeight]))
    .toEqual(['400', '450', '500']);
  expect(first.result.current).toMatchObject({ value: 500, saveError: false, saving: false });
  first.unmount();
  const reopened = renderHook(useReadingFontWeightSettings);
  expect(reopened.result.current.value).toBe(500);
});

it('reports a failed save and retries the same visible value', async () => {
  invoke.mockRejectedValueOnce(new Error('disk write failed'));
  const { result } = renderHook(useReadingFontWeightSettings);
  await act(() => result.current.update(450));
  expect(result.current).toMatchObject({ value: 450, saveError: true });
  await act(() => result.current.update(450));
  await waitFor(() => expect(result.current.saveError).toBe(false));
  expect(invoke).toHaveBeenCalledTimes(2);
});

it('restores defaults for invalid values and bounds user input', async () => {
  window.localStorage.setItem(APP_SETTINGS_STORAGE_KEYS.readingFontWeight, 'invalid');
  const { result } = renderHook(useReadingFontWeightSettings);
  expect(result.current.value).toBe(400);
  await act(() => result.current.update(900));
  expect(result.current.value).toBe(550);
  await act(() => result.current.update(450.2));
  expect(result.current.value).toBe(450);
});
