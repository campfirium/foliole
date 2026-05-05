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
      <button onClick={() => settings.onDesiredRetentionChange(0.82)} type="button">
        Change retention
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
      pushQueue: { defaultPriority: 6 }
    })
    .mockResolvedValueOnce({
      desiredRetention: 0.82,
      pushQueue: { defaultPriority: 6 }
    })
    .mockResolvedValueOnce({
      desiredRetention: 0.82,
      pushQueue: { defaultPriority: 4 }
    });
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  render(
    <ReviewSchedulerSettingsProvider>
      <ReviewSchedulerHarness />
    </ReviewSchedulerSettingsProvider>
  );

  await waitFor(() => {
    expect(screen.getByText('0.91')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('button', { name: 'Change retention' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change priority' }));

  await waitFor(() => {
    expect(screen.getByText('0.82')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  expect(invoke).toHaveBeenLastCalledWith('save_review_scheduler_settings', {
    settings: expect.objectContaining({
      desiredRetention: 0.82,
      pushQueue: expect.objectContaining({
        defaultPriority: 4
      })
    })
  });
});
