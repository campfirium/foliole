import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';
import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import { probeReadingFontWeights } from '../../../shared/typography/readingFontWeightProbe';

import { SettingsPanel } from './SettingsPanel';
import { createProps, renderWithMouseGestureProvider } from './SettingsPanel.testUtils';

vi.mock('../model/systemFonts', () => ({ listAvailableSystemFonts: vi.fn(async () => ({ fonts: [], monospaceFonts: [] })) }));
vi.mock('../../../shared/typography/readingFontWeightProbe', async (original) => ({
  ...await original<typeof import('../../../shared/typography/readingFontWeightProbe')>(),
  probeReadingFontWeights: vi.fn()
}));
const probe = vi.mocked(probeReadingFontWeights);
beforeEach(() => {
  window.localStorage.clear();
  probe.mockReset().mockImplementation(async (family) => family.includes('Noto')
    ? Array.from({ length: 13 }, (_, index) => 100 + index * 50) : [400, 700]);
  window.electronAPI = { invoke: vi.fn(async () => null) as NativeInvoke } as NonNullable<typeof window.electronAPI>;
});

function openTypography() {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} requestedCategory="typography" />);
  return screen.getByRole('slider', { name: /Font weight/ });
}

it('enables the system font at centered regular weight and jumps between effective weights without probing on drag', async () => {
  const slider = openTypography();
  await waitFor(() => expect(slider).toBeEnabled());
  expect(slider).toHaveValue('400');
  expect((400 - Number(slider.getAttribute('min'))) / (Number(slider.getAttribute('max')) - Number(slider.getAttribute('min')))).toBe(0.5);
  expect(screen.queryByRole('spinbutton', { name: 'Font weight' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^450$/ })).toBeNull();
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  await waitFor(() => expect(slider).toHaveValue('700'));
  expect(document.documentElement.style.getPropertyValue('--content-panel-font-weight')).toBe('700');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  await waitFor(() => expect(slider).toHaveValue('400'));
  fireEvent.change(slider, { target: { value: '100' } });
  expect(slider).toHaveValue('400');
  expect(probe).toHaveBeenCalledTimes(1);
});

it('resets to regular on font selection, then enables fine steps and saves the visible weight', async () => {
  const slider = openTypography();
  await waitFor(() => expect(slider).toBeEnabled());
  fireEvent.keyDown(slider, { key: 'End' });
  await waitFor(() => expect(slider).toHaveValue('700'));
  fireEvent.click(screen.getByRole('combobox', { name: 'Text font' }));
  fireEvent.click(screen.getByRole('option', { name: 'Noto Sans SC' }));
  expect(slider).toHaveValue('400');
  await waitFor(() => expect(slider).toBeEnabled());
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  await waitFor(() => expect(slider).toHaveValue('450'));
  expect(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEYS.readingFontWeight)).toBe('450');
  expect(probe).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Reset font weight' }));
  await waitFor(() => expect(slider).toHaveValue('400'));
});

it('keeps single-face fonts at regular and retries a failed capability check', async () => {
  probe.mockRejectedValueOnce(new Error('font unavailable')).mockResolvedValueOnce([400]);
  const slider = openTypography();
  await screen.findByText('Could not check this font.');
  expect(slider).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText('Could not check this font.')).toBeNull());
  expect(slider).toHaveValue('400');
  expect(slider).toBeDisabled();
});

it('ignores the previous font detection when a new selection finishes first', async () => {
  let finishOld!: (weights: number[]) => void;
  probe.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
  const slider = openTypography();
  expect(slider).toBeDisabled();
  fireEvent.click(screen.getByRole('combobox', { name: 'Text font' }));
  fireEvent.click(screen.getByRole('option', { name: 'Noto Sans SC' }));
  await waitFor(() => expect(slider).toBeEnabled());
  finishOld([400]);
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  await waitFor(() => expect(slider).toHaveValue('450'));
});
