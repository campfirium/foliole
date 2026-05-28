import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
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

import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';

import { requestClipboardImport } from './clipboardImportRequest';
import { groupWorkspaceLayoutProps } from './workspaceLayoutGroupedProps';
import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';
import type { WorkspaceLayoutFlatProps } from './workspaceLayoutProps';

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
  return groupWorkspaceLayoutProps(flatProps) as ComponentProps<typeof WorkspaceLayoutMain>;
}

beforeEach(() => {
  getFormalImportFailureMessage.mockClear();
  getFormalImportFailureMessage.mockReturnValue(null);
  getFormalImportLatestResult.mockClear();
  getFormalImportLatestResult.mockReturnValue(null);
});

it('opens the imported clipboard topic from the success notice', async () => {
  const importResult = createDeferred<boolean>();
  const onCloseImportManagement = vi.fn();
  const onSelectNode = vi.fn();
  const onStartClipboardImport = vi.fn(() => importResult.promise);
  getFormalImportLatestResult.mockReturnValue({ nodeId: 'node-imported', resultStatus: 'imported' });

  render(<WorkspaceLayoutMain {...createProps({ onCloseImportManagement, onSelectNode, onStartClipboardImport })} />);

  fireEvent.click(screen.getByTestId('workspace-grid'));
  expect(await screen.findByRole('status')).toHaveTextContent('Importing clipboard...');

  importResult.resolve(true);

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('Open topic');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open imported topic' }));

  expect(onCloseImportManagement).toHaveBeenCalledTimes(1);
  expect(onSelectNode).toHaveBeenCalledWith('node-imported');
});

it('shows progress while a selected file is importing', async () => {
  const importResult = createDeferred<boolean>();
  const onRunImportFile = vi.fn(() => importResult.promise);
  getFormalImportLatestResult.mockReturnValue({ nodeId: 'node-imported', resultStatus: 'imported' });

  render(<WorkspaceLayoutMain {...createProps({ onRunImportFile })} />);

  fireEvent.click(screen.getByTestId('workspace-file-import'));
  expect(await screen.findByRole('status')).toHaveTextContent('Importing file...');
  expect(onRunImportFile).toHaveBeenCalledTimes(1);

  importResult.resolve(true);

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('File imported');
  });
});

it('runs requested clipboard imports through the workspace notice controller', async () => {
  const importResult = createDeferred<boolean>();
  const onStartClipboardImport = vi.fn(() => importResult.promise);

  render(<WorkspaceLayoutMain {...createProps({ onStartClipboardImport })} />);

  requestClipboardImport();
  expect(await screen.findByRole('status')).toHaveTextContent('Importing clipboard...');
  expect(onStartClipboardImport).toHaveBeenCalledTimes(1);

  importResult.resolve(false);

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent('No supported clipboard content found');
  });
});

it('shows app runtime notices inside the workspace surface', async () => {
  render(<WorkspaceLayoutMain {...createProps({})} />);

  showAppRuntimeNotice('Selected topic is not backed by an active keep import source.');

  const notice = await screen.findByTestId('app-runtime-notice');
  expect(notice).toHaveClass('left-1/2');
  expect(notice).toHaveClass('top-1/2');
  expect(notice).toHaveTextContent(
    'Selected topic is not backed by an active keep import source.'
  );
});
