import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const workspaceSettingsOverlayMocks = vi.hoisted(() => ({
  isDemo: false,
  requestAppConfirmation: vi.fn(),
  useImportSourceWorkspaceState: vi.fn()
}));

function createDefaultOverlayImportSettings() {
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
  };
}

function createPreviewSummary() {
  return {
    blockedCount: 0,
    discoveredCount: 3,
    failedCount: 0,
    newCount: 1,
    previewedAt: '2026-05-28T00:00:00.000Z',
    samples: ['first', 'second', 'third'].map((name) => ({
      contentPreview: `${name} preview body`,
      detail: 'Ready',
      detectedHighlightCount: 1,
      highlightSamples: [{
        excerpt: `Before ${name} highlight after`,
        highlightText: `${name} highlight`,
        matched: true,
        sourceName: `${name}.md`
      }],
      sourcePath: `${name}.md`,
      status: 'new' as const
    })),
    unchangedCount: 0,
    updatedCount: 0
  };
}

function createOpenOverlayImportSettings(
  handlePreviewKeepImport: ReturnType<typeof vi.fn>,
  handleChangeAction = vi.fn()
) {
  return {
    cancelReadwiseReaderImport: () => undefined,
    handleChangeAction,
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

vi.mock('../../shared/platform/runtime/demoRuntime', () => ({
  useDemoRuntimeState: () => ({ isDemo: workspaceSettingsOverlayMocks.isDemo })
}));

vi.mock('../../shared/localization/LocalizationProvider', () => ({
  useLocalization: () => ({ t: (key: string) => key }),
  useTranslation: () => (key: string) => key
}));

vi.mock('../../shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/ui')>();
  return {
    ...actual,
    requestAppConfirmation: workspaceSettingsOverlayMocks.requestAppConfirmation
  };
});

vi.mock('../../features/settings/components/SettingsPanel', () => ({
  SettingsPanel: (props: { importCategoryContent?: ReactNode }) => (
    <div data-testid="settings-panel">{props.importCategoryContent}</div>
  )
}));

import { WorkspaceSettingsOverlay } from './WorkspaceSettingsOverlay';

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;

beforeEach(() => {
  workspaceSettingsOverlayMocks.isDemo = false;
  workspaceSettingsOverlayMocks.requestAppConfirmation.mockReset();
  workspaceSettingsOverlayMocks.useImportSourceWorkspaceState.mockReset();
  workspaceSettingsOverlayMocks.useImportSourceWorkspaceState.mockImplementation(
    () => createDefaultOverlayImportSettings()
  );
});

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

it('opens the demo settings preview without loading live settings state', async () => {
  workspaceSettingsOverlayMocks.isDemo = true;

  render(
    <WorkspaceSettingsOverlay
      isSettingsOpen
      onClose={() => undefined}
      requestedCategory="general"
    />
  );

  expect(await screen.findByText('settings.demoPreview.banner.title')).toBeInTheDocument();
  expect(screen.getByText('settings.demoPreview.readOnlyBadge')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'settings.demoPreview.downloadDesktop' })).toHaveAttribute(
    'href',
    'https://github.com/campfirium/foliole/releases'
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

  await vi.dynamicImportSettled();
  fireEvent.click(await screen.findByRole('button', { name: 'Preview source-1' }));

  await waitFor(() => expect(handlePreviewKeepImport).toHaveBeenCalledWith('source-1', 'sources'));
  expect(await screen.findByRole('dialog', { name: 'Import preview' })).toBeInTheDocument();
  expect(screen.queryByText('/demo/merged')).not.toBeInTheDocument();
  expect(screen.queryByText('Result preview')).not.toBeInTheDocument();
  expect(screen.getByText('Checked 3 full document files; 3 matched highlights.')).toBeInTheDocument();
  expect(screen.getByText('3 sample highlights shown below. Adjust the linked folder settings and preview again if they do not look right.')).toBeInTheDocument();
  expect(screen.getByText('first highlight')).toBeInTheDocument();
  expect(screen.getByText('second highlight')).toBeInTheDocument();
  expect(screen.getByText('third highlight')).toBeInTheDocument();
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('confirms before enabling delete handling for a watch folder', async () => {
  const handleChangeAction = vi.fn();
  workspaceSettingsOverlayMocks.requestAppConfirmation.mockResolvedValue(true);
  workspaceSettingsOverlayMocks.useImportSourceWorkspaceState.mockReturnValue(
    createOpenOverlayImportSettings(vi.fn(), handleChangeAction) as never
  );

  render(
    <WorkspaceSettingsOverlay
      isSettingsOpen
      onClose={() => undefined}
      requestedCategory={null}
    />
  );

  await vi.dynamicImportSettled();
  fireEvent.change(await screen.findByRole('combobox', { name: 'Handling source-1' }), {
    target: { value: 'delete' }
  });

  await waitFor(() =>
    expect(workspaceSettingsOverlayMocks.requestAppConfirmation).toHaveBeenCalledWith({
      cancelLabel: 'Cancel',
      confirmLabel: 'Enable',
      description: [
        'Source files in this watch folder will be moved to the system trash after they are successfully imported.'
      ],
      title: 'Confirm enabling'
    })
  );
  expect(handleChangeAction).toHaveBeenCalledWith('source-1', 'delete');
});
