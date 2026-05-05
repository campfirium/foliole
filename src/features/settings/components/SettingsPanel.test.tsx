import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { listAvailableSystemFonts } from '../model/systemFonts';

import { SettingsPanel } from './SettingsPanel';
import {
  changePushQueueValues,
  createDeferred,
  createProps,
  createSavedPushQueueProps,
  expectPushQueueChangeCallbacks,
  expectPushQueueValues,
  openReviewSettings
} from './SettingsPanel.testUtils';

function createPushQueueChangeHandlers() {
  return {
    onPriorityRatioChange: vi.fn(),
    onQueueMixRatioReadingChange: vi.fn(),
    onQueueMixRatioFsrsChange: vi.fn(),
    onReadingInitialIntervalDaysChange: vi.fn(),
    onReadingIntervalGrowthFactorMinChange: vi.fn(),
    onReadingIntervalGrowthFactorMaxChange: vi.fn()
  };
}

function renderSettingsPanelWithPushQueueHandlers(
  handlers: ReturnType<typeof createPushQueueChangeHandlers>
) {
  return render(<SettingsPanel {...createProps()} {...handlers} />);
}

function expectPushQueueSemanticCopy() {
  expect(screen.getByText('Dual queue mix ratio')).toBeInTheDocument();
  expect(screen.getByText('Priority strength (`priorityRatio`)')).toBeInTheDocument();
  expect(screen.getByText(/weight multiple of P1 relative to P9/i)).toBeInTheDocument();
  expect(screen.getByText(/default `1:5` means one reading card is mixed after five FSRS cards/i)).toBeInTheDocument();
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
  const handlers = createPushQueueChangeHandlers();
  const savedProps = createSavedPushQueueProps();

  const view = renderSettingsPanelWithPushQueueHandlers(handlers);

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
    expectPushQueueChangeCallbacks({
      ...handlers
    });
  });

  view.unmount();

  render(<SettingsPanel {...savedProps} />);

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
