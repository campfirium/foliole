import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const workspaceSettingsOverlayMocks = vi.hoisted(() => ({
  useImportSourceWorkspaceState: vi.fn(() => ({
    handleChangeAction: () => undefined,
    handleChangeSource: () => undefined,
    handleChangeTitleStrategy: () => undefined,
    handleChooseFolder: async () => null,
    handleCopySource: () => undefined,
    handleDeleteSource: () => undefined,
    handleDisableKeepImport: () => undefined,
    handlePreviewKeepImport: async () => null,
    handleSaveReadwiseReaderSetup: () => undefined,
    readwiseReaderConfig: null,
    readwiseRootPath: '',
    readwiseSources: [],
    sources: [],
    titleStrategy: 'source'
  }))
}));

vi.mock('./useImportSourceWorkspaceState', () => ({
  useImportSourceWorkspaceState: workspaceSettingsOverlayMocks.useImportSourceWorkspaceState
}));

vi.mock('../../features/settings/components/SettingsPanel', () => ({
  SettingsPanel: () => <div data-testid="settings-panel">settings</div>
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
