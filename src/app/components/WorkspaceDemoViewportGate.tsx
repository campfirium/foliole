import { useSyncExternalStore, type ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { AppButton } from '../../shared/ui';

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
    <main aria-label={t('desktop.demo.narrow.aria')} className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <section className="max-w-sm border border-border/60 bg-bg-elevated px-5 py-5 shadow-panel">
        <h1 className="m-0 text-base font-semibold leading-6">{t('desktop.demo.narrow.title')}</h1>
        <p className="m-0 mt-2 text-sm leading-6 text-foreground/70">{t('desktop.demo.narrow.description')}</p>
        <AppButton className="mt-4" onClick={() => window.open(window.location.href, '_blank', 'noopener,noreferrer')} size="sm" variant="default">
          {t('desktop.demo.narrow.openWindow')}
        </AppButton>
      </section>
    </main>
  );
}
