import { render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const windowTitleBarRender = vi.hoisted(() => vi.fn());

vi.mock('./WindowTitleBar', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    WindowTitleBar: React.memo((props: unknown) => {
      windowTitleBarRender(props);
      return <div data-testid="window-titlebar" />;
    })
  };
});

vi.mock('./WorkspaceLayoutGrid', () => ({
  WorkspaceLayoutGrid: () => <div data-testid="workspace-grid" />
}));

vi.mock('./ImportSourceWorkspace', () => ({
  ImportSourceWorkspace: () => null
}));

vi.mock('./WorkspaceSettingsOverlay', () => ({
  WorkspaceSettingsOverlay: () => null
}));

vi.mock('./ImmersiveShortcutsOverlay', () => ({
  ImmersiveShortcutsOverlay: () => null
}));

vi.mock('./useImmersiveReadingMode', () => ({
  useImmersiveReadingMode: () => ({
    enterImmersiveEdit: () => undefined,
    isImmersiveEditing: false,
    isShortcutsOverlayOpen: false,
    shouldSuppressSelectionRestore: () => false
  })
}));

import { WorkspaceLayoutMain } from './WorkspaceLayoutMain';

function createProps(overrides: Partial<ComponentProps<typeof WorkspaceLayoutMain>> = {}) {
  const onCloseImportManagement = vi.fn();
  const onOpenNotesView = vi.fn();
  const onOpenVirtualView = vi.fn();
  const onOpenTrashView = vi.fn();
  const onSelectNode = vi.fn();
  const onToggleRightSidebarVisibility = vi.fn();
  return {
    activeNodeId: 'node-1',
    editorContent: 'Version 1',
    isImmersiveMode: false,
    isImportManagementOpen: false,
    isListCollapsed: false,
    isRightSidebarCollapsed: false,
    isTrashViewOpen: false,
    isViewingTrashNode: false,
    isVirtualViewOpen: false,
    listWidth: 280,
    onCloseImportManagement,
    onOpenImportManagement: vi.fn(),
    onOpenNotesView,
    onOpenTrashView,
    onOpenVirtualView,
    onRunImportFile: vi.fn(async () => true),
    onSelectNode,
    onStartClipboardImport: vi.fn(),
    onToggleListVisibility: vi.fn(),
    onToggleRightSidebarVisibility,
    rightSidebarWidth: 320,
    selectedTrashNodeId: null,
    shouldSuppressNavigationSelectionRestore: () => false,
    ...overrides
  } as ComponentProps<typeof WorkspaceLayoutMain>;
}

beforeEach(() => {
  windowTitleBarRender.mockClear();
});

describe('WorkspaceLayoutMain title bar rendering', () => {
  it('keeps the title bar steady when only document content changes', () => {
    const props = createProps();
    const { rerender } = render(<WorkspaceLayoutMain {...props} />);

    expect(windowTitleBarRender).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceLayoutMain
        {...props}
        editorContent="Version 2"
      />
    );

    expect(windowTitleBarRender).toHaveBeenCalledTimes(1);
  });
});
