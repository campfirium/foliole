import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import type { NativeReadwiseImportRunResult } from '../../../lib/platform/nativeImportContract';

import { createReadwiseImportSources } from './importSourceWorkspaceModel';
import {
  createDeferredReadwiseImportRunResult,
  createEnabledReadwiseConfig,
  createReadwiseImportPreview,
  createReadwiseImportRunResult
} from './readwiseReaderSettingsTestSupport';
import { SettingsReadwiseReaderContent } from './SettingsReadwiseReaderContent';
import type { ReadwiseSetupPayload } from './useReadwiseSetupController';

const { inspectReadwiseReaderSetup, onReadwiseReaderImportProgress } = vi.hoisted(() => ({
  inspectReadwiseReaderSetup: vi.fn(),
  onReadwiseReaderImportProgress: vi.fn()
}));

vi.mock('./readwiseReaderSetupInspection', () => ({
  inspectReadwiseReaderSetup
}));

vi.mock('../../shared/platform/runtimeShellEvents', () => ({
  onReadwiseReaderImportProgress
}));

let readwiseProgressHandler: ((payload: {
  processedCount: number;
  status: 'running' | 'completed' | 'failed';
  totalCount: number;
}) => void) | null = null;

beforeEach(() => {
  inspectReadwiseReaderSetup.mockReset();
  onReadwiseReaderImportProgress.mockReset();
  readwiseProgressHandler = null;
  onReadwiseReaderImportProgress.mockImplementation(async (handler) => {
    readwiseProgressHandler = handler;
    return () => undefined;
  });
});

type RunSync = (input: ReadwiseSetupPayload) => Promise<NativeReadwiseImportRunResult | null>;

function renderManualSyncHarness(onRunSync: RunSync) {
  render(
    <SettingsReadwiseReaderContent
      config={createEnabledReadwiseConfig()}
      onPreviewSync={vi.fn().mockResolvedValue(createReadwiseImportPreview())}
      onRunSync={onRunSync}
      onSave={vi.fn()}
      readwiseRootPath="/Readwise"
      readwiseSources={createReadwiseImportSources('/Readwise')}
    />
  );
}

it('shows visible progress while manual Readwise sync is running', async () => {
  const runResult = createDeferredReadwiseImportRunResult();
  renderManualSyncHarness(() => runResult.promise);

  fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Syncing...' })).toBeDisabled();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Syncing Readwise sources...');
  expect(screen.getByRole('status')).not.toHaveTextContent('0/4');

  act(() => {
    readwiseProgressHandler?.({ processedCount: 2, status: 'running', totalCount: 4 });
  });
  expect(screen.getByRole('status')).toHaveTextContent('Syncing Readwise sources...');
  expect(screen.getByRole('status')).not.toHaveTextContent('2/4');

  runResult.resolve(createReadwiseImportRunResult());
  await waitFor(() => {
    expect(screen.getByText('Synced 1 Readwise source.')).toBeInTheDocument();
  });
});

it('shows failed Readwise source details after manual sync', async () => {
  const onRunSync: RunSync = async () => ({
    completed_at: '2026-05-11T00:01:00.000Z',
    entry_count: 1,
    failed_count: 1,
    failed_sources: [
      {
        reason: 'permission denied',
        source_kind: 'tweets',
        source_path: '/Readwise/Full Document Contents/Tweets'
      }
    ],
    imported_count: 1,
    source_count: 4,
    skipped_count: 0,
    status: 'failed'
  });
  renderManualSyncHarness(onRunSync);

  fireEvent.click(screen.getByRole('button', { name: 'Sync' }));

  await waitFor(() => {
    expect(screen.getByText('Sync finished with 1 failed source.')).toBeInTheDocument();
  });
  expect(
    screen.getByText('/Readwise/Full Document Contents/Tweets: permission denied')
  ).toBeInTheDocument();
});
