import { DESKTOP_REMINDER_OPEN_DIVE_PREFIX } from '../../../lib/platform/nativeReminderContract';
import { listVisibleDives, resolveDiveMembership } from '../../shared/diveMembership';
import type { Translate } from '../../shared/localization/LocalizationProvider';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

export function runReminderDiveCommand(id: string, openDive: WorkspaceLayoutProps['review']['onOpenDiveFlow'], t: Translate) {
  if (!id.startsWith(DESKTOP_REMINDER_OPEN_DIVE_PREFIX)) return false;
  const diveId = id.slice(DESKTOP_REMINDER_OPEN_DIVE_PREFIX.length);
  const snapshot = useWorkspaceStore.getState();
  const dive = listVisibleDives(snapshot).find(entry => entry.id === diveId);
  if (!dive || !openDive) {
    showAppRuntimeNotice(t('settings.reminders.diveUnavailable'));
    return true;
  }
  void openDive({ id: dive.id, topicIds: resolveDiveMembership(snapshot, dive).topics });
  return true;
}
