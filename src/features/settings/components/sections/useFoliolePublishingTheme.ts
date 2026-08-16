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
import { showDemoOperationNotice } from '../../../../shared/ui/DemoOperationNotice';

import type { FoliolePublishingDraftState, FoliolePublishingStatus } from './useFoliolePublishingDraft';

export function useFoliolePublishingTheme(
  state: FoliolePublishingDraftState,
  requireSiteTitle: () => Promise<boolean>,
  previewDesktopSettings = false
) {
  const t = useTranslation();
  const [theme, setTheme] = useState<NativeFoliolePublishThemeStatus | null>(() => previewDesktopSettings
    ? { active_theme: 'foliole', custom_theme: null, official_theme_version: 4 }
    : null);
  useEffect(() => {
    if (previewDesktopSettings) return undefined;
    void loadFoliolePublishThemeFromRuntime().then(setTheme).catch((reason) => {
      state.setError(reason instanceof Error ? reason.message : t('settings.publishing.foliole.theme.error.load'));
    });
    return undefined;
  }, [previewDesktopSettings, state.setError, t]);
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
    openCustomTheme: () => previewDesktopSettings ? showDemoOperationNotice(t) : void openCustomTheme(), theme,
    updateLocal: () => previewDesktopSettings ? showDemoOperationNotice(t) : void runWithSiteTitle('updatingLocal', updateFoliolePublishLocalPagesFromRuntime, 'settings.publishing.foliole.theme.error.updateLocal', true),
    updateWeb: () => previewDesktopSettings ? showDemoOperationNotice(t) : void runWithSiteTitle('updatingWeb', publishFoliolePublishThemeChangesFromRuntime, 'settings.publishing.foliole.theme.error.updateWeb', true),
    useFolioleTheme: () => previewDesktopSettings ? showDemoOperationNotice(t) : void useFolioleTheme()
  };
}
