import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../../shared/localization/LocalizationProvider';

import { ReviewOptimizationRow } from './ReviewOptimizationRow';

const runtime = vi.hoisted(() => ({ available: false, plan: vi.fn() }));
vi.mock('../../../../shared/platform/runtimeInvoke', () => ({
  isRuntimeInvokeAvailable: () => runtime.available
}));
vi.mock('../../../../shared/platform/desktop/reviewTrainingRuntimeRepository', () => ({
  loadReviewTrainingPlan: runtime.plan
}));
vi.mock('../../../../store/workspaceStore', () => ({
  useWorkspaceStore: (select: (state: unknown) => unknown) => select({
    nodesById: { english: { title: 'English reading' } }
  })
}));

const description = 'Automatically train and evaluate FSRS parameters from review history to optimize review scheduling. Train per folder (including subfolders), triggered whenever enough review records accumulate.';
const show = () => render(<LocalizationProvider initialLanguagePreference="en"><ReviewOptimizationRow /></LocalizationProvider>);

beforeEach(() => {
  runtime.available = false;
  runtime.plan.mockReset().mockResolvedValue({ folders: [], libraryScope: 'test', lastTrainedAt: null, lastTrainedFolderId: null });
});

it('explains automatic optimization without interactive controls in the browser', () => {
  show();
  expect(screen.getByRole('heading', { name: 'Automatic review optimization' })).toBeInTheDocument();
  expect(screen.getByText(description)).toBeInTheDocument();
  expect(screen.getByText('No training history yet')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(runtime.plan).not.toHaveBeenCalled();
});

it.each([['english', 'English reading'], [null, 'Entire library'], ['missing', 'Unavailable folder']])(
  'keeps the explanation beside the latest recorded training for %s', async (folderId, label) => {
    runtime.available = true;
    const time = '2026-10-27T06:30:00.000Z';
    runtime.plan.mockResolvedValue({ folders: [], libraryScope: 'test', lastTrainedAt: time, lastTrainedFolderId: folderId });
    show();
    await waitFor(() => expect(screen.getByText(`Recent training: ${label} · ${new Date(time).toLocaleString()}`)).toBeInTheDocument());
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  }
);

it('does not report empty history when the history could not be loaded', async () => {
  runtime.available = true;
  runtime.plan.mockRejectedValue(new Error('unavailable'));
  show();
  await waitFor(() => expect(screen.getByText('Training history could not be loaded.')).toBeInTheDocument());
  expect(screen.getByText(description)).toBeInTheDocument();
});
