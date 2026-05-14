import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { appFloatingSurfaceClassName } from '../../../../shared/ui';
import {
  formatWorkspaceSurfaceColorCss,
  parseWorkspaceSurfaceColor,
  type WorkspaceSurfaceColorValue,
  workspaceSurfaceColorToHsl
} from '../../model/workspaceSurfaceColor';

import { WorkspaceSurfaceColorEditorFields } from './WorkspaceSurfaceColorEditorFields';

import { cn } from '@/shared/lib/utils';

function clampPopupPosition(position: { x: number; y: number }, size: { height: number; width: number }, bounds: { height: number; width: number }) {
  const inset = 12;
  const maxX = Math.max(inset, bounds.width - size.width - inset);
  const maxY = Math.max(inset, bounds.height - size.height - inset);
  return {
    x: Math.min(Math.max(inset, position.x), maxX),
    y: Math.min(Math.max(inset, position.y), maxY)
  };
}

function useEditorDraft(value: string) {
  const parsed = useMemo(() => parseWorkspaceSurfaceColor(value), [value]);
  const [alphaDraft, setAlphaDraft] = useState(parsed ? Math.round(parsed.a * 100) : 100);
  const [channelMode, setChannelMode] = useState<'hex' | 'hsl' | 'rgb'>('hsl');
  const [hslDraft, setHslDraft] = useState(parsed ? workspaceSurfaceColorToHsl(parsed) : { h: 0, l: 100, s: 0 });
  const [rgbDraft, setRgbDraft] = useState(parsed ? { b: parsed.b, g: parsed.g, r: parsed.r } : { b: 255, g: 255, r: 255 });

  useEffect(() => {
    if (!parsed) {
      return;
    }
    setAlphaDraft(Math.round(parsed.a * 100));
    setHslDraft(workspaceSurfaceColorToHsl(parsed));
    setRgbDraft({ b: parsed.b, g: parsed.g, r: parsed.r });
  }, [parsed, value]);

  return { alphaDraft, channelMode, hslDraft, parsed, rgbDraft, setAlphaDraft, setChannelMode, setHslDraft, setRgbDraft };
}

function useCloseInteractions(onClose: () => void) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-workspace-color-editor]')) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('pointerdown', handlePointerDown);
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);
}

function WorkspaceSurfaceColorEditorBody(props: {
  bounds: { height: number; width: number };
  currentColor: WorkspaceSurfaceColorValue;
  draft: ReturnType<typeof useEditorDraft>;
  onCommit: (color: WorkspaceSurfaceColorValue) => void;
  position: { x: number; y: number };
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolvedPosition, setResolvedPosition] = useState(() =>
    clampPopupPosition(props.position, { height: 280, width: 280 }, props.bounds)
  );

  useLayoutEffect(() => {
    const nextSize = {
      height: containerRef.current?.offsetHeight ?? 280,
      width: containerRef.current?.offsetWidth ?? 280
    };
    setResolvedPosition(clampPopupPosition(props.position, nextSize, props.bounds));
  }, [props.bounds, props.position]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  return (
    <div
      aria-label="Workspace surface color editor"
      className={cn(appFloatingSurfaceClassName('popover'), 'absolute z-popover-elevated w-[280px] rounded-md p-3 shadow-panel')}
      data-workspace-color-editor
      ref={containerRef}
      role="dialog"
      style={{ left: resolvedPosition.x, top: resolvedPosition.y }}
      tabIndex={-1}
    >
      <WorkspaceSurfaceColorEditorFields currentColor={props.currentColor} draft={props.draft} onCommit={props.onCommit} />
    </div>
  );
}

export function WorkspaceSurfaceColorEditor(props: {
  anchorPoint: { x: number; y: number };
  bounds: { height: number; width: number };
  onClose: () => void;
  onCommit: (value: string) => void;
  value: string;
}) {
  const draft = useEditorDraft(props.value);
  const currentColor: WorkspaceSurfaceColorValue = {
    a: draft.alphaDraft / 100,
    b: draft.rgbDraft.b,
    g: draft.rgbDraft.g,
    r: draft.rgbDraft.r
  };
  const commitColor = (color: WorkspaceSurfaceColorValue) => props.onCommit(formatWorkspaceSurfaceColorCss(color));
  useCloseInteractions(props.onClose);

  return <WorkspaceSurfaceColorEditorBody bounds={props.bounds} currentColor={currentColor} draft={draft} onCommit={commitColor} position={props.anchorPoint} />;
}
