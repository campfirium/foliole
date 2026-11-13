import { useEffect, type RefObject } from 'react';

import { hasOpenSidebarMenu, type CompactWorkspaceSidebars, type WorkspaceSidebarSide } from '../hooks/useCompactWorkspaceSidebars';

const EDGE_FRACTION = 0.1;
const OPEN_DELAY = 300;
const CLOSE_DELAY = 180;

function readEdge(event: PointerEvent, grid: HTMLElement, leftFloating: boolean, rightFloating: boolean) {
  const scroller = grid.querySelector<HTMLElement>('.pdf-document-scroll-container');
  if (!scroller) return null;
  const bounds = scroller.getBoundingClientRect();
  if (event.clientY < bounds.top || event.clientY >= bounds.top + scroller.clientHeight) return null;
  if (event.clientX >= bounds.left + scroller.clientWidth && event.clientX < bounds.right) return null;
  const width = window.innerWidth;
  const zone = width * EDGE_FRACTION;
  if (leftFloating && event.clientX >= 0 && event.clientX < zone) return 'left';
  if (rightFloating && event.clientX < width && event.clientX >= width - zone) return 'right';
  return null;
}

export function useWorkspaceSidebarHover(sidebars: CompactWorkspaceSidebars, edgeRef: RefObject<HTMLElement | null>) {
  const { dismiss, hoverEnabled, isHoverOpen, leftFloating, openOnHover, openSide, rightFloating } = sidebars;
  useEffect(() => {
    const grid = edgeRef.current?.parentElement;
    if (!hoverEnabled || !grid || !openOnHover || (openSide && !isHoverOpen)) return;

    let timer: number | undefined;
    let pending: WorkspaceSidebarSide | 'close' | null = null;
    let lastWheel = -Infinity;
    const cancel = () => {
      window.clearTimeout(timer);
      pending = null;
    };
    const schedule = (action: NonNullable<typeof pending>) => {
      if (pending === action) return;
      cancel();
      pending = action;
      timer = window.setTimeout(() => {
        pending = null;
        if (action === 'close') {
          if (!hasOpenSidebarMenu()) dismiss();
        } else openOnHover(action);
      }, action === 'close' ? CLOSE_DELAY : OPEN_DELAY);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const edge = readEdge(event, grid, leftFloating, rightFloating);
      const panel = grid.querySelector<HTMLElement>(`.workspace-floating-sidebar-${openSide}`);
      const target = event.target;
      if (openSide && target instanceof Element && (
        panel?.contains(target) || target.closest(openSide === 'right' ? '.window-titlebar-right-anchor-shell' : '.window-titlebar-left-zone')
      )) return cancel();
      if (openSide) return event.buttons ? cancel() : schedule('close');
      if (!edge || event.buttons || performance.now() - lastWheel < OPEN_DELAY) return cancel();
      schedule(edge);
    };
    const wheel = () => {
      lastWheel = performance.now();
      if (pending !== 'close') cancel();
    };
    const leave = () => openSide ? schedule('close') : cancel();
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('wheel', wheel, { capture: true, passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    return () => {
      cancel();
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('wheel', wheel, true);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', leave);
    };
  }, [dismiss, edgeRef, hoverEnabled, isHoverOpen, leftFloating, openOnHover, openSide, rightFloating]);
}
