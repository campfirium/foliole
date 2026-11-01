import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import { MarkdownEditor } from '../../features/editor/components/MarkdownEditor';
import { MouseGestureSettingsProvider } from '../../features/settings/context/MouseGestureSettingsProvider';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import type { ElectronAPI, NativeKeyboardInputPayload } from '../../shared/platform/electronApi';
import { openExternalUrl } from '../../shared/platform/runtimeExternalNavigation';
import { useSelectionAnnotationToolbar } from '../hooks/useSelectionAnnotationToolbar';

import { WebLookupSelectionMenu } from './WebLookupSelectionMenu';

vi.mock('../../shared/platform/runtimeExternalNavigation', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined)
}));

function EditorWithMenu({ review = false, text = 'Selected text', onExitEditing = () => true }) {
  const editorRef = useRef<EditorAdapter | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  useSelectionAnnotationToolbar({
    activeNodeId: 'topic', editorRef, isTrashViewOpen: false, nodesById: {},
    setContextMenu: () => setSelection(null), trashedNodeIds: []
  });
  return <>
    <MarkdownEditor
      className="prompt-editor-host"
      nodeId="topic"
      onChange={() => undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        const editor = editorRef.current;
        if (!editor) throw new Error('editor is not ready');
        const range = editor.getSelection();
        setSelection(editor.getContent().slice(range.from, range.to));
      }}
      onExitEditing={onExitEditing}
      onReady={(editor) => { editorRef.current = editor; }}
      reviewEscapeBlurEnabled={review}
      value={text}
    />
    {selection !== null ? <WebLookupSelectionMenu
      left={20} top={20} onClose={() => setSelection(null)}
      selectionPayload={{
        anchorId: 'anchor', clozeContent: selection, entries: [],
        parentNodeId: 'topic', selectionText: selection
      }}
      titleText="Topic"
    /> : null}
  </>;
}

async function openMenu(options: Parameters<typeof EditorWithMenu>[0] = {}) {
  const view = render(<LocalizationProvider><MouseGestureSettingsProvider>
    <EditorWithMenu {...options} />
  </MouseGestureSettingsProvider></LocalizationProvider>);
  const editor = view.container.querySelector<HTMLElement>('.cm-content');
  if (!editor) throw new Error('CodeMirror content is missing');
  act(() => editor.focus());
  fireEvent.keyDown(editor, { key: 'a', code: 'KeyA', ctrlKey: true });
  fireEvent.contextMenu(editor, { button: 2 });
  await screen.findByRole('menu');
  expect(document.activeElement).toBe(editor);
  return editor;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(openExternalUrl).mockClear();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) }
  });
});

afterEach(() => { delete window.electronAPI; });

function installNativeKeyboard() {
  const listeners = new Set<(payload: NativeKeyboardInputPayload) => void>();
  window.electronAPI = {
    onNativeKeyboardInput: (handler: (payload: NativeKeyboardInputPayload) => void) => {
      listeners.add(handler);
      return () => { listeners.delete(handler); };
    }
  } as unknown as ElectronAPI;
  return () => {
    for (const listener of [...listeners]) listener({
      altKey: false, code: 'Escape', controlKey: false, key: 'Escape',
      metaKey: false, shiftKey: false, type: 'keyDown'
    });
  };
}

it.each([false, true])('closes a focused editor menu with one Escape (review=%s)', async (review) => {
  const onExitEditing = vi.fn(() => true);
  const editor = await openMenu({ review, onExitEditing });
  let delivered = false;
  await act(async () => {
    delivered = !fireEvent.keyDown(editor, { key: 'Escape', code: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.queryByRole('menu'), JSON.stringify({
    consumed: delivered, editorFocusedAfter: document.activeElement === editor,
    editingExitCount: onExitEditing.mock.calls.length
  })).toBeNull();
  expect(onExitEditing).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(editor);
  expect(openExternalUrl).not.toHaveBeenCalled();
  expect(editor).toHaveTextContent('Selected text');
});

it.each([false, true])('keeps native Escape on the menu before editor exit (DOM=%s)', async (withDom) => {
  const nativeEscape = installNativeKeyboard();
  const onExitEditing = vi.fn(() => true);
  const editor = await openMenu({ onExitEditing });
  await act(async () => {
    nativeEscape();
    if (withDom) fireEvent.keyDown(editor, { key: 'Escape', code: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(onExitEditing).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(editor);
});

it('closes a long-prompt confirmation with one Escape without opening its URL', async () => {
  const editor = await openMenu({ text: 'long selection '.repeat(600) });
  fireEvent.pointerDown(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Chat with ChatGPT' }));
  await screen.findByRole('button', { name: 'Continue' });
  await act(async () => {
    fireEvent.keyDown(editor, { key: 'Escape', code: 'Escape' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  expect(openExternalUrl).not.toHaveBeenCalled();
});
