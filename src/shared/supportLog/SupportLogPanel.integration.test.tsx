import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../localization/testLocalization';
import { logRuntimeEvent } from '../platform/runtimeLogging';
import { recordSupportEvent, serializeSupportLog, stopSupportLog } from '../platform/supportLog/supportLog';

import { SupportLogPanel } from './SupportLogPanel';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => stopSupportLog());
  localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('keeps recording after the settings page closes and exports only allowed fields after the timeout', () => {
  const initial = renderWithLocalization(<SupportLogPanel mobile />);
  const exportButton = () => screen.getByRole('button', { name: 'Export log' });
  expect(exportButton()).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
  expect(screen.getByRole('button', { name: 'Stop recording' })).toBeEnabled();
  expect(exportButton()).toBeDisabled();
  initial.unmount();

  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  logRuntimeEvent({
    event: 'private-event-name',
    level: 'warn',
    source: 'private-source',
    payload: { url: 'https://private.example', text: 'private article text' }
  });
  expect(warn).toHaveBeenCalled();
  recordSupportEvent('selection.apply.started');
  recordSupportEvent('selection.apply.finished');
  act(() => vi.advanceTimersByTime(300_000));

  renderWithLocalization(<SupportLogPanel mobile />);
  expect(screen.getByText('Recording ended.')).toBeVisible();
  expect(exportButton()).toBeEnabled();
  const text = serializeSupportLog('android');
  expect(text).not.toContain('private');
  expect(JSON.parse(text ?? '')).toMatchObject({
    elapsedMs: 300_000,
    events: [
      { event: 'runtime.warning' },
      { event: 'selection.apply.started' },
      { event: 'selection.apply.finished' }
    ]
  });
  expect(localStorage.getItem('foliole-support-log')).not.toContain('private');
});

it('starts a fresh recording, stops manually, and downloads a desktop log', async () => {
  renderWithLocalization(<SupportLogPanel />);
  fireEvent.click(screen.getByRole('button', { name: /^(Start recording|Record again)$/u }));
  recordSupportEvent('selection.toolbar.no_range');
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:example');
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('foliole-log.txt');
  });

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export log' })));

  expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
  expect(download).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(1000));
  expect(revokeUrl).toHaveBeenCalledWith('blob:example');
  expect(JSON.parse(serializeSupportLog('desktop') ?? '')).toMatchObject({
    platform: 'desktop', events: [{ event: 'selection.toolbar.no_range' }]
  });
});
