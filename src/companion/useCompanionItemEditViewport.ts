import { useLayoutEffect, type RefObject } from 'react';

/** Follow both resize-based native keyboards and visual-viewport-only browser keyboards. */
export function useCompanionItemEditViewport(ref: RefObject<HTMLElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const surface = ref.current;
    if (!active || !surface) return;
    const viewport = window.visualViewport;
    const update = () => {
      surface.style.setProperty('--companion-edit-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      surface.style.setProperty('--companion-edit-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    const scrollTop = surface.scrollTop;
    surface.scrollTop = 0;
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      surface.style.removeProperty('--companion-edit-viewport-height');
      surface.style.removeProperty('--companion-edit-viewport-top');
      surface.scrollTop = scrollTop;
    };
  }, [active, ref]);
}
