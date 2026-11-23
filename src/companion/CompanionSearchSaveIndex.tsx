import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { createCompanionUuid } from '../shared/platform/companionUuid';
import { isAvailableNativeCompanionRuntime } from '../shared/platform/companionWorkspaceRuntimeRepository';
import { AppButton } from '../shared/ui';

import { useCompanionWorkspaceActions } from './CompanionWorkspaceActions';

/** Saves the current keyword as a saved-search index under Virtual, named after the keyword as on desktop. */
export function CompanionSearchSaveIndex({ query }: { query: string }) {
  const actions = useCompanionWorkspaceActions();
  const t = useTranslation();
  const [savedKeyword, setSavedKeyword] = useState<string | null>(null);
  const keyword = query.trim();
  if (!actions || !keyword || !isAvailableNativeCompanionRuntime()) return null;
  if (savedKeyword === keyword) {
    return <p role="status" className="mt-3 text-sm text-companion-text-secondary">{t('companion.search.savedAsIndex')}</p>;
  }
  return <AppButton className="mt-3 w-full" variant="ghost" disabled={actions.busy || actions.pending}
    onClick={() => void actions.execute({ type: 'create-index', nodeId: `node-${createCompanionUuid()}`, title: keyword, keyword },
      () => setSavedKeyword(keyword))}>
    {t('companion.search.saveAsIndex')}
  </AppButton>;
}
