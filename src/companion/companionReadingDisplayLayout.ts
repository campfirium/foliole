import { companionReadingSurfaceClassName, companionReviewSurfaceClassName } from './companionCssCompatibility';
import { useCompanionReadingDisplay } from './companionReadingDisplay';

import './companionReadingDisplay.css';

export function useCompanionReadingDisplayLayout(flow: boolean | undefined, editing: boolean) {
  const { overlayToolbars } = useCompanionReadingDisplay();
  const reserved = 'pt-14 supports-[padding-top:calc(0px)]:[padding-top:calc(env(safe-area-inset-top)+3.5rem)] pb-20 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),80px)]';
  const base = flow ? companionReviewSurfaceClassName : `${companionReadingSurfaceClassName} flex flex-col ${reserved}`;
  return `${base}${overlayToolbars && !editing ? ' companion-reading-overlay' : ''}`;
}
