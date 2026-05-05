import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

import type { LinkPanelViewportBounds } from './linkPanelViewport';

function getFallbackBounds(): LinkPanelViewportBounds {
  return {
    left: 0,
    top: 0,
    windowHeight: typeof window === 'undefined' ? 900 : window.innerHeight,
    windowWidth: typeof window === 'undefined' ? 1440 : window.innerWidth
  };
}

export function useLinkPanelViewportBounds(rootRef: RefObject<HTMLDivElement>) {
  const [bounds, setBounds] = useState<LinkPanelViewportBounds>(() => getFallbackBounds());

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }

    const updateBounds = () => {
      const rect = element.getBoundingClientRect();
      setBounds({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        windowHeight: window.innerHeight,
        windowWidth: window.innerWidth
      });
    };

    updateBounds();
    const observer = new ResizeObserver(() => updateBounds());
    observer.observe(element);
    window.addEventListener('resize', updateBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
    };
  }, [rootRef]);

  return bounds;
}
