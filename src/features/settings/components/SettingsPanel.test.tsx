import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));

import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';

const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
  mockedListAvailableSystemFonts.mockReset();
});

it('keeps font selects disabled until system fonts are loaded', async () => {
  const deferred = createDeferred<{ fonts: string[]; monospaceFonts: string[] }>();
  mockedListAvailableSystemFonts.mockReturnValue(deferred.promise);

  render(
    <SettingsPanel
      accentColorPreset="#3f8f68"
      baseColorMode="light"
      customInterfaceFont=""
      customMonospaceFont=""
      customUiFont=""
      hotkeyItems={[]}
      interfaceFontPreset="default"
      interfaceFontSize={17}
      markdownSyntaxVisibility="visible"
      monospaceFontPreset="default"
      onAccentColorPresetChange={() => undefined}
      onAccentColorPresetReset={() => undefined}
      onBaseColorModeChange={() => undefined}
      onClose={() => undefined}
      onCustomInterfaceFontChange={() => undefined}
      onCustomMonospaceFontChange={() => undefined}
      onCustomUiFontChange={() => undefined}
      onHotkeyReset={() => undefined}
      onHotkeyResetAll={() => undefined}
      onHotkeyUpdate={() => ({ status: 'blocked' })}
      onInterfaceFontPresetChange={() => undefined}
      onInterfaceFontSizeChange={() => undefined}
      onInterfaceFontSizeReset={() => undefined}
      onMarkdownSyntaxVisibilityChange={() => undefined}
      onMonospaceFontPresetChange={() => undefined}
      onUiFontPresetChange={() => undefined}
      uiFontPreset="default"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Appearance' }));

  const uiSelect = screen.getByLabelText('Interface font');
  const textSelect = screen.getByLabelText('Text font');
  const monoSelect = screen.getByLabelText('Monospace font preset');
  expect(uiSelect).toBeDisabled();
  expect(textSelect).toBeDisabled();
  expect(monoSelect).toBeDisabled();

  deferred.resolve({ fonts: ['XHei-Believe'], monospaceFonts: ['XHei-Believe-Mono'] });

  await waitFor(() => {
    expect(uiSelect).toBeEnabled();
    expect(textSelect).toBeEnabled();
    expect(monoSelect).toBeEnabled();
  });
});
