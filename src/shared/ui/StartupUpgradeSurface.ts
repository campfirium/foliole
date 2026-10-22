import type { NativeDatabaseUpgradeStatus } from '../../../lib/platform/nativeDatabaseUpgradeContract';
import { getStoredAppLocale } from '../localization/appLanguage';
import { translate, type TranslationKey } from '../localization/translations';

const POLL_INTERVAL_MS = 500;
type UpgradeProgress = Extract<NativeDatabaseUpgradeStatus, { state: 'upgrading' }>;

function t(key: TranslationKey) {
  return translate(getStoredAppLocale(), key);
}

function textElement(tagName: string, className: string, text: string) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function createSurface() {
  const overlay = document.createElement('div');
  // The boot skeleton is fixed at the top stacking level; a later sibling at that level paints above it.
  overlay.className = 'fixed inset-0 z-[2147483647] bg-[rgb(var(--color-canvas))]';
  overlay.dataset.startupUpgrade = 'true';
  const section = document.createElement('section');
  section.className = 'startup-surface';
  section.setAttribute('role', 'status');
  const track = document.createElement('div');
  track.className = 'mt-3 h-2 w-full max-w-[360px] overflow-hidden rounded-full bg-foreground/10';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', t('shared.startup.upgradeProgress'));
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  const bar = document.createElement('div');
  bar.className = 'h-full rounded-full bg-foreground/70 transition-[width] duration-200';
  bar.setAttribute('aria-hidden', 'true');
  track.append(bar);
  section.append(textElement('p', 'startup-surface__eyebrow', t('shared.startup.eyebrow')),
    textElement('h1', 'startup-surface__title', t('shared.startup.upgradeTitle')),
    textElement('p', 'startup-surface__message', t('shared.startup.upgradeHelp')), track);
  overlay.append(section);
  return { overlay, bar, track };
}

/**
 * Covers the startup skeleton while an older library is upgraded, then removes itself. The window
 * keeps responding because the upgrade runs off the main process thread.
 */
export function watchStartupDatabaseUpgrade(loadStatus: () => Promise<NativeDatabaseUpgradeStatus>) {
  let surface: ReturnType<typeof createSurface> | null = null;
  const show = (progress: UpgradeProgress) => {
    surface ??= createSurface();
    if (!surface.overlay.isConnected) document.body.append(surface.overlay);
    const percent = progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;
    surface.track.setAttribute('aria-valuenow', String(percent));
    surface.bar.style.width = `${percent}%`;
  };
  const poll = async () => {
    const status = await loadStatus().catch(() => ({ state: 'ready' as const }));
    if (status.state === 'ready') {
      surface?.overlay.remove();
      return;
    }
    if (status.state === 'upgrading') show(status);
    globalThis.setTimeout(() => void poll(), POLL_INTERVAL_MS);
  };
  void poll();
}
