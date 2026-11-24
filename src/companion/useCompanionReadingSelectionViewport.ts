import { useLayoutEffect, type ReactNode, type RefObject } from 'react';

import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';

const EXPANDED_TOP_CHROME_BOTTOM = 'calc(max(env(safe-area-inset-top, 0px), var(--companion-system-chrome-top, 0px)) + 3rem)';

export function useCompanionReadingSelectionViewport(
  surfaceRef: RefObject<HTMLElement | null>,
  editing: boolean,
  chromeVisible: boolean,
  header: ReactNode,
  footer: ReactNode
) {
  const bounded = !editing && getCompanionRuntimeCapability().kind === 'android-native';
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!bounded || !surface) return;
    const topChrome = surface.querySelector(':scope > .companion-reading-top-chrome');
    const breadcrumb = surface.querySelector(':scope > .companion-review-header');
    const bottomChrome = surface.querySelector(':scope > .companion-reading-bottom-chrome');
    const reviewFooter = surface.querySelector(':scope > .companion-review-footer')
      ?? surface.closest('main')?.nextElementSibling?.closest('.companion-review-footer');
    const status = reviewFooter?.querySelector(':scope > [role="status"]');

    const update = () => {
      // Floating toolbars unmount when hidden; hold the expanded toolbar band so the body does not move.
      const top = topChrome ? `${topChrome.getBoundingClientRect().bottom}px` : EXPANDED_TOP_CHROME_BOTTOM;
      const headerHeight = breadcrumb?.getBoundingClientRect().height ?? 0;
      const footerTop = Math.min(...[bottomChrome, reviewFooter, status]
        .map(element => element?.getBoundingClientRect().top ?? window.innerHeight));
      surface.style.setProperty('--companion-reading-chrome-bottom', top);
      surface.style.setProperty('--companion-reading-breadcrumb-height', `${headerHeight}px`);
      surface.style.setProperty('--companion-reading-viewport-bottom', `${Math.max(0, window.innerHeight - footerTop)}px`);
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    for (const element of [topChrome, breadcrumb, bottomChrome, reviewFooter, status]) {
      if (element) observer?.observe(element);
    }
    window.addEventListener('resize', update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      surface.style.removeProperty('--companion-reading-chrome-bottom');
      surface.style.removeProperty('--companion-reading-breadcrumb-height');
      surface.style.removeProperty('--companion-reading-viewport-bottom');
    };
  }, [bounded, surfaceRef, chromeVisible, header, footer]);
  return bounded;
}
