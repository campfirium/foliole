import { ArrowLeft, Monitor } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { FOLIOLE_RELEASE_LINKS } from '../../shared/platform/releaseLinks';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import './WorkspaceDemoViewportGate.css';

export const DEMO_DESKTOP_MIN_WIDTH_PX = 900;

function subscribeViewportWidth(listener: () => void) {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}

function getViewportWidth() {
  return window.innerWidth;
}

export function WorkspaceDemoViewportGate({ children }: { children: ReactNode }) {
  const t = useTranslation();
  const { isDemo } = useDemoRuntimeState();
  const width = useSyncExternalStore(subscribeViewportWidth, getViewportWidth, () => DEMO_DESKTOP_MIN_WIDTH_PX);

  if (!isDemo || width >= DEMO_DESKTOP_MIN_WIDTH_PX) {
    return children;
  }

  return (
    <section aria-label={t('desktop.demo.narrow.aria')} className="demo-width-notice">
      <div className="demo-width-notice__content">
        <Monitor aria-hidden="true" className="demo-width-notice__icon" size={36} strokeWidth={1.5} />
        <h1>{t('desktop.demo.narrow.title')}</h1>
        <p>{t('desktop.demo.narrow.description')}</p>
        <a href={FOLIOLE_RELEASE_LINKS.homepage}>
          <ArrowLeft aria-hidden="true" size={16} />
          {t('desktop.workspace.demo.home')}
        </a>
      </div>
    </section>
  );
}
