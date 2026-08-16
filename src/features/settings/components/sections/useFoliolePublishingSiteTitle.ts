import { useRef, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';

import {
  persistFoliolePublishingSiteTitle,
  type FoliolePublishingDraftState
} from './useFoliolePublishingDraft';

export function useFoliolePublishingSiteTitle(state: FoliolePublishingDraftState, previewDesktopSettings = false) {
  const t = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);

  const rejectEmpty = () => {
    setInvalid(true);
    queueMicrotask(() => inputRef.current?.focus());
    return false;
  };
  const requireSiteTitle = async () => {
    if (!state.form.siteTitle.trim()) return rejectEmpty();
    if (previewDesktopSettings) {
      setInvalid(false);
      return true;
    }
    try {
      await persistFoliolePublishingSiteTitle(state);
      setInvalid(false);
      return true;
    } catch (reason) {
      state.setError(reason instanceof Error ? reason.message : t('settings.publishing.foliole.siteTitle.error.save'));
      return false;
    }
  };
  const saveSiteTitle = async () => {
    if (!state.form.siteTitle.trim()) return;
    await requireSiteTitle();
  };
  const updateSiteTitle = (siteTitle: string) => {
    setInvalid(false);
    state.setError(null);
    state.setForm((value) => ({ ...value, siteTitle }));
  };

  return {
    requireSiteTitle,
    saveSiteTitle: () => void saveSiteTitle(),
    siteTitleError: invalid ? t('settings.publishing.foliole.siteTitle.required') : undefined,
    siteTitleInputRef: inputRef,
    updateSiteTitle
  };
}
