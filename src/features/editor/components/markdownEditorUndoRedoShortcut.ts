import type { FormEvent, KeyboardEvent } from 'react';

import type { MarkdownEditorProps } from './markdownEditorTypes';

type EditorUndoRedoKeyEvent = Pick<
  KeyboardEvent<HTMLDivElement> | globalThis.KeyboardEvent,
  'altKey' | 'ctrlKey' | 'defaultPrevented' | 'key' | 'metaKey' | 'preventDefault' | 'shiftKey' | 'stopPropagation'
> & {
  nativeEvent?: Pick<KeyboardEvent<HTMLDivElement>['nativeEvent'], 'isComposing'>;
  isComposing?: boolean;
};

function isComposingUndoRedoEvent(event: EditorUndoRedoKeyEvent) {
  return event.nativeEvent?.isComposing === true || event.isComposing === true;
}

export function handleEditorUndoRedoKeyDown(
  event: EditorUndoRedoKeyEvent,
  props: Pick<MarkdownEditorProps, 'onRedo' | 'onUndo'>
) {
  if (event.defaultPrevented || isComposingUndoRedoEvent(event) || event.altKey || (!event.ctrlKey && !event.metaKey)) {
    return;
  }
  const key = event.key.toLowerCase();
  const isUndo = key === 'z' && !event.shiftKey;
  const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
  const handler = isUndo ? props.onUndo : isRedo ? props.onRedo : undefined;
  if (!handler) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  handler();
}

export function handleEditorUndoRedoBeforeInput(
  event: FormEvent<HTMLDivElement>,
  props: Pick<MarkdownEditorProps, 'onRedo' | 'onUndo'>
) {
  const nativeEvent = event.nativeEvent as InputEvent;
  if (nativeEvent.isComposing) {
    return;
  }
  const isUndo = nativeEvent.inputType === 'historyUndo';
  const isRedo = nativeEvent.inputType === 'historyRedo';
  if (!isUndo && !isRedo) {
    return;
  }
  const handler = isUndo ? props.onUndo : props.onRedo;
  event.preventDefault();
  event.stopPropagation();
  handler?.();
}
