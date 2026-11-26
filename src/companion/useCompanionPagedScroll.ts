import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { isPagedReadingInteraction, turnCompanionReadingPage } from './companionPagedReading';
import { useCompanionReadingMode } from './companionReadingMode';
import { useRegisterCompanionReadingPages } from './CompanionReadingPageNavigation';

type Swipe = { id: number; x: number; y: number; startedAt: number };

function attachPagedScrolling(surface: HTMLElement, hasSelection: () => boolean) {
  let swipe: Swipe | null = null;
  let wheelActive = false;
  let wheelEnd: ReturnType<typeof setTimeout> | undefined;
  const canTurn = (target: EventTarget | null) => !isPagedReadingInteraction(target) && !hasSelection();
  function down(event: PointerEvent) {
    swipe = event.pointerType === 'touch' && event.isPrimary && canTurn(event.target)
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: Date.now() } : null;
  }
  function up(event: PointerEvent) {
    const start = swipe;
    swipe = null;
    if (!start || start.id !== event.pointerId || !canTurn(event.target) || Date.now() - start.startedAt >= 500) return;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) < 40 || Math.abs(dy) <= Math.abs(event.clientX - start.x)) return;
    turnCompanionReadingPage(surface, dy < 0 ? 1 : -1);
  }
  function cancel() { swipe = null; }
  function wheel(event: WheelEvent) {
    if (event.ctrlKey || !canTurn(event.target) || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    event.preventDefault();
    if (!wheelActive) turnCompanionReadingPage(surface, Math.sign(event.deltaY));
    wheelActive = true;
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => { wheelActive = false; }, 160);
  }
  surface.addEventListener('pointerdown', down);
  surface.addEventListener('pointerup', up);
  surface.addEventListener('pointercancel', cancel);
  surface.addEventListener('wheel', wheel, { passive: false });
  return () => {
    clearTimeout(wheelEnd);
    surface.removeEventListener('pointerdown', down);
    surface.removeEventListener('pointerup', up);
    surface.removeEventListener('pointercancel', cancel);
    surface.removeEventListener('wheel', wheel);
  };
}

export function useCompanionPagedScroll(surfaceRef: RefObject<HTMLElement | null>, editing: boolean,
  hasReadingSelection: () => boolean) {
  const selectionRef = useRef(hasReadingSelection);
  selectionRef.current = hasReadingSelection;
  const hasSelection = useCallback(() => selectionRef.current(), []);
  const mode = useCompanionReadingMode();
  const paged = mode === 'paged' && !editing;
  useRegisterCompanionReadingPages(surfaceRef, paged, hasSelection);
  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface && paged) return attachPagedScrolling(surface, hasSelection);
  }, [hasSelection, paged, surfaceRef]);
  return paged ? { overflowY: 'hidden' as const, touchAction: 'pan-x pinch-zoom' } : undefined;
}
