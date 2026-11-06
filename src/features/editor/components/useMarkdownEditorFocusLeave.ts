import { useEffect, useRef } from 'react';

import { afterEditorEventDispatch } from '../model/editorEventCompletion';

import type { MarkdownEditorProps } from './markdownEditorTypes';

type Departure = { root: HTMLDivElement; notify: () => void };

export function useMarkdownEditorFocusLeave(props: MarkdownEditorProps) {
  const enabled = Boolean(props.onFocusLeave) && !props.readOnly;
  const pointer = useRef<{ id: number } | null>(null);
  const departure = useRef<Departure | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    if (!enabled) return undefined;
    const begin = (event: PointerEvent) => { pointer.current = { id: event.pointerId }; };
    const complete = () => {
      const interaction = pointer.current;
      const token = generation.current;
      afterEditorEventDispatch(() => {
        if (pointer.current !== interaction) return;
        pointer.current = null;
        const pending = departure.current;
        departure.current = null;
        if (pending && token === generation.current && !pending.root.contains(document.activeElement)) pending.notify();
      });
    };
    const release = (event: MouseEvent) => {
      const target = event.target;
      const interaction = pointer.current;
      afterEditorEventDispatch(() => {
        if (pointer.current === interaction && target instanceof Node && !target.isConnected) complete();
      });
    };
    const cancel = (event: PointerEvent) => { if (pointer.current?.id === event.pointerId) complete(); };
    window.addEventListener('pointerdown', begin, true);
    window.addEventListener('click', complete, true);
    window.addEventListener('mouseup', release, true);
    window.addEventListener('auxclick', complete, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('dragend', complete, true);
    return () => {
      generation.current += 1;
      pointer.current = null;
      departure.current = null;
      window.removeEventListener('pointerdown', begin, true);
      window.removeEventListener('click', complete, true);
      window.removeEventListener('mouseup', release, true);
      window.removeEventListener('auxclick', complete, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('dragend', complete, true);
    };
  }, [enabled, props.nodeId]);
  const onBlurCapture: NonNullable<MarkdownEditorProps['onBlurCapture']> = event => {
    props.onBlurCapture?.(event);
    if (!enabled || event.currentTarget.contains(event.relatedTarget)) return;
    const notify = props.onFocusLeave;
    if (!notify) return;
    if (pointer.current !== null) departure.current = { root: event.currentTarget, notify };
    else notify();
  };
  const onFocusCapture: NonNullable<MarkdownEditorProps['onFocusCapture']> = event => {
    generation.current += 1;
    departure.current = null;
    props.onFocusCapture?.(event);
  };
  return { onBlurCapture, onFocusCapture };
}
