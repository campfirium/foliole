import { fireEvent, render, screen, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import type { CommandPaletteItem } from '../../../shared/commands/types';
import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { AppearanceSettingsProvider } from '../context/AppearanceSettingsProvider';
import { DisplayScaleProvider } from '../context/DisplayScaleProvider';
import { ExternalFoldersSettingsProvider } from '../context/ExternalFoldersSettingsProvider';
import type { HotkeySettingsContextValue } from '../context/hotkeySettingsContext';
import { HotkeySettingsProvider } from '../context/HotkeySettingsProvider';
import { MouseGestureSettingsProvider } from '../context/MouseGestureSettingsProvider';
import { ReviewSchedulerSettingsProvider } from '../context/ReviewSchedulerSettingsProvider';

const DEFAULT_SETTINGS_PANEL_PROPS = {
  onClose: () => undefined
};

const DEFAULT_HOTKEY_SETTINGS: HotkeySettingsContextValue = {
  hotkeyItems: [],
  onConfigureShortcut: () => undefined,
  onHotkeyReset: () => undefined,
  onHotkeyResetAll: () => undefined,
  onHotkeyUpdate: () => ({ status: 'blocked' as const }),
  onRequestedCommandConsumed: () => undefined,
  requestedCommandId: null
};

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

export function createProps() {
  return { ...DEFAULT_SETTINGS_PANEL_PROPS };
}

function createHotkeySettings(overrides?: Partial<typeof DEFAULT_HOTKEY_SETTINGS>) {
  return { ...DEFAULT_HOTKEY_SETTINGS, ...overrides };
}

export function renderWithMouseGestureProvider(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & {
    hotkeySettings?: Partial<typeof DEFAULT_HOTKEY_SETTINGS>;
    publicCommandItems?: CommandPaletteItem[];
  }
) {
  const hotkeySettings = createHotkeySettings(options?.hotkeySettings);
  const publicCommandItems = options?.publicCommandItems;
  const renderOptions = options ? { ...options } : {};
  delete renderOptions.hotkeySettings;
  delete renderOptions.publicCommandItems;
  return render(ui, {
    wrapper: ({ children }) => (
      <LocalizationProvider>
        <AppearanceSettingsProvider>
          <DisplayScaleProvider>
            <ExternalFoldersSettingsProvider>
              <MouseGestureSettingsProvider>
                <ReviewSchedulerSettingsProvider>
                  <HotkeySettingsProvider
                    {...hotkeySettings}
                    {...(publicCommandItems ? { publicCommandItems } : {})}
                  >
                    {children}
                  </HotkeySettingsProvider>
                </ReviewSchedulerSettingsProvider>
              </MouseGestureSettingsProvider>
            </ExternalFoldersSettingsProvider>
          </DisplayScaleProvider>
        </AppearanceSettingsProvider>
      </LocalizationProvider>
    ),
    ...renderOptions
  });
}

export function openReviewSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
}

export function expectPushQueueValues(values: {
  reading: number;
  fsrs: number;
  defaultPriority: number;
  priorityRatio: number;
  readingInitialIntervalDays: number;
  readingGrowthMin: number;
  readingGrowthMax: number;
}) {
  expect(screen.getByLabelText('Reading queue mix ratio')).toHaveValue(values.reading);
  expect(screen.getByLabelText('Review item queue mix ratio')).toHaveValue(values.fsrs);
  expect(screen.getByLabelText('Default topic priority')).toHaveValue(String(values.defaultPriority));
  expect(screen.getByLabelText('Priority weight')).toHaveValue(values.priorityRatio);
  expect(screen.getByLabelText('Reading initial interval days')).toHaveValue(values.readingInitialIntervalDays);
  expect(screen.getByLabelText('Reading growth factor min')).toHaveValue(values.readingGrowthMin);
  expect(screen.getByLabelText('Reading growth factor max')).toHaveValue(values.readingGrowthMax);
}

export function changePushQueueValues(values: {
  reading: string;
  fsrs: string;
  defaultPriority: string;
  priorityRatio: string;
  readingInitialIntervalDays: string;
  readingGrowthMin: string;
  readingGrowthMax: string;
}) {
  fireEvent.change(screen.getByLabelText('Reading queue mix ratio'), { target: { value: values.reading } });
  fireEvent.change(screen.getByLabelText('Review item queue mix ratio'), { target: { value: values.fsrs } });
  fireEvent.change(screen.getByLabelText('Default topic priority'), { target: { value: values.defaultPriority } });
  fireEvent.change(screen.getByLabelText('Priority weight'), { target: { value: values.priorityRatio } });
  fireEvent.change(screen.getByLabelText('Reading initial interval days'), { target: { value: values.readingInitialIntervalDays } });
  fireEvent.change(screen.getByLabelText('Reading growth factor min'), { target: { value: values.readingGrowthMin } });
  fireEvent.change(screen.getByLabelText('Reading growth factor max'), { target: { value: values.readingGrowthMax } });
}

export function createSavedPushQueueProps() {
  return createProps();
}

export function expectPushQueueChangeCallbacks(callbacks: {
  onQueueMixRatioReadingChange: ReturnType<typeof vi.fn>;
  onQueueMixRatioFsrsChange: ReturnType<typeof vi.fn>;
  onDefaultPriorityChange: ReturnType<typeof vi.fn>;
  onPriorityRatioChange: ReturnType<typeof vi.fn>;
  onReadingInitialIntervalDaysChange: ReturnType<typeof vi.fn>;
  onReadingIntervalGrowthFactorMinChange: ReturnType<typeof vi.fn>;
  onReadingIntervalGrowthFactorMaxChange: ReturnType<typeof vi.fn>;
}) {
  expect(callbacks.onQueueMixRatioReadingChange).toHaveBeenCalledWith(2);
  expect(callbacks.onQueueMixRatioFsrsChange).toHaveBeenCalledWith(4);
  expect(callbacks.onDefaultPriorityChange).toHaveBeenCalledWith(4);
  expect(callbacks.onPriorityRatioChange).toHaveBeenCalledWith(7);
  expect(callbacks.onReadingInitialIntervalDaysChange).toHaveBeenCalledWith(2);
  expect(callbacks.onReadingIntervalGrowthFactorMinChange).toHaveBeenCalledWith(1.12);
  expect(callbacks.onReadingIntervalGrowthFactorMaxChange).toHaveBeenCalledWith(1.44);
}
