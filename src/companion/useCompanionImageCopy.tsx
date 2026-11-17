import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';
import { getImageClipboardSource, type ImageClipboardSource } from '../features/editor/model/imageClipboardSource';
import { getCompanionReadingScope, subscribeCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';

import { CompanionImageCopyMenu } from './CompanionImageCopyMenu';
import { useCompanionImageLongPress } from './useCompanionImageLongPress';

type Target = ImageClipboardSource & { content: string; editor: EditorAdapter; scope: object; x: number; y: number };

export function useCompanionImageCopy(nodeId: string, enabled: boolean, content: string) {
  const editor = useRef<EditorAdapter | null>(null);
  const active = useRef<Target | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const press = useCompanionImageLongPress(resolve, open);
  const close = useCallback(() => { press.cancel(); active.current = null; setTarget(null); }, [press.cancel]);
  const isCurrent = (value: Target) => enabled && active.current === value && editor.current === value.editor &&
    getCompanionReadingScope() === value.scope && value.editor.getContent() === value.content;
  useEffect(() => { close(); return press.cancel; }, [enabled, nodeId, content, close, press.cancel]);
  useEffect(() => subscribeCompanionReadingScope(close), [close]);
  useEffect(() => {
    window.addEventListener('scroll', close, true);
    window.visualViewport?.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.visualViewport?.removeEventListener('resize', close);
      active.current = null;
    };
  }, [close]);
  function resolve(targetElement: EventTarget, x: number, y: number): Target | null {
    if (!enabled || !editor.current || !(targetElement instanceof Element) ||
      targetElement.closest('button, [data-cloze-handle]')) return null;
    const widget = targetElement.closest<HTMLElement>('.cm-md-image-widget');
    if (!widget || widget.dataset.mdImageEditorNodeId !== nodeId) return null;
    const current = editor.current.getContent();
    const image = getImageClipboardSource(current, Number(widget.dataset.mdImageFrom), Number(widget.dataset.mdImageTo));
    return image ? { ...image, content: current, editor: editor.current, scope: getCompanionReadingScope(), x, y } : null;
  }
  function open(value: Target) {
    if (editor.current !== value.editor || value.scope !== getCompanionReadingScope() || value.editor.getContent() !== value.content) return;
    active.current = value;
    setTarget(value);
  }
  return {
    onReady: useCallback((value: EditorAdapter | null) => { editor.current = value; }, []),
    handlers: {
      ...press.handlers,
      onClickCapture(event: MouseEvent<HTMLElement>) {
        if (!active.current || !(event.target instanceof Element) || !event.target.closest('.cm-md-image-widget')) return;
        event.preventDefault();
        event.stopPropagation();
      }
    },
    menu: target ? <CompanionImageCopyMenu markdown={target.markdown} x={target.x} y={target.y}
      onClose={close} isCurrent={() => isCurrent(target)} /> : null
  };
}
