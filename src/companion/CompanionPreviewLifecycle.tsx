import { useEffect } from 'react';

import { closeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';

import { useCompanionNavigationFlush } from './CompanionNavigationProvider';
import type { CompanionReadingActivity } from './companionReadingActivity';

declare global {
  interface Window {
    __foliolePreviewFlush?: () => Promise<void>;
    __foliolePreviewUnmount?: () => void;
    __FOLIOLE_COMPANION_PREVIEW_HOST__?: string;
  }
}

/** The development shell can drain product-owned work without owning its persistence logic. */
export function CompanionPreviewLifecycle(props: { activity: CompanionReadingActivity; ready: boolean; destination: string }) {
  const flushNavigation = useCompanionNavigationFlush();
  useEffect(() => {
    const flush = async () => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      await props.activity.flush();
      await flushNavigation();
      window.__foliolePreviewUnmount?.();
      await runCompanionSyncWriterTask(async () => undefined);
      await closeIosCompanionDatabase();
    };
    window.__foliolePreviewFlush = flush;
    return () => {
      if (window.__foliolePreviewFlush === flush) delete window.__foliolePreviewFlush;
    };
  }, [props.activity, flushNavigation]);
  return <span hidden data-companion-preview-ready={props.ready ? 'true' : 'false'}
    data-companion-preview-destination={props.destination} />;
}
