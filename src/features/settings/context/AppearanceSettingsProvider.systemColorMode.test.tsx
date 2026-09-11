import { act, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { setRuntimeSystemColorMode } from '../../../shared/platform/runtime/systemColorMode';

import { AppearanceSettingsProvider, useAppearanceSettings } from './AppearanceSettingsProvider';

function SystemColorHarness() {
  return <div>{useAppearanceSettings().resolvedBaseColorMode}</div>;
}

beforeEach(() => {
  window.localStorage.clear();
  delete window.electronAPI;
  setRuntimeSystemColorMode(null);
});

it('updates follow-system mode from the desktop system appearance event', () => {
  let systemColorHandler: ((mode: 'dark' | 'light') => void) | undefined;
  window.electronAPI = {
    invoke: vi.fn(),
    onManagedInboxUpdated: () => () => undefined,
    onNativeMenuCommand: () => () => undefined,
    onSystemColorModeChanged: (handler) => {
      systemColorHandler = handler;
      return () => undefined;
    },
    onWindowResized: () => () => undefined
  };
  setRuntimeSystemColorMode('light');

  render(
    <AppearanceSettingsProvider>
      <SystemColorHarness />
    </AppearanceSettingsProvider>
  );

  expect(screen.getByText('light')).toBeInTheDocument();
  act(() => systemColorHandler?.('dark'));
  expect(screen.getByText('dark')).toBeInTheDocument();
  expect(document.documentElement.dataset.baseColor).toBe('system');
  expect(document.documentElement.dataset.resolvedBaseColor).toBe('dark');
});
