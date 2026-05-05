import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import {
  changePushQueueValues,
  createDeferred,
  createProps,
  expectPushQueueValues,
  openReviewSettings,
  renderWithMouseGestureProvider
} from './SettingsPanel.testUtils';

function PushQueueSettingsHarness() {
  const [isOpen, setIsOpen] = useState(true);
  const [props, setProps] = useState(createProps);

  return (
    <>
      <button onClick={() => setIsOpen(true)} type="button">
        Reopen settings
      </button>
      {isOpen ? (
        <SettingsPanel
          {...props}
          onClose={() => setIsOpen(false)}
          onDefaultPriorityChange={(value) =>
            setProps((current) => ({
              ...current,
              defaultPriority: value
            }))
          }
          onPriorityRatioChange={(value) =>
            setProps((current) => ({
              ...current,
              priorityRatio: value
            }))
          }
          onQueueMixRatioReadingChange={(value) =>
            setProps((current) => ({
              ...current,
              queueMixRatioReading: value
            }))
          }
          onQueueMixRatioFsrsChange={(value) =>
            setProps((current) => ({
              ...current,
              queueMixRatioFsrs: value
            }))
          }
          onReadingInitialIntervalDaysChange={(value) =>
            setProps((current) => ({
              ...current,
              readingInitialIntervalMs: value * 24 * 60 * 60 * 1000
            }))
          }
          onReadingIntervalGrowthFactorMinChange={(value) =>
            setProps((current) => ({
              ...current,
              readingIntervalGrowthFactorMin: value
            }))
          }
          onReadingIntervalGrowthFactorMaxChange={(value) =>
            setProps((current) => ({
              ...current,
              readingIntervalGrowthFactorMax: value
            }))
          }
        />
      ) : null}
    </>
  );
}

function expectPushQueueSemanticCopy() {
  expect(screen.getByRole('heading', { level: 4, name: 'Default node priority' })).toBeInTheDocument();
  expect(screen.getByText('Dual queue mix ratio')).toBeInTheDocument();
  expect(screen.getByText('Priority strength (`priorityRatio`)')).toBeInTheDocument();
  expect(screen.getByText(/global `defaultPriority` fallback/i)).toBeInTheDocument();
  expect(screen.getByText(/weight multiple of P1 relative to P9/i)).toBeInTheDocument();
  expect(screen.getByText(/weight ratio, not a percentage scale/i)).toBeInTheDocument();
  expect(screen.getByText(/default `1:5` means one reading draw is mixed after five FSRS draws/i)).toBeInTheDocument();
  expect(screen.getByText(/minimum maps to P1, the maximum maps to P9/i)).toBeInTheDocument();
}

vi.mock('../model/systemFonts', () => ({
  listAvailableSystemFonts: vi.fn()
}));
const mockedListAvailableSystemFonts = vi.mocked(listAvailableSystemFonts);

beforeEach(() => {
  window.localStorage.clear();
  window.electronAPI = undefined;
  mockedListAvailableSystemFonts.mockReset();
  mockedListAvailableSystemFonts.mockResolvedValue({ fonts: [], monospaceFonts: [] });
});

it('keeps font selects disabled until system fonts are loaded', async () => {
  const deferred = createDeferred<{ fonts: string[]; monospaceFonts: string[] }>();
  mockedListAvailableSystemFonts.mockReturnValue(deferred.promise);

  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

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

  renderWithMouseGestureProvider(
    <SettingsPanel
      {...createProps()}
      onDesiredRetentionChange={onDesiredRetentionChange}
    />
  );

  openReviewSettings();
  fireEvent.change(screen.getByLabelText('Desired retention'), {
    target: { value: '0.8' }
  });

  await waitFor(() => {
    expect(onDesiredRetentionChange).toHaveBeenCalledWith(0.8);
    expect(screen.getByText('0.90')).toBeInTheDocument();
  });
});

it('updates remaining review scheduler controls from review settings section', async () => {
  const onMaximumIntervalDaysChange = vi.fn();
  const onEnableFuzzChange = vi.fn();
  const onEnableShortTermChange = vi.fn();

  renderWithMouseGestureProvider(
    <SettingsPanel
      {...createProps()}
      onMaximumIntervalDaysChange={onMaximumIntervalDaysChange}
      onEnableFuzzChange={onEnableFuzzChange}
      onEnableShortTermChange={onEnableShortTermChange}
    />
  );

  openReviewSettings();
  fireEvent.change(screen.getByLabelText('Maximum interval days'), {
    target: { value: '365' }
  });
  fireEvent.change(screen.getByLabelText('Interval fuzz'), {
    target: { value: 'on' }
  });
  fireEvent.change(screen.getByLabelText('Short-term scheduling'), {
    target: { value: 'on' }
  });

  await waitFor(() => {
    expect(onMaximumIntervalDaysChange).toHaveBeenCalledWith(365);
    expect(onEnableFuzzChange).toHaveBeenCalledWith(true);
    expect(onEnableShortTermChange).toHaveBeenCalledWith(true);
  });
});

it('updates mouse gesture settings from the dedicated section and persists them', async () => {
  renderWithMouseGestureProvider(<SettingsPanel {...createProps()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Mouse gestures' }));
  fireEvent.change(screen.getByLabelText('Left then up mouse gesture action'), {
    target: { value: 'scroll-bottom' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail color hex'), {
    target: { value: '#ff5500' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail line width'), {
    target: { value: '4.5' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail opacity'), {
    target: { value: '0.6' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture direction threshold'), {
    target: { value: '24' }
  });
  fireEvent.change(screen.getByLabelText('Mouse gesture trail point threshold'), {
    target: { value: '10' }
  });

  await waitFor(() => {
    expect(window.localStorage.getItem('foliole-mouse-gesture-left-up-action')).toBe('scroll-bottom');
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-color')).toBe('#ff5500');
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-line-width')).toBe('4.5');
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-opacity')).toBe('0.6');
    expect(window.localStorage.getItem('foliole-mouse-gesture-segment-threshold')).toBe('24');
    expect(window.localStorage.getItem('foliole-mouse-gesture-trail-point-threshold')).toBe('10');
  });
});

it('keeps push queue defaults, saved values, and reopened review fields in sync', async () => {
  renderWithMouseGestureProvider(<PushQueueSettingsHarness />);

  openReviewSettings();
  expectPushQueueSemanticCopy();
  expectPushQueueValues({
    reading: 1,
    fsrs: 5,
    defaultPriority: 5,
    priorityRatio: 5,
    readingInitialIntervalDays: 1,
    readingGrowthMin: 1.1,
    readingGrowthMax: 1.5
  });
  changePushQueueValues({
    reading: '2',
    fsrs: '4',
    defaultPriority: '4',
    priorityRatio: '7',
    readingInitialIntervalDays: '2',
    readingGrowthMin: '1.12',
    readingGrowthMax: '1.44'
  });

  await waitFor(() => {
    expectPushQueueValues({
      reading: 2,
      fsrs: 4,
      defaultPriority: 4,
      priorityRatio: 7,
      readingInitialIntervalDays: 2,
      readingGrowthMin: 1.12,
      readingGrowthMax: 1.44
    });
  });

  fireEvent.click(screen.getByLabelText('Settings'));

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Settings dialog' })).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Reopen settings' }));

  openReviewSettings();

  await waitFor(() => {
    expectPushQueueValues({
      reading: 2,
      fsrs: 4,
      defaultPriority: 4,
      priorityRatio: 7,
      readingInitialIntervalDays: 2,
      readingGrowthMin: 1.12,
      readingGrowthMax: 1.44
    });
  });
});
