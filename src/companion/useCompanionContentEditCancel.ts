import { useTranslation } from '../shared/localization/LocalizationProvider';
import { requestAppConfirmation } from '../shared/ui/appConfirmation';

import type { CompanionReadingActivity } from './companionReadingActivity';

/** Cancel returns the topic to where this editing round began; autosaved input is reverted as a new edit. */
export function useCompanionContentEditCancel(activity: CompanionReadingActivity | undefined, finish: () => void) {
  const t = useTranslation();
  return async function cancelContentEditing() {
    try { await activity?.flush(); } catch { return; }
    const round = activity?.editRound;
    if (round?.hasChanges()) {
      const confirmed = await requestAppConfirmation({
        title: t('companion.reading.discardEdits.title'),
        description: t('companion.reading.discardEdits.description'),
        confirmLabel: t('companion.reading.discardEdits.confirm'),
        cancelLabel: t('companion.reading.discardEdits.keep')
      });
      if (!confirmed) return;
      const result = await round.revert().catch(() => null);
      if (!result) return;
      if (result === 'blocked') {
        await requestAppConfirmation({
          title: t('companion.reading.discardEdits.blockedTitle'),
          description: t('companion.reading.discardEdits.blockedDescription'),
          confirmLabel: t('companion.reading.discardEdits.blockedAction'),
          cancelLabel: null
        });
        return;
      }
    }
    finish();
  };
}
