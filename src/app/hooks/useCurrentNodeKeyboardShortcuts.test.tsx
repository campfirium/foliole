import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { ElectronAPI, NativeKeyboardInputPayload } from '../../shared/platform/electronApi';

import { useCurrentNodeKeyboardShortcuts } from './useCurrentNodeKeyboardShortcuts';

type ControllerStub = {
  editorCtx: { contextMenu: unknown };
  externalView: { isExternalViewOpen: boolean };
  runtime: {
    isCommandPaletteOpen: boolean;
    isGoToNodePaletteOpen: boolean;
    isMoveToNodePaletteOpen: boolean;
    isSearchPaletteOpen: boolean;
    isSettingsOpen: boolean;
    isViewingTrashNode: boolean;
  };
  trash: { isTrashViewOpen: boolean };
  virtualView: { isVirtualViewOpen: boolean };
};

function createController(overrides: Partial<ControllerStub> = {}): ControllerStub {
  return {
    editorCtx: { contextMenu: null },
    externalView: { isExternalViewOpen: false },
    runtime: {
      isCommandPaletteOpen: false,
      isGoToNodePaletteOpen: false,
      isMoveToNodePaletteOpen: false,
      isSearchPaletteOpen: false,
      isSettingsOpen: false,
      isViewingTrashNode: false
    },
    trash: { isTrashViewOpen: false },
    virtualView: { isVirtualViewOpen: false },
    ...overrides
  };
}

function createWorkspaceSelectors(deleteNode?: (nodeId: string) => void) {
  return {
    activeNodeId: 'node-1',
    deleteNode: deleteNode ?? vi.fn(),
    nodesById: {
      'node-1': { id: 'node-1', kind: 'topic', parentNodeId: null, title: 'Node 1' }
    }
  };
}

function installNativeKeyboardBridge() {
  let handler: ((payload: NativeKeyboardInputPayload) => void) | null = null;
  window.electronAPI = {
    onNativeKeyboardInput: (nextHandler: (payload: NativeKeyboardInputPayload) => void) => {
      handler = nextHandler;
      return () => {
        handler = null;
      };
    }
  } as unknown as ElectronAPI;
  return (payload: NativeKeyboardInputPayload) => handler?.(payload);
}

function HookHarness(props: {
  controller?: Partial<ControllerStub>;
  deleteNode?: (nodeId: string) => void;
  showDialog?: boolean;
}) {
  useCurrentNodeKeyboardShortcuts({
    controller: createController(props.controller) as never,
    isStudyMode: false,
    ws: createWorkspaceSelectors(props.deleteNode) as never
  });
  return (
    <>
      <div contentEditable role="textbox" suppressContentEditableWarning tabIndex={0}>
        Alpha
      </div>
      {props.showDialog ? (
        <div role="dialog">
          <button type="button">Delay</button>
        </div>
      ) : null}
    </>
  );
}

afterEach(() => {
  delete window.electronAPI;
  vi.useRealTimers();
});

it('leaves current node editing with DOM Escape outside review mode', () => {
  render(<HookHarness />);
  const editor = screen.getByRole('textbox');

  editor.focus();
  fireEvent.focusIn(editor);
  fireEvent.keyDown(editor, { key: 'Escape' });

  expect(document.activeElement).not.toBe(editor);
});

it('leaves current node editing after an editor Escape handler only blurs the editable target', async () => {
  const deleteNode = vi.fn();
  render(<HookHarness deleteNode={deleteNode} />);
  const editor = screen.getByRole('textbox');

  editor.focus();
  fireEvent.focusIn(editor);
  editor.blur();
  fireEvent.blur(editor);

  await waitFor(() => {
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(deleteNode).toHaveBeenCalledWith('node-1');
  });
});

it('keeps current node editing context through a dialog and native Escape clears it outside review mode', async () => {
  const dispatchNativeKeyboard = installNativeKeyboardBridge();
  vi.useFakeTimers();
  const deleteNode = vi.fn();
  const view = render(<HookHarness deleteNode={deleteNode} showDialog />);
  const editor = screen.getByRole('textbox');

  editor.focus();
  fireEvent.focusIn(editor);
  screen.getByRole('button', { name: 'Delay' }).focus();
  fireEvent.focusIn(screen.getByRole('button', { name: 'Delay' }));
  view.rerender(<HookHarness deleteNode={deleteNode} />);

  await act(async () => {
    dispatchNativeKeyboard({
      altKey: false,
      code: 'Escape',
      controlKey: false,
      key: 'Escape',
      metaKey: false,
      shiftKey: false,
      type: 'keyDown'
    });
    vi.runOnlyPendingTimers();
  });
  fireEvent.keyDown(window, { key: 'Delete' });

  expect(deleteNode).toHaveBeenCalledWith('node-1');
});

it('keeps current node editing context while a transient panel blocks shortcuts', () => {
  const view = render(<HookHarness />);
  const editor = screen.getByRole('textbox');

  editor.focus();
  fireEvent.focusIn(editor);
  view.rerender(
    <HookHarness
      controller={{
        runtime: {
          isCommandPaletteOpen: true,
          isGoToNodePaletteOpen: false,
          isMoveToNodePaletteOpen: false,
          isSearchPaletteOpen: false,
          isSettingsOpen: false,
          isViewingTrashNode: false
        }
      }}
    />
  );
  view.rerender(<HookHarness />);
  fireEvent.keyDown(window, { key: 'Escape' });

  expect(document.activeElement).not.toBe(editor);
});

it('lets an already-mounted dialog handle Escape before current node editing state updates', () => {
  const closeDialog = vi.fn();
  const view = render(<HookHarness />);
  const editor = screen.getByRole('textbox');

  editor.focus();
  fireEvent.focusIn(editor);
  view.rerender(
    <>
      <HookHarness />
      <div role="dialog">Command palette</div>
    </>
  );
  window.addEventListener('keydown', closeDialog, { once: true });
  fireEvent.keyDown(window, { key: 'Escape' });

  expect(closeDialog).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(editor);
});
