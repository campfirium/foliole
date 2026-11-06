import { useEffect, useRef } from 'react';

import type { MarkdownEditorProps } from './markdownEditorTypes';

// Tab can indent a list or move focus; only the actual focus departure ends editing.
export function useMarkdownEditorKeyboardFocusLeave(props: MarkdownEditorProps) {
  const enabled = Boolean(props.onKeyboardFocusLeave) && !props.readOnly;
  const navigation = useRef<KeyboardEvent | null>(null);
  useEffect(() => {
    const clear = () => { navigation.current = null; };
    if (!enabled) { clear(); return undefined; }
    window.addEventListener('keyup', clear, true);
    window.addEventListener('pointerdown', clear, true);
    return () => {
      clear();
      window.removeEventListener('keyup', clear, true);
      window.removeEventListener('pointerdown', clear, true);
    };
  }, [enabled, props.nodeId]);
  const onKeyDownCapture: NonNullable<MarkdownEditorProps['onKeyDownCapture']> = event => {
    navigation.current = enabled && event.key === 'Tab' ? event.nativeEvent : null;
  };
  const onBlurCapture: NonNullable<MarkdownEditorProps['onBlurCapture']> = event => {
    props.onBlurCapture?.(event);
    const key = navigation.current;
    navigation.current = null;
    if (!key || key.defaultPrevented || props.readOnly || !event.relatedTarget ||
        event.currentTarget.contains(event.relatedTarget)) return;
    props.onKeyboardFocusLeave?.();
  };
  return { onBlurCapture, onKeyDownCapture };
}
