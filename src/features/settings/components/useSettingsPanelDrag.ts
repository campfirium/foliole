import { useRef, type PointerEvent } from 'react';

interface PanelDrag {
  pointerId: number;
  originX: number;
  originY: number;
}

function boundedTranslation(offset: number, viewportHalf: string) {
  return `clamp(-${viewportHalf}, calc(${offset}px - 50%), calc(${viewportHalf} - 100%))`;
}

export function useSettingsPanelDrag() {
  const panelRef = useRef<HTMLDivElement>(null);
  const activeDrag = useRef<PanelDrag | null>(null);

  function start(event: PointerEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel || activeDrag.current || !event.isPrimary || event.button !== 0) return;
    const bounds = panel.getBoundingClientRect();
    activeDrag.current = {
      pointerId: event.pointerId,
      originX: event.clientX - (bounds.left + bounds.width / 2 - window.innerWidth / 2),
      originY: event.clientY - (bounds.top + bounds.height / 2 - window.innerHeight / 2)
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    const drag = activeDrag.current;
    if (!panel || drag?.pointerId !== event.pointerId) return;
    const x = boundedTranslation(event.clientX - drag.originX, '50vw');
    const y = boundedTranslation(event.clientY - drag.originY, '50dvh');
    panel.style.translate = `${x} ${y}`;
  }

  function stop(event: PointerEvent<HTMLDivElement>) {
    if (activeDrag.current?.pointerId === event.pointerId) activeDrag.current = null;
  }

  return {
    panelRef,
    handle: {
      onPointerDown: start,
      onPointerMove: move,
      onLostPointerCapture: stop
    }
  };
}
