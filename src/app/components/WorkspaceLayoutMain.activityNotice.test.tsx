import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const { getFormalImportFailureMessage, getFormalImportLatestResult } = vi.hoisted(() => ({
  getFormalImportFailureMessage: vi.fn((): string | null => null),
  getFormalImportLatestResult: vi.fn((): { nodeId: string | null; resultStatus: 'degraded' | 'failed' | 'imported' } | null => null)
}));

vi.mock('../hooks/useFormalImport', () => ({
  getFormalImportFailureMessage,
  getFormalImportLatestResult
}));

vi.mock('./WorkspaceMainTitleBar', () => ({
  WorkspaceMainTitleBar: () => null
}));

vi.mock('./WorkspaceLayoutGrid', () => ({
  WorkspaceLayoutGrid: (props: { props: { imports: { onRunImportFile: () => void; onStartClipboardImport: () => void } } }) => (
    <>
      <button data-testid="workspace-grid" onClick={props.props.imports.onStartClipboardImport} type="button" />
      <button data-testid="workspace-file-import" onClick={props.props.imports.onRunImportFile} type="button" />
    </>
  )
}));

vi.mock('./ImportSourceWorkspace', () => ({
  ImportSourceWorkspace: () => null
}));

vi.mock('./WorkspaceSettingsOverlay', () => ({
  selectWorkspaceSettingsOverlayProps: (props: unknown) => props,
  WorkspaceSettingsOverlay: () => null
}));

vi.mock('./ImmersiveShortcutsOverlay', () => ({
  ImmersiveShortcutsOverlay: () => null
}));

vi.mock('./immersiveReadingModeSource', () => ({
  selectImmersiveReadingModeSource: () => ({})
}));

vi.mock('./useImmersiveReadingMode', () => ({
  useImmersiveReadingMode: () => ({
    enterImmersiveEdit: () => undefined,
    isImmersiveEditing: false,
    isShortcutsOverlayOpen: false,
    shouldSuppressSelectionRestore: () => false
  })
}));

import { clearAppRuntimeNotice, showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import {
  requestClipboardImport,
  requestFileImport
} from './importActivityRequests';
import { groupWorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';
import type { WorkspaceLayoutFlatProps } from './workspaceLayoutPropGroups';

import { renderWithLocalization } from '@/shared/localization/testLocalization';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createProps(overrides: Partial<WorkspaceLayoutFlatProps>) {
  const flatProps = {
    activeNodeId: 'node-1',
    isImmersiveMode: false,
    isImportManagementOpen: false,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    isSettingsOpen: false,
    isTrashViewOpen: false,
    isViewingTrashNode: false,
    isVirtualViewOpen: false,
    listWidth: 280,
    nodeOrder: ['node-1'],
    nodesById: {},
    onCloseImportManagement: vi.fn(),
    onOpenImportManagement: vi.fn(),
    onOpenNotesView: vi.fn(),
    onOpenTrashView: vi.fn(),
    onRunImportFile: vi.fn(async () => true),
    onRunImportFolder: vi.fn(async () => true),
    onSelectNode: vi.fn(),
    onStartClipboardImport: vi.fn(async () => false),
    onToggleRightSidebarVisibility: vi.fn(),
    requestedSettingsCategory: null,
    requestedSettingsDialog: null,
    rightSidebarWidth: 320,
    selectedTrashNodeId: null,
    trashedNodeIds: [],
    ...overrides
  } as WorkspaceLayoutFlatProps;
  return groupWorkspaceLayoutProps(flatProps) as Parameters<typeof WorkspaceLayoutMain>[0];
}

beforeEach(() => {
  getFormalImportFailureMessage.mockClear();
  getFormalImportFailureMessage.mockReturnValue(null);
  getFormalImportLatestResult.mockClear();
  getFormalImportLatestResult.mockReturnValue(null);
  for (let noticeId = 1; noticeId <= 100; noticeId += 1) {
    clearAppRuntimeNotice(noticeId);
  }
});

it('opens the imported clipboard topic after the import resolves', async () => {
  const importResult = createDeferred<boolean>();
  const onCloseImportManagement = vi.fn();
  const onSelectNode = vi.fn();
  const onStartClipboardImport = vi.fn(() => importResult.promise);
  getFormalImportLatestResult.mockReturnValue({ nodeId: 'node-imported', resultStatus: 'imported' });

  renderWithLocalization(<WorkspaceLayoutMain {...createProps({ onCloseImportManagement, onSelectNode, onStartClipboardImport })} />);

  fireEvent.click(screen.getByTestId('workspace-grid'));
  expect(await screen.findByRole('status')).toHaveTextContent('Importing clipboard...');

  importResult.resolve(true);

  await waitFor(() => {
    expect(onCloseImportManagement).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith('node-imported');
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('opens the imported file topic after a selected file imports', async () => {
  const importResult = createDeferred<boolean>();
  const onCloseImportManagement = vi.fn();
  const onSelectNode = vi.fn();
  const onRunImportFile = vi.fn((options?: { onImportStarted?: () => void }) => {
    options?.onImportStarted?.();
    return importResult.promise;
  });
  getFormalImportLatestResult.mockReturnValue({ nodeId: 'node-imported', resultStatus: 'imported' });

  renderWithLocalization(<WorkspaceLayoutMain {...createProps({ onCloseImportManagement, onRunImportFile, onSelectNode })} />);

  fireEvent.click(screen.getByTestId('workspace-file-import'));
  expect(await screen.findByRole('status')).toHaveTextContent('Importing file...');
  expect(onRunImportFile).toHaveBeenCalledTimes(1);

  importResult.resolve(true);

  await waitFor(() => {
    expect(onCloseImportManagement).toHaveBeenCalledTimes(1);
    expect(onSelectNode).toHaveBeenCalledWith('node-imported');
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('runs requested clipboard imports through the workspace notice controller', async () => {
  const importResult = createDeferred<boolean>();
  const onStartClipboardImport = vi.fn(() => importResult.promise);

  renderWithLocalization(<WorkspaceLayoutMain {...createProps({ onStartClipboardImport })} />);

  requestClipboardImport();
  expect(await screen.findByRole('status')).toHaveTextContent('Importing clipboard...');
  expect(onStartClipboardImport).toHaveBeenCalledTimes(1);

  importResult.resolve(false);

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('No supported clipboard content found');
  });
});

it('forwards clipboard import request targets to the workspace notice controller', async () => {
  const importResult = createDeferred<boolean>();
  const onStartClipboardImport = vi.fn(() => importResult.promise);

  renderWithLocalization(<WorkspaceLayoutMain {...createProps({ onStartClipboardImport })} />);

  requestClipboardImport({ targetParentNodeId: 'node-target' });
  expect(await screen.findByRole('status')).toHaveTextContent('Importing clipboard...');
  expect(onStartClipboardImport).toHaveBeenCalledWith({ targetParentNodeId: 'node-target' });

  importResult.resolve(false);
});

it('does not show file import progress when file selection is cancelled', async () => {
  const onRunImportFile = vi.fn(async () => false);

  renderWithLocalization(<WorkspaceLayoutMain {...createProps({ onRunImportFile })} />);

  requestFileImport();

  await waitFor(() => {
    expect(onRunImportFile).toHaveBeenCalledTimes(1);
  });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('shows an empty file import notice after a selected file imports no topic', async () => {
  const importResult = createDeferred<boolean>();
  const onRunImportFile = vi.fn((options?: { onImportStarted?: () => void }) => {
    options?.onImportStarted?.();
    return importResult.promise;
  });

  renderWithLocalization(<WorkspaceLayoutMain {...createProps({ onRunImportFile })} />);

  requestFileImport();
  expect(await screen.findByRole('status')).toHaveTextContent('Importing file...');
  expect(onRunImportFile).toHaveBeenCalledTimes(1);

  importResult.resolve(false);

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('No file imported');
  });
});

it('shows app runtime notices inside the workspace surface', async () => {
  renderWithLocalization(<WorkspaceLayoutMain {...createProps({})} />);

  const noticeId = showAppRuntimeNotice('Selected topic is not backed by an active keep import source.');

  const notice = await screen.findByTestId('app-runtime-notice');
  expect(notice).toHaveClass('left-[calc(var(--workspace-rail-width)+var(--workspace-list-current-width,300px)+var(--workspace-list-splitter-width,1px))]');
  expect(notice).toHaveClass('top-[var(--workspace-top-toolbar-height)]');
  expect(notice).toHaveClass('right-[calc(var(--workspace-right-sidebar-current-width,320px)+var(--workspace-right-sidebar-splitter-width,1px))]');
  const surface = notice.firstElementChild as HTMLElement;
  expect(surface).toHaveClass('min-h-[52px]');
  expect(surface).toHaveClass('w-[min(300px,100%)]');
  expect(surface).toHaveClass('justify-center');
  expect(surface).toHaveClass('text-center');
  expect(surface).toHaveClass('bg-shellless-surface');
  expect(surface).toHaveClass('text-shellless-title');
  expect(notice).toHaveTextContent(
    'Selected topic is not backed by an active keep import source.'
  );
  if (noticeId) {
    clearAppRuntimeNotice(noticeId);
  }
});
