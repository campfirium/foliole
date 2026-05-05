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
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
});

function createProps() {
  return {
    accentColorPreset: '#3f8f68' as const,
    baseColorMode: 'light' as const,
    customInterfaceFont: '',
    customMonospaceFont: '',
    customUiFont: '',
    desiredRetention: 0.9,
    hotkeyItems: [],
    interfaceFontPreset: 'default' as const,
    interfaceFontSize: 17,
    markdownSyntaxVisibility: 'visible' as const,
    monospaceFontPreset: 'default' as const,
    onAccentColorPresetChange: () => undefined,
    onAccentColorPresetReset: () => undefined,
    onBaseColorModeChange: () => undefined,
    onClose: () => undefined,
    onCustomInterfaceFontChange: () => undefined,
    onCustomMonospaceFontChange: () => undefined,
    onCustomUiFontChange: () => undefined,
    onDesiredRetentionChange: () => undefined,
    onHotkeyReset: () => undefined,
    onHotkeyResetAll: () => undefined,
    onHotkeyUpdate: () => ({ status: 'blocked' as const }),
    onInterfaceFontPresetChange: () => undefined,
    onInterfaceFontSizeChange: () => undefined,
    onInterfaceFontSizeReset: () => undefined,
    onMarkdownSyntaxVisibilityChange: () => undefined,
    onMonospaceFontPresetChange: () => undefined,
    onUiFontPresetChange: () => undefined,
    uiFontPreset: 'default' as const
  };
}

it('keeps font selects disabled until system fonts are loaded', async () => {
  const deferred = createDeferred<{ fonts: string[]; monospaceFonts: string[] }>();
  mockedListAvailableSystemFonts.mockReturnValue(deferred.promise);

  render(<SettingsPanel {...createProps()} />);

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

it('updates desired retention from review settings slider', async () => {
  const onDesiredRetentionChange = vi.fn();

  render(
    <SettingsPanel
      {...createProps()}
      onDesiredRetentionChange={onDesiredRetentionChange}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.change(screen.getByLabelText('Desired retention'), {
    target: { value: '0.8' }
  });

  await waitFor(() => {
    expect(onDesiredRetentionChange).toHaveBeenCalledWith(0.8);
    expect(screen.getByText('0.90')).toBeInTheDocument();
  });
});
