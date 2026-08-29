import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import type { ElectronAPI, NativeKeyboardInputPayload } from '../../../shared/platform/electronApi';
import { MouseGestureSettingsProvider } from '../../settings/context/MouseGestureSettingsProvider';

vi.mock('../adapters/CodeMirrorEditorAdapter', () => ({
  CodeMirrorEditorAdapter: class {
    constructor() {}
    destroy() {}
    getContent() { return ''; }
    getScrollMetrics() { return { clientHeight: 0, scrollHeight: 0, scrollTop: 0 }; }
    onContentChange() { return () => undefined; }
    onScroll() { return () => undefined; }
    refreshImageClozePresentation() {}
    setContent() {}
    setDiffDecorations() {}
    setHideTitleHeading() {}
    setNodeId() {}
    setReadOnly() {}
  }
}));

import { MarkdownEditor } from './MarkdownEditor';

function renderEditor(
  reviewCaretLineHighlight: boolean,
  reviewEscapeBlurEnabled = reviewCaretLineHighlight,
  options: { onExitEditing?: () => boolean; readOnly?: boolean } = {}
) {
  return render(
    <LocalizationProvider>
      <MouseGestureSettingsProvider>
        <MarkdownEditor
          nodeId="node-1"
          onChange={vi.fn()}
          className="prompt-editor-host"
          {...options}
          reviewCaretLineHighlight={reviewCaretLineHighlight}
          reviewEscapeBlurEnabled={reviewEscapeBlurEnabled}
          value="Alpha"
        />
      </MouseGestureSettingsProvider>
    </LocalizationProvider>
  );
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
  return () => handler?.({
    altKey: false,
    code: 'Escape',
    controlKey: false,
    key: 'Escape',
    metaKey: false,
    shiftKey: false,
    type: 'keyDown'
  });
}

afterEach(() => {
  delete window.electronAPI;
});

describe('MarkdownEditor review caret-line hint', () => {
  it('marks the editor host only when the review caret-line hint is enabled', () => {
    const view = renderEditor(true);

    expect(view.container.querySelector('.markdown-editor-host')).toHaveAttribute('data-review-caret-line', 'true');

    view.rerender(
      <LocalizationProvider>
        <MouseGestureSettingsProvider>
          <MarkdownEditor
            nodeId="node-1"
            onChange={vi.fn()}
            reviewCaretLineHighlight={false}
            reviewEscapeBlurEnabled={false}
            value="Alpha"
          />
        </MouseGestureSettingsProvider>
      </LocalizationProvider>
    );

    expect(view.container.querySelector('.markdown-editor-host')).toHaveAttribute('data-review-caret-line', 'false');
  });
});

describe('MarkdownEditor Escape blur', () => {
  it('blurs review editor Escape before global Escape handlers', () => {
    const view = renderEditor(false, true);
    const host = view.container.querySelector('.markdown-editor-host') as HTMLElement;
    const editable = document.createElement('div');
    const globalEscape = vi.fn();
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    host.append(editable);
    editable.focus();
    window.addEventListener('keydown', globalEscape);

    const wasNotPrevented = fireEvent.keyDown(editable, { key: 'Escape', cancelable: true });

    window.removeEventListener('keydown', globalEscape);
    expect(document.activeElement).not.toBe(editable);
    expect(host).toHaveAttribute('data-review-caret-line', 'false');
    expect(host).toHaveAttribute('data-review-escape-blur', 'true');
    expect(wasNotPrevented).toBe(false);
    expect(globalEscape).not.toHaveBeenCalled();
  });

  it('blurs ordinary editor Escape outside review mode after CodeMirror keeps focus', async () => {
    const view = renderEditor(false, false);
    const host = view.container.querySelector('.markdown-editor-host') as HTMLElement;
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    host.append(editable);
    editable.focus();

    const wasNotPrevented = fireEvent.keyDown(editable, { key: 'Escape', cancelable: true });
    editable.focus();

    await waitFor(() => expect(document.activeElement).not.toBe(editable));
    expect(host).toHaveAttribute('data-review-escape-blur', 'false');
    expect(wasNotPrevented).toBe(false);
  });

  it('blurs ordinary editor native Escape outside review mode', () => {
    const dispatchNativeEscape = installNativeKeyboardBridge();
    const view = renderEditor(false, false);
    const host = view.container.querySelector('.markdown-editor-host') as HTMLElement;
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    host.append(editable);
    editable.focus();

    dispatchNativeEscape();

    expect(document.activeElement).not.toBe(editable);
    expect(host).toHaveAttribute('data-review-escape-blur', 'false');
  });
});

describe('MarkdownEditor topic focus return', () => {
  it('returns ordinary prompt editor focus once for DOM and native Escape', () => {
    const onDomExit = vi.fn(() => true);
    const domView = renderEditor(false, false, { onExitEditing: onDomExit });
    const domHost = domView.container.querySelector('.markdown-editor-host') as HTMLElement;
    const domEditable = document.createElement('div');
    domEditable.contentEditable = 'true';
    domEditable.tabIndex = 0;
    domHost.append(domEditable);
    domEditable.focus();

    fireEvent.keyDown(domEditable, { key: 'Escape', cancelable: true });

    expect(onDomExit).toHaveBeenCalledOnce();
    domView.unmount();

    const dispatchNativeEscape = installNativeKeyboardBridge();
    const onNativeExit = vi.fn(() => true);
    const nativeView = renderEditor(false, false, { onExitEditing: onNativeExit });
    const nativeHost = nativeView.container.querySelector('.markdown-editor-host') as HTMLElement;
    const nativeEditable = document.createElement('div');
    nativeEditable.contentEditable = 'true';
    nativeEditable.tabIndex = 0;
    nativeHost.append(nativeEditable);
    nativeEditable.focus();

    dispatchNativeEscape();

    expect(onNativeExit).toHaveBeenCalledOnce();
  });

  it('does not return focus from review or read-only prompt editors', () => {
    const onExitEditing = vi.fn(() => true);
    const reviewView = renderEditor(false, true, { onExitEditing });
    const reviewHost = reviewView.container.querySelector('.markdown-editor-host') as HTMLElement;
    const reviewEditable = document.createElement('div');
    reviewEditable.contentEditable = 'true';
    reviewEditable.tabIndex = 0;
    reviewHost.append(reviewEditable);
    reviewEditable.focus();
    fireEvent.keyDown(reviewEditable, { key: 'Escape', cancelable: true });
    reviewView.unmount();

    const readOnlyView = renderEditor(false, false, { onExitEditing, readOnly: true });
    const readOnlyHost = readOnlyView.container.querySelector('.markdown-editor-host') as HTMLElement;
    const readOnlyEditable = document.createElement('div');
    readOnlyEditable.contentEditable = 'true';
    readOnlyEditable.tabIndex = 0;
    readOnlyHost.append(readOnlyEditable);
    readOnlyEditable.focus();
    fireEvent.keyDown(readOnlyEditable, { key: 'Escape', cancelable: true });

    expect(onExitEditing).not.toHaveBeenCalled();
  });
});

describe('MarkdownEditor Escape dialog precedence', () => {
  it('leaves Escape available to an open dialog instead of consuming it in the editor', () => {
    const view = renderEditor(false, false);
    const host = view.container.querySelector('.markdown-editor-host') as HTMLElement;
    const editable = document.createElement('div');
    const dialog = document.createElement('div');
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    dialog.role = 'dialog';
    host.append(editable);
    document.body.append(dialog);
    editable.focus();

    const wasNotPrevented = fireEvent.keyDown(window, { key: 'Escape', cancelable: true });

    expect(wasNotPrevented).toBe(true);
    expect(document.activeElement).toBe(editable);
    dialog.remove();
  });
});

describe('MarkdownEditor Escape CodeMirror fallback', () => {
  it('blurs focused CodeMirror content when activeElement is outside the editor host', () => {
    const view = renderEditor(false, false);
    const host = view.container.querySelector('.markdown-editor-host') as HTMLElement;
    const editor = document.createElement('div');
    const content = document.createElement('div');
    const outside = document.createElement('button');
    editor.className = 'cm-editor cm-focused';
    content.className = 'cm-content';
    content.tabIndex = 0;
    outside.type = 'button';
    editor.append(content);
    host.append(editor);
    document.body.append(outside);
    content.focus();
    outside.focus();
    const blur = vi.spyOn(content, 'blur');

    fireEvent.keyDown(window, { key: 'Escape', cancelable: true });

    expect(blur).toHaveBeenCalledTimes(1);
    outside.remove();
  });
});
