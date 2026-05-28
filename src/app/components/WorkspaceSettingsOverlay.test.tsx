import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

const workspaceSettingsOverlayMocks = vi.hoisted(() => ({
  useImportSourceWorkspaceState: vi.fn(() => ({
    cancelReadwiseReaderImport: () => undefined,
    handleChangeAction: () => undefined,
    handleChangeSource: () => undefined,
    handleChangeTitleStrategy: () => undefined,
    handleChooseFolder: async () => null,
    handleConfirmKeepImport: () => undefined,
    handleCopySource: () => undefined,
    handleDeleteSource: () => undefined,
    handleDisableKeepImport: () => undefined,
    handlePreviewKeepImport: async () => null,
    handleSaveReadwiseReaderSetup: () => undefined,
    previewReadwiseImportCleanup: async () => null,
    previewReadwiseReaderImport: async () => null,
    readwiseReaderConfig: null,
    readwiseRootPath: '',
    readwiseSources: [],
    runReadwiseImportCleanup: async () => null,
    runReadwiseReaderImport: async () => null,
    sources: [],
    titleStrategy: 'file_name'
  }))
}));

function createPreviewSummary() {
  return {
    blockedCount: 0,
    discoveredCount: 1,
    failedCount: 0,
    newCount: 1,
    previewedAt: '2026-05-28T00:00:00.000Z',
    samples: [{
      contentPreview: 'Preview body',
      detail: 'Ready',
      detectedHighlightCount: 3,
      highlightSamples: [
        {
          excerpt: 'Before first highlight after',
          highlightText: 'first highlight',
          matched: true,
          sourceName: 'entry.md'
        },
        {
          excerpt: 'Before second highlight after',
          highlightText: 'second highlight',
          matched: true,
          sourceName: 'entry.md'
        },
        {
          excerpt: 'Before third highlight after',
          highlightText: 'third highlight',
          matched: true,
          sourceName: 'entry.md'
        }
      ],
      sourcePath: 'entry.md',
      status: 'new'
    }],
    unchangedCount: 0,
    updatedCount: 0
  };
}

function createOpenOverlayImportSettings(handlePreviewKeepImport: ReturnType<typeof vi.fn>) {
  return {
    cancelReadwiseReaderImport: () => undefined,
    handleChangeAction: () => undefined,
    handleChangeSource: () => undefined,
    handleChangeTitleStrategy: () => undefined,
    handleChooseFolder: async () => null,
    handleConfirmKeepImport: () => undefined,
    handleCopySource: () => undefined,
    handleDeleteSource: () => undefined,
    handleDisableKeepImport: () => undefined,
    handlePreviewKeepImport,
    handleSaveReadwiseReaderSetup: () => undefined,
    previewReadwiseImportCleanup: async () => null,
    previewReadwiseReaderImport: async () => null,
    readwiseReaderConfig: null,
    readwiseRootPath: '',
    readwiseSources: [],
    runReadwiseImportCleanup: async () => null,
    runReadwiseReaderImport: async () => null,
    sources: [{
      actionMode: 'keep',
      archivePath: '',
      highlightMode: 'merged',
      highlightPath: '',
      id: 'source-1',
      keepPreview: null,
      keepState: 'draft',
      primaryPath: '/demo/merged'
    }],
    titleStrategy: 'file_name'
  };
}

vi.mock('./useImportSourceWorkspaceState', () => ({
  useImportSourceWorkspaceState: workspaceSettingsOverlayMocks.useImportSourceWorkspaceState
}));

vi.mock('../../features/settings/components/SettingsPanel', () => ({
  SettingsPanel: (props: { importCategoryContent?: ReactNode }) => (
    <div data-testid="settings-panel">{props.importCategoryContent}</div>
  )
}));

import { WorkspaceSettingsOverlay } from './WorkspaceSettingsOverlay';

it('skips import settings state while the settings overlay is closed', () => {
  render(
    <WorkspaceSettingsOverlay
      isSettingsOpen={false}
      onClose={() => undefined}
      requestedCategory={null}
    />
  );

  expect(workspaceSettingsOverlayMocks.useImportSourceWorkspaceState).not.toHaveBeenCalled();
  expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
});

it('opens the keep import preview dialog from the watch folders table', async () => {
  const handlePreviewKeepImport = vi.fn(async () => createPreviewSummary());
  workspaceSettingsOverlayMocks.useImportSourceWorkspaceState.mockReturnValue(
    createOpenOverlayImportSettings(handlePreviewKeepImport) as never
  );

  render(
    <WorkspaceSettingsOverlay
      isSettingsOpen
      onClose={() => undefined}
      requestedCategory={null}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'Preview source-1' }));

  await waitFor(() => expect(handlePreviewKeepImport).toHaveBeenCalledWith('source-1', 'sources'));
  expect(await screen.findByRole('dialog', { name: 'Import preview' })).toBeInTheDocument();
  expect(screen.queryByText('/demo/merged')).not.toBeInTheDocument();
  expect(screen.queryByText('Result preview')).not.toBeInTheDocument();
  expect(screen.getByText('Checked 1 full document file; 3 matched highlights.')).toBeInTheDocument();
  expect(screen.getByText('One sample highlight is shown below. Adjust the watch folder settings and preview again if it does not look right.')).toBeInTheDocument();
  expect(screen.getByText('first highlight')).toBeInTheDocument();
  expect(screen.queryByText('second highlight')).not.toBeInTheDocument();
  expect(screen.queryByText('third highlight')).not.toBeInTheDocument();
});
