import { useEffect, useState } from 'react';

import type { NativeFoliolePublishThemeStatus } from '../../../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  loadFoliolePublishThemeFromRuntime,
  openFoliolePublishCustomThemeFromRuntime,
  publishFoliolePublishThemeChangesFromRuntime,
  updateFoliolePublishLocalPagesFromRuntime,
  useFoliolePublishThemeFromRuntime
} from '../../../../shared/platform/foliolePublishRepository';

import type { FoliolePublishingDraftState, FoliolePublishingStatus } from './useFoliolePublishingDraft';

export function useFoliolePublishingTheme(
  state: FoliolePublishingDraftState,
  requireSiteTitle: () => Promise<boolean>
) {
  const t = useTranslation();
  const [theme, setTheme] = useState<NativeFoliolePublishThemeStatus | null>(null);
  useEffect(() => {
    void loadFoliolePublishThemeFromRuntime().then(setTheme).catch((reason) => {
      state.setError(reason instanceof Error ? reason.message : t('settings.publishing.foliole.theme.error.load'));
    });
  }, [state.setError, t]);
  const run = async (
    status: FoliolePublishingStatus,
    action: () => Promise<unknown>,
    errorKey: Parameters<typeof t>[0],
    showRuntimeError = false
  ) => {
    state.setStatus(status); state.setError(null);
    try { await action(); }
    catch (reason) {
      state.setError(showRuntimeError && reason instanceof Error ? reason.message : t(errorKey));
    } finally { state.setStatus('idle'); }
  };
  const openCustomTheme = () => run('openingCustomTheme', async () => {
    const result = await openFoliolePublishCustomThemeFromRuntime();
    setTheme(result.theme);
  }, 'settings.publishing.foliole.theme.error.open');
  const useFolioleTheme = () => run('usingFolioleTheme', async () => {
    const result = await useFoliolePublishThemeFromRuntime();
    setTheme(result.theme);
  }, 'settings.publishing.foliole.theme.error.useFoliole');
  const runWithSiteTitle = async (...args: Parameters<typeof run>) => {
    if (await requireSiteTitle()) await run(...args);
  };
  return {
    openCustomTheme: () => void openCustomTheme(), theme,
    updateLocal: () => void runWithSiteTitle('updatingLocal', updateFoliolePublishLocalPagesFromRuntime, 'settings.publishing.foliole.theme.error.updateLocal', true),
    updateWeb: () => void runWithSiteTitle('updatingWeb', publishFoliolePublishThemeChangesFromRuntime, 'settings.publishing.foliole.theme.error.updateWeb', true),
    useFolioleTheme: () => void useFolioleTheme()
  };
}
