import { act, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import { expect, it } from 'vitest';

import { hasContentEditingSession } from '../../lib/core/sync/contentEditingSession.js';

import { createEditorHandoffFixture } from './editorHandoff.test-support.js';

const rendererModule = (modulePath: string) => import(modulePath);
const { MarkdownEditor } = await rendererModule('../../src/features/editor/components/MarkdownEditor.tsx');
const { LocalizationProvider } = await rendererModule('../../src/shared/localization/LocalizationProvider.tsx');
const { MouseGestureSettingsProvider } = await rendererModule('../../src/features/settings/context/MouseGestureSettingsProvider.tsx');

type CompositionEditor = {
  getContent(): string;
  replaceRange(from: number, to: number, content: string): void;
  flushContentChanges?(): void;
};

async function mountEditor() {
  let adapter: CompositionEditor | null = null;
  const app = await createEditorHandoffFixture(true, true, panel => createElement(LocalizationProvider, null,
    createElement(MouseGestureSettingsProvider, null, createElement(MarkdownEditor, {
      nodeId: panel.editorNodeId, value: panel.editorContent, className: 'prompt-editor-host',
      onReady: (next: CompositionEditor | null) => { adapter = next; },
      onChange: panel.onEditorChange,
      onDocumentInput: panel.onEditorInput,
      onFocusCapture: panel.onEditorFocus,
      onFocusLeave: panel.onEditorFocusLeave,
      onPendingInput: panel.onEditorPendingInput
    }))));
  const input = app.container!.querySelector<HTMLElement>('.cm-content')!;
  expect(adapter).not.toBeNull();
  act(() => input.focus());
  const editor = adapter as unknown as CompositionEditor;
  return { app, input, editor, view: app.view };
}

function afterInputEvent() {
  return new Promise<void>(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
  });
}

export function registerEditorCompositionExitTests() {
  it('waits for the actual composition end after blur even if intermediate text was explicitly flushed', async () => {
    const { app, input, editor } = await mountEditor();
    await act(async () => {
      editor.replaceRange(0, editor.getContent().length, 'Local');
      editor.flushContentChanges?.();
      await app.drain();
      await app.remote();
    });
    let endedBeforeCompositionEnd = false;
    await act(async () => {
      fireEvent.compositionStart(input);
      editor.replaceRange(0, editor.getContent().length, 'Local 中');
      input.blur();
      expect(input).not.toBe(document.activeElement);
      editor.flushContentChanges?.();
      await app.drain();
      endedBeforeCompositionEnd = !hasContentEditingSession(app.port, 'topic');
      editor.replaceRange(0, editor.getContent().length, 'Local 中文');
      editor.flushContentChanges?.();
      fireEvent.compositionEnd(input);
      await afterInputEvent();
      await app.drain();
    });
    expect(endedBeforeCompositionEnd).toBe(false);
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
    expect(await app.bodies()).toContain('Local 中文');
    expect((await app.current()).parent_version_ids).toHaveLength(2);
  });
  registerUnmodifiedCompositionTest();
  registerRefocusedCompositionTest();

}

function registerUnmodifiedCompositionTest() {
  it('does not claim an unmodified composition before any actual text input', async () => {
    const { app, input, editor } = await mountEditor();
    act(() => { fireEvent.compositionStart(input); });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
    await act(async () => { await app.remote(); });
    expect((await app.current()).body_text).toBe('Remote');
    expect(editor.getContent()).toBe('Remote');
    await act(async () => { fireEvent.compositionEnd(input); await afterInputEvent();
      await app.drain(); });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
  });

}

function registerRefocusedCompositionTest() {
  it('keeps a refocused composition active after the obsolete exit receives its final input', async () => {
    const { app, input, editor } = await mountEditor();
    await act(async () => {
      editor.replaceRange(0, editor.getContent().length, 'Local');
      editor.flushContentChanges?.();
      await app.drain();
      await app.remote();
    });
    await act(async () => {
      fireEvent.compositionStart(input);
      editor.replaceRange(0, editor.getContent().length, 'Local 中');
      input.blur();
      editor.flushContentChanges?.();
      await app.drain();
      input.focus();
      editor.replaceRange(0, editor.getContent().length, 'Local 中文');
      editor.flushContentChanges?.();
      fireEvent.compositionEnd(input);
      await afterInputEvent();
      await app.drain();
    });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(true);
    expect(editor.getContent()).toBe('Local 中文');
    expect((await app.current()).parent_version_ids).toHaveLength(1);
    await act(async () => { input.blur(); await afterInputEvent();
      await app.drain(); });
    expect(hasContentEditingSession(app.port, 'topic')).toBe(false);
    expect(await app.bodies()).toContain('Local 中文');
  });
}
