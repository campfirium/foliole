import type { FormEvent, KeyboardEvent } from 'react';

import type { MarkdownEditorProps } from './markdownEditorTypes';

export function handleEditorUndoRedoKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  props: Pick<MarkdownEditorProps, 'onRedo' | 'onUndo'>
) {
  if (event.nativeEvent.isComposing || event.altKey || (!event.ctrlKey && !event.metaKey)) {
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
