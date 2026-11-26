import { companionReadingSurfaceClassName, companionReviewSurfaceClassName } from './companionCssCompatibility';
import { useCompanionReadingDisplay } from './companionReadingDisplay';

import './companionReadingDisplay.css';

const editingArticlePadding = ' pt-14 supports-[padding-top:calc(0px)]:[padding-top:calc(env(safe-area-inset-top)+3.5rem+var(--companion-system-chrome-top,0px))] pb-20 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),80px)]';

/** The reading surface's classes and the attributes that select its body geometry; editing lays itself out. */
export function useCompanionReadingDisplayLayout(flow: boolean | undefined, editing: boolean, breadcrumb: boolean) {
  const { overlayToolbars } = useCompanionReadingDisplay();
  const article = `${companionReadingSurfaceClassName} flex flex-col${editing ? editingArticlePadding : ''}`;
  return {
    className: flow ? companionReviewSurfaceClassName : article,
    bodyAttributes: editing ? {} : {
      'data-reading-body': overlayToolbars ? 'floating' : 'docked',
      'data-reading-breadcrumb': breadcrumb || undefined
    }
  };
}
