import { readReviewCalendarHistoryWithDb } from '../../../../../lib/core/database/reviewCalendarHistory';
import { readReviewCalendarScheduleWithDb } from '../../../../../lib/core/database/reviewCalendarSchedule';
import type { NativeReviewCalendarArgs } from '../../../../../lib/platform/nativeReviewCalendarContract';
import { getCurrentReviewSchedulerSettings } from '../../../../features/settings/model/reviewSchedulerSettings';
import { getCompanionRuntimeCapability, hasCompanionLocalDatabase } from '../../companionRuntimeCapabilities';

import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

export async function loadCompanionReviewCalendar(args: NativeReviewCalendarArgs) {
  if (!hasCompanionLocalDatabase(getCompanionRuntimeCapability())) {
    throw new Error('Review calendar requires the library runtime');
  }
  const owner = getIosCompanionDatabaseOwner();
  const hour = getCurrentReviewSchedulerSettings().newDayStartsAtHour;
  return owner.read(db => db.transaction(async tx => {
    const [host] = await tx.query<{ value: string }>("SELECT value FROM companion_meta WHERE key = 'host_name'");
    if (!host?.value.trim() || (args.libraryScope && host.value.trim() !== args.libraryScope) || getIosCompanionDatabaseOwner() !== owner) {
      throw new Error('calendar_library_changed');
    }
    const history = await readReviewCalendarHistoryWithDb(tx, args, hour);
    const scheduledDays = await readReviewCalendarScheduleWithDb(tx, args.now, hour);
    if (getIosCompanionDatabaseOwner() !== owner) throw new Error('calendar_library_changed');
    return { ...history, scheduledDays };
  }));
}
