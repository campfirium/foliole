import type { FormEvent, KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { handleEditorUndoRedoBeforeInput, handleEditorUndoRedoKeyDown } from './markdownEditorUndoRedoShortcut';

function createKeyEvent(overrides: Partial<KeyboardEvent<HTMLDivElement>> = {}) {
  return {
    altKey: false,
    ctrlKey: false,
    key: '',
    metaKey: false,
    nativeEvent: { isComposing: false },
    preventDefault: vi.fn(),
    shiftKey: false,
    stopPropagation: vi.fn(),
    ...overrides
  } as unknown as KeyboardEvent<HTMLDivElement>;
}

function createBeforeInputEvent(inputType: string, overrides: Partial<InputEvent> = {}) {
  return {
    nativeEvent: { inputType, ...overrides },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as FormEvent<HTMLDivElement>;
}

describe('markdown editor undo redo shortcuts', () => {
  it('routes Ctrl/Cmd+Z to undo and redo handlers', () => {
    const onUndo = vi.fn(() => true);
    const onRedo = vi.fn(() => true);

    handleEditorUndoRedoKeyDown(createKeyEvent({ ctrlKey: true, key: 'z' }), { onRedo, onUndo });
    handleEditorUndoRedoKeyDown(createKeyEvent({ metaKey: true, shiftKey: true, key: 'Z' }), { onRedo, onUndo });
    handleEditorUndoRedoKeyDown(createKeyEvent({ ctrlKey: true, key: 'y' }), { onRedo, onUndo });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it('ignores composition and non-editor-history shortcuts', () => {
    const onUndo = vi.fn(() => true);
    const composing = createKeyEvent({
      ctrlKey: true,
      key: 'z',
      nativeEvent: { isComposing: true } as KeyboardEvent<HTMLDivElement>['nativeEvent']
    });

    handleEditorUndoRedoKeyDown(composing, { onUndo });
    handleEditorUndoRedoKeyDown(createKeyEvent({ ctrlKey: true, key: 'b' }), { onUndo });

    expect(onUndo).not.toHaveBeenCalled();
    expect(composing.preventDefault).not.toHaveBeenCalled();
  });

  it('routes native beforeinput history events to undo and redo handlers', () => {
    const onUndo = vi.fn(() => true);
    const onRedo = vi.fn(() => true);
    const undoEvent = createBeforeInputEvent('historyUndo');
    const redoEvent = createBeforeInputEvent('historyRedo');

    handleEditorUndoRedoBeforeInput(undoEvent, { onRedo, onUndo });
    handleEditorUndoRedoBeforeInput(redoEvent, { onRedo, onUndo });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(undoEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(redoEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores ordinary beforeinput events but still blocks native history without handlers', () => {
    const onUndo = vi.fn(() => true);
    const typingEvent = createBeforeInputEvent('insertText');
    const undoEvent = createBeforeInputEvent('historyUndo');

    handleEditorUndoRedoBeforeInput(typingEvent, { onUndo });
    handleEditorUndoRedoBeforeInput(undoEvent, {});

    expect(onUndo).not.toHaveBeenCalled();
    expect(typingEvent.preventDefault).not.toHaveBeenCalled();
    expect(undoEvent.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('leaves composition beforeinput history events to the input method', () => {
    const onUndo = vi.fn(() => true);
    const event = createBeforeInputEvent('historyUndo', { isComposing: true });

    handleEditorUndoRedoBeforeInput(event, { onUndo });

    expect(onUndo).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
