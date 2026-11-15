import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../shared/config/appSettings';
import {
  getWhitelistedLocalStorageItem,
  RUNTIME_APP_SETTINGS_SAVED_EVENT,
  saveWhitelistedLocalStorageItem
} from '../../../shared/platform/storage';
import { onMainWindowResized, queryWindowSidebarLayoutMetrics } from '../../../shared/platform/windowControls';

import {
  defaultSidebarTiers, parseSidebarTiers, selectSidebarTier, type SidebarSide, type SidebarTier
} from './sidebarLayoutTiers';

const key = APP_SETTINGS_STORAGE_KEYS.sidebarLayoutTiers;
const changeEvent = 'foliole:sidebar-layout-tiers-changed';
const events = [changeEvent, 'storage', RUNTIME_APP_SETTINGS_SAVED_EVENT];

function subscribe(listener: () => void) {
  events.forEach(event => window.addEventListener(event, listener));
  return () => events.forEach(event => window.removeEventListener(event, listener));
}

function readPreference() {
  return getWhitelistedLocalStorageItem(key);
}

export function useSavedSidebarTiers() {
  const raw = useSyncExternalStore(subscribe, readPreference, () => null);
  return useMemo(() => parseSidebarTiers(raw), [raw]);
}

export async function saveSidebarTiers(tiers: SidebarTier[]) {
  const persisted = saveWhitelistedLocalStorageItem(key, JSON.stringify(tiers));
  window.dispatchEvent(new Event(changeEvent));
  return persisted;
}

export function initializeSidebarTiers(percent: number, previous: Pick<SidebarTier, SidebarSide>) {
  if (readPreference() !== null) return;
  const { listCollapsed, listWidth, rightSidebarCollapsed, rightSidebarWidth } = APP_SETTINGS_STORAGE_KEYS;
  const hasPreviousLayout = [listCollapsed, listWidth, rightSidebarCollapsed, rightSidebarWidth]
    .some(key => getWhitelistedLocalStorageItem(key) !== null);
  const active = selectSidebarTier(defaultSidebarTiers, percent);
  const tiers = hasPreviousLayout
    ? defaultSidebarTiers.map(tier => tier === active ? { ...tier, ...previous } : tier)
    : defaultSidebarTiers;
  void saveSidebarTiers(tiers);
}

export function saveSidebarTierWidth(id: string, side: SidebarSide, width: number) {
  const current = parseSidebarTiers(readPreference());
  if (!current?.some(tier => tier.id === id)) return;
  void saveSidebarTiers(current.map(tier =>
    tier.id === id ? { ...tier, [side]: { ...tier[side], width } } : tier
  ));
}

export function resetSidebarTierWidths(id: string, percent: number) {
  const current = parseSidebarTiers(readPreference());
  const defaults = selectSidebarTier(defaultSidebarTiers, percent);
  if (!current?.some(tier => tier.id === id) || !defaults) return;
  void saveSidebarTiers(current.map(tier => tier.id === id ? {
    ...tier,
    left: { ...tier.left, width: defaults.left.width },
    right: { ...tier.right, width: defaults.right.width }
  } : tier));
}

export function useSidebarLayoutWindowPercent() {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      const metrics = await queryWindowSidebarLayoutMetrics().catch(() => null);
      if (!mounted || request !== revision) return;
      setPercent(metrics ? 100 * metrics.windowWidth / metrics.workAreaWidth : null);
    };
    const subscription = onMainWindowResized(() => { void refresh(); });
    void refresh();
    return () => {
      mounted = false;
      void subscription.then(unlisten => unlisten?.());
    };
  }, []);
  return percent;
}
