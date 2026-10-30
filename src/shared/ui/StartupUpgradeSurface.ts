import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { NativeDatabaseUpgradeStatus } from '../../../lib/platform/nativeDatabaseUpgradeContract';
import { getStoredAppLocale } from '../localization/appLanguage';
import { translate, type TranslationKey } from '../localization/translations';

import { StartupLoadingSurface } from './StartupLoadingSurface';

const POLL_INTERVAL_MS = 500;

function t(key: TranslationKey) {
  return translate(getStoredAppLocale(), key);
}

/** Shares quiet, spinner and detailed waiting phases with companion startup. */
export function watchStartupDatabaseUpgrade(loadStatus: () => Promise<NativeDatabaseUpgradeStatus>) {
  const startedAt = Date.now();
  let overlay: HTMLElement | null = null;
  let root: Root | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const dispose = () => {
    disposed = true;
    globalThis.clearTimeout(timer);
    root?.unmount();
    overlay?.remove();
  };
  const show = (status: Exclude<NativeDatabaseUpgradeStatus, { state: 'ready' }>) => {
    if (!overlay) {
      overlay = document.createElement('div');
      // A later sibling at the skeleton's stacking level paints above it.
      overlay.className = 'fixed inset-0 z-[2147483647]';
      overlay.dataset.startupUpgrade = 'true';
      document.body.append(overlay);
      root = createRoot(overlay);
    }
    const upgrading = status.state === 'upgrading';
    root?.render(createElement(StartupLoadingSurface, {
      startedAt,
      title: t(upgrading ? 'shared.startup.upgradeTitle' : 'shared.startup.bootTitle'),
      ...(upgrading ? {
        description: t('shared.startup.upgradeHelp'),
        progress: status,
        progressLabel: t('shared.startup.upgradeProgress')
      } : {})
    }));
  };
  const poll = async () => {
    const status = await loadStatus().catch(() => ({ state: 'ready' as const }));
    if (disposed) return;
    if (status.state === 'ready') {
      dispose();
      return;
    }
    show(status);
    timer = globalThis.setTimeout(() => void poll(), POLL_INTERVAL_MS);
  };
  void poll();
  return dispose;
}
