import { notifyDesktopSyncGroupOverviewChanged } from './desktopSyncGroupOverviewNotifier.js';

type DiscoverySide = 'topology' | 'member';
const errors: Record<DiscoverySide, Error | null> = { topology: null, member: null };

export function setDesktopSyncGroupDiscoveryError(side: DiscoverySide, error: Error | null) {
  if (errors[side] === error) return;
  errors[side] = error;
  notifyDesktopSyncGroupOverviewChanged();
}

export function clearDesktopSyncGroupDiscoveryErrors() {
  if (!errors.topology && !errors.member) return;
  errors.topology = null;
  errors.member = null;
  notifyDesktopSyncGroupOverviewChanged();
}

export function loadDesktopSyncGroupDiscoveryError() {
  const error = errors.topology ?? errors.member;
  if (!error) return null;
  return /EACCES|EPERM|permission/iu.test(error.message)
    || (process.platform === 'darwin' && /desktop_dnssd_\w+_failed: -65570\b/u.test(error.message))
    ? 'permission_required' as const : 'unavailable' as const;
}
