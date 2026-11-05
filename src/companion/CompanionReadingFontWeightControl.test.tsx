import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { CompanionReadingFontWeightControl } from './CompanionReadingFontWeightControl';
import { DEFAULT_READING_TYPOGRAPHY_SETTINGS } from './companionReadingTypographySettings';

const mocks = vi.hoisted(() => ({ activate: vi.fn(), probe: vi.fn() }));
vi.mock('./companionReadingFonts', async original => ({
  ...await original<typeof import('./companionReadingFonts')>(), activateReadingFont: mocks.activate
}));
vi.mock('@/shared/typography/readingFontWeightProbe', async original => ({
  ...await original<typeof import('@/shared/typography/readingFontWeightProbe')>(), probeReadingFontWeights: mocks.probe
}));
const settings = { ...DEFAULT_READING_TYPOGRAPHY_SETTINGS,
  fontFamily: 'custom:12345678-1234-1234-1234-123456789abc' as const, fontWeight: 450 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.probe.mockResolvedValue([400, 450, 500]);
});

it('waits for the stored font to load before checking its glyphs and retains the saved value', async () => {
  let finish!: (found: boolean) => void;
  mocks.activate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const onChange = vi.fn();
  render(<CompanionReadingFontWeightControl settings={settings} onChange={onChange} fontRevision={0} />);
  await waitFor(() => expect(mocks.activate).toHaveBeenCalledTimes(1));
  expect(mocks.probe).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Increase Font weight' })).toBeDisabled();
  await act(async () => finish(true));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Increase Font weight' })).toBeEnabled());
  expect(screen.getByLabelText('Font weight')).toHaveTextContent('450');
  expect(onChange).not.toHaveBeenCalled();
});

it('reports a load failure without probing a fallback font or changing the selection, then retries', async () => {
  mocks.activate.mockRejectedValueOnce(new Error('load failed')).mockResolvedValueOnce(true);
  const onChange = vi.fn();
  render(<CompanionReadingFontWeightControl settings={settings} onChange={onChange} fontRevision={0} />);
  await screen.findByRole('alert');
  expect(mocks.probe).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Font weight')).toHaveTextContent('450');
  expect(screen.getByRole('button', { name: 'Increase Font weight' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Increase Font weight' })).toBeEnabled());
  expect(mocks.probe).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();
});
