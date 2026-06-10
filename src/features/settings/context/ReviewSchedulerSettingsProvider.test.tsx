import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../../../shared/platform/runtimeInvoke';

import {
  ReviewSchedulerSettingsProvider,
  useReviewSchedulerSettings
} from './ReviewSchedulerSettingsProvider';

vi.mock('../../../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

function ReviewSchedulerHarness() {
  const settings = useReviewSchedulerSettings();

  return (
    <>
      <div>{settings.reviewSchedulerSettings.desiredRetention.toFixed(2)}</div>
      <div>{settings.reviewSchedulerSettings.pushQueue.defaultPriority}</div>
      <div>{settings.reviewSchedulerSettings.newDayStartsAtHour}</div>
      <div>{settings.isReviewSchedulerSettingsReady ? 'ready' : 'pending'}</div>
      <button onClick={() => settings.onDesiredRetentionChange(0.82)} type="button">
        Change retention
      </button>
      <button onClick={() => settings.onNewDayStartsAtHourChange(6)} type="button">
        Change day start
      </button>
      <button onClick={() => settings.onDefaultPriorityChange(4)} type="button">
        Change priority
      </button>
    </>
  );
}

beforeEach(() => {
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('hydrates saved review scheduler settings and persists updates through the shared provider', async () => {
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      desiredRetention: 0.91,
      newDayStartsAtHour: 5,
      pushQueue: { defaultPriority: 6 }
    })
    .mockResolvedValueOnce({
      desiredRetention: 0.82,
      newDayStartsAtHour: 5,
      pushQueue: { defaultPriority: 6 }
    })
    .mockResolvedValueOnce({
      desiredRetention: 0.82,
      newDayStartsAtHour: 6,
      pushQueue: { defaultPriority: 4 }
    });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  render(
    <ReviewSchedulerSettingsProvider>
      <ReviewSchedulerHarness />
    </ReviewSchedulerSettingsProvider>
  );

  expect(screen.getByText('pending')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText('0.91')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Change retention' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change day start' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change priority' }));

  await waitFor(() => {
    expect(screen.getByText('0.82')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  expect(invoke).toHaveBeenLastCalledWith('save_review_scheduler_settings', {
    settings: expect.objectContaining({
      desiredRetention: 0.82,
      newDayStartsAtHour: 6,
      pushQueue: expect.objectContaining({
        defaultPriority: 4
      })
    })
  });
});

it('marks review scheduler settings ready after runtime unavailable fallback', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);

  render(
    <ReviewSchedulerSettingsProvider>
      <ReviewSchedulerHarness />
    </ReviewSchedulerSettingsProvider>
  );

  expect(screen.getByText('pending')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('ready')).toBeInTheDocument();
  });
});

it('marks review scheduler settings ready after load failure fallback', async () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn().mockRejectedValue(new Error('load failed')));

  render(
    <ReviewSchedulerSettingsProvider>
      <ReviewSchedulerHarness />
    </ReviewSchedulerSettingsProvider>
  );

  expect(screen.getByText('pending')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('ready')).toBeInTheDocument();
  });
});
