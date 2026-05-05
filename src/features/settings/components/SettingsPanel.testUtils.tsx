import { fireEvent, render, screen, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import { MouseGestureSettingsProvider } from '../context/MouseGestureSettingsProvider';

const DEFAULT_SETTINGS_PANEL_PROPS = {
  accentColorPreset: '#3f8f68' as const,
  baseColorMode: 'light' as const,
  customInterfaceFont: '',
  customMonospaceFont: '',
  customUiFont: '',
  desiredRetention: 0.9,
  maximumIntervalDays: 36500,
  enableFuzz: false,
  enableShortTerm: false,
  defaultPriority: 5,
  priorityRatio: 5,
  queueMixRatioReading: 1,
  queueMixRatioFsrs: 5,
  readingInitialIntervalMs: 24 * 60 * 60 * 1000,
  readingIntervalGrowthFactorMin: 1.1,
  readingIntervalGrowthFactorMax: 1.5,
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
  onDefaultPriorityChange: () => undefined,
  onMaximumIntervalDaysChange: () => undefined,
  onEnableFuzzChange: () => undefined,
  onEnableShortTermChange: () => undefined,
  onPriorityRatioChange: () => undefined,
  onQueueMixRatioReadingChange: () => undefined,
  onQueueMixRatioFsrsChange: () => undefined,
  onReadingInitialIntervalDaysChange: () => undefined,
  onReadingIntervalGrowthFactorMinChange: () => undefined,
  onReadingIntervalGrowthFactorMaxChange: () => undefined,
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

export function renderWithMouseGestureProvider(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: ({ children }) => <MouseGestureSettingsProvider>{children}</MouseGestureSettingsProvider>,
    ...options
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
  expect(screen.getByLabelText('FSRS queue mix ratio')).toHaveValue(values.fsrs);
  expect(screen.getByLabelText('Default node priority')).toHaveValue(String(values.defaultPriority));
  expect(screen.getByLabelText('Priority strength (P1 relative to P9)')).toHaveValue(values.priorityRatio);
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
  fireEvent.change(screen.getByLabelText('FSRS queue mix ratio'), { target: { value: values.fsrs } });
  fireEvent.change(screen.getByLabelText('Default node priority'), { target: { value: values.defaultPriority } });
  fireEvent.change(screen.getByLabelText('Priority strength (P1 relative to P9)'), { target: { value: values.priorityRatio } });
  fireEvent.change(screen.getByLabelText('Reading initial interval days'), { target: { value: values.readingInitialIntervalDays } });
  fireEvent.change(screen.getByLabelText('Reading growth factor min'), { target: { value: values.readingGrowthMin } });
  fireEvent.change(screen.getByLabelText('Reading growth factor max'), { target: { value: values.readingGrowthMax } });
}

export function createSavedPushQueueProps() {
  return {
    ...createProps(),
    defaultPriority: 4,
    priorityRatio: 7,
    queueMixRatioReading: 2,
    queueMixRatioFsrs: 4,
    readingInitialIntervalMs: 2 * 24 * 60 * 60 * 1000,
    readingIntervalGrowthFactorMin: 1.12,
    readingIntervalGrowthFactorMax: 1.44
  };
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
