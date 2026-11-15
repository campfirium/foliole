import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { saveSidebarTierWidth } from '../../features/settings/model/sidebarLayoutPreference';
import type { SidebarSide, SidebarTier } from '../../features/settings/model/sidebarLayoutTiers';

function boundedWidth(width: number) {
  return Math.min(100, Math.max(0, Math.round(width * 100) / 100));
}

export function useTierSidebarResize(tier: SidebarTier | undefined, bodyWidth: number) {
  const [draft, setDraft] = useState<{ id: string; side: SidebarSide; width: number }>();
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  const id = tier?.id;
  useEffect(() => () => cleanupRef.current?.(), [id]);

  const start = (side: SidebarSide, event: PointerEvent<HTMLDivElement>) => {
    if (!tier || bodyWidth === 0 || event.button !== 0) return;
    cleanupRef.current?.();
    event.preventDefault();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const direction = side === 'left' ? 1 : -1;
    const widthAt = (x: number) => boundedWidth(tier[side].width + direction * 100 * (x - startX) / bodyWidth);
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (moveEvent.pointerId === pointerId) setDraft({ id: tier.id, side, width: widthAt(moveEvent.clientX) });
    };
    const finish = (finishEvent: globalThis.PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      if (finishEvent.type === 'pointerup') saveSidebarTierWidth(tier.id, side, widthAt(finishEvent.clientX));
      cleanup();
    };
    const cleanup = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('lostpointercapture', finish);
      cleanupRef.current = undefined;
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      setDraft(undefined);
    };
    cleanupRef.current = cleanup;
    target.setPointerCapture(pointerId);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('lostpointercapture', finish);
  };

  const keyDown = (side: SidebarSide, event: KeyboardEvent<HTMLDivElement>) => {
    if (!tier || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const grow = (event.key === 'ArrowRight') === (side === 'left');
    saveSidebarTierWidth(tier.id, side, boundedWidth(tier[side].width + (grow ? 1 : -1)));
  };
  const resizing = draft && draft.id === id ? draft : undefined;
  return { start, keyDown, draft: resizing };
}
