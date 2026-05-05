import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import {
  changePushQueueValues,
  createDeferred,
  createProps,
  expectPushQueueValues,
  openReviewSettings
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
  expect(screen.getByText('Dual queue mix ratio')).toBeInTheDocument();
  expect(screen.getByText('Priority strength (`priorityRatio`)')).toBeInTheDocument();
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

  render(
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

it('keeps push queue defaults, saved values, and reopened review fields in sync', async () => {
  render(<PushQueueSettingsHarness />);

  openReviewSettings();
  expectPushQueueSemanticCopy();
  expectPushQueueValues({
    reading: 1,
    fsrs: 5,
    priorityRatio: 5,
    readingInitialIntervalDays: 1,
    readingGrowthMin: 1.1,
    readingGrowthMax: 1.5
  });
  changePushQueueValues({
    reading: '2',
    fsrs: '4',
    priorityRatio: '7',
    readingInitialIntervalDays: '2',
    readingGrowthMin: '1.12',
    readingGrowthMax: '1.44'
  });

  await waitFor(() => {
    expectPushQueueValues({
      reading: 2,
      fsrs: 4,
      priorityRatio: 7,
      readingInitialIntervalDays: 2,
      readingGrowthMin: 1.12,
      readingGrowthMax: 1.44
    });
  });

  fireEvent.mouseDown(screen.getByLabelText('Settings'));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen settings' }));

  openReviewSettings();

  await waitFor(() => {
    expectPushQueueValues({
      reading: 2,
      fsrs: 4,
      priorityRatio: 7,
      readingInitialIntervalDays: 2,
      readingGrowthMin: 1.12,
      readingGrowthMax: 1.44
    });
  });
});
