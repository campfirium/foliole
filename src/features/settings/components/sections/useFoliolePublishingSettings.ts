import { normalizeCloudflareProjectName } from '../../../../../lib/core/foliolePublish/cloudflarePagesProjectName';
import type { NativeFoliolePublishSettings } from '../../../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { probeUrlWithLinkPanel } from '../../../../shared/platform/external/linkPanelUrlProbe';
import {
  connectFoliolePublishSettingsToRuntime,
  disconnectFoliolePublishSettingsFromRuntime,
  openFoliolePublishThemeFromRuntime,
  publishFoliolePublishThemeChangesFromRuntime,
  resetFoliolePublishThemeFromRuntime,
  updateFoliolePublishLocalPagesFromRuntime,
  updateFoliolePublishSiteAddressInRuntime,
  viewFoliolePublishSiteFromRuntime
} from '../../../../shared/platform/foliolePublishRepository';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';
import { requestAppConfirmation } from '../../../../shared/ui';

import { isCloudflareAccountId, isCloudflareApiToken } from './cloudflareCredentialValidation';
import {
  EMPTY_FOLIOLE_PUBLISHING_FORM,
  foliolePublishingCustomDomain,
  foliolePublishingFormFromSettings,
  persistFoliolePublishingDraft,
  useFoliolePublishingDraftState,
  type FoliolePublishingDraftState,
  type FoliolePublishingForm,
  type FoliolePublishingStatus
} from './useFoliolePublishingDraft';

type LoadedState = FoliolePublishingDraftState;
type Translate = ReturnType<typeof useTranslation>;

function applySettings(state: LoadedState, value: NativeFoliolePublishSettings) {
  state.setSettings(value); state.setForm(foliolePublishingFormFromSettings(value));
}

function confirmSubdomain(t: Translate, detected: boolean) {
  return requestAppConfirmation({
    cancelLabel: t('settings.publishing.foliole.subdomain.change'),
    confirmLabel: t('settings.publishing.foliole.subdomain.continue'),
    description: t(detected
      ? 'settings.publishing.foliole.subdomain.detected.description'
      : 'settings.publishing.foliole.subdomain.notDetected.description'),
    title: t(detected
      ? 'settings.publishing.foliole.subdomain.detected.title'
      : 'settings.publishing.foliole.subdomain.notDetected.title')
  });
}

function connectWithDraft(settings: NativeFoliolePublishSettings) {
  return connectFoliolePublishSettingsToRuntime({
    account_id: settings.account_id, api_token: '',
    confirm_subdomain_risk: true, project_name: settings.project_name,
    site_address: ''
  });
}

function useConnectionActions(state: LoadedState) {
  const t = useTranslation();
  const deploy = async () => {
    state.setStatus('connecting'); state.setError(null);
    try {
      const draft = await persistFoliolePublishingDraft(state, state.form);
      const projectName = normalizeCloudflareProjectName(draft.project_name);
      const detected = await probeUrlWithLinkPanel(`https://${projectName}.pages.dev`);
      if (!await confirmSubdomain(t, detected)) return;
      const result = await connectWithDraft(draft);
      if (result.status === 'subdomain_unavailable') {
        state.setError(t('settings.publishing.foliole.subdomain.unavailable'));
        return;
      }
      if (result.status === 'connected') applySettings(state, result.settings);
    } catch (reason) { state.setError(reason instanceof Error ? reason.message : "Couldn't create the Cloudflare site."); }
    finally { state.setStatus('idle'); }
  };
  const disconnect = async () => {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('settings.publishing.foliole.delete.cancel'),
      confirmLabel: t('settings.publishing.foliole.delete.confirm'),
      description: t('settings.publishing.foliole.delete.description'),
      title: t('settings.publishing.foliole.delete.title')
    });
    if (!confirmed) return;
    state.setStatus('disconnecting'); state.setError(null);
    try {
      const value = await disconnectFoliolePublishSettingsFromRuntime();
      state.setSettings(value); state.setForm(EMPTY_FOLIOLE_PUBLISHING_FORM);
    } catch { state.setError(t('settings.publishing.foliole.error.delete')); }
    finally { state.setStatus('idle'); }
  };
  return { deploy: () => void deploy(), disconnect: () => void disconnect() };
}

function siteActions(state: LoadedState) {
  const viewLocal = async () => {
    state.setStatus('viewingLocal'); state.setError(null);
    try { await viewFoliolePublishSiteFromRuntime(); }
    catch { state.setError("Couldn't open the local static pages."); }
    finally { state.setStatus('idle'); }
  };
  const viewWeb = async () => {
    if (!state.settings?.site_address) return;
    state.setStatus('viewingWeb'); state.setError(null);
    try { await openExternalUrl(state.settings.site_address); }
    catch { state.setError("Couldn't open the Web pages."); }
    finally { state.setStatus('idle'); }
  };
  const updateSiteAddress = async () => {
    state.setStatus('updating'); state.setError(null);
    try { applySettings(state, await updateFoliolePublishSiteAddressInRuntime(state.form.customDomain.trim())); }
    catch (reason) {
      if (state.settings) state.setForm(foliolePublishingFormFromSettings(state.settings));
      state.setError(reason instanceof Error ? reason.message : "Couldn't update the public address.");
    }
    finally { state.setStatus('idle'); }
  };
  return {
    updateSiteAddress: () => void updateSiteAddress(),
    viewLocal: () => void viewLocal(), viewWeb: () => void viewWeb()
  };
}

function useThemeActions(state: LoadedState) {
  const t = useTranslation();
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
    }
    finally { state.setStatus('idle'); }
  };
  const resetTheme = async () => {
    const confirmed = await requestAppConfirmation({
      cancelLabel: t('common.cancel'), confirmLabel: t('settings.publishing.foliole.theme.reset'),
      description: t('settings.publishing.foliole.theme.resetConfirm.description'),
      title: t('settings.publishing.foliole.theme.resetConfirm.title')
    });
    if (confirmed) await run('resettingTheme', resetFoliolePublishThemeFromRuntime, 'settings.publishing.foliole.theme.error.reset');
  };
  return {
    openTheme: () => void run('openingTheme', openFoliolePublishThemeFromRuntime, 'settings.publishing.foliole.theme.error.open'),
    resetTheme: () => void resetTheme(),
    updateLocal: () => void run('updatingLocal', updateFoliolePublishLocalPagesFromRuntime, 'settings.publishing.foliole.theme.error.updateLocal', true),
    updateWeb: () => void run('updatingWeb', publishFoliolePublishThemeChangesFromRuntime, 'settings.publishing.foliole.theme.error.updateWeb', true)
  };
}

export function useFoliolePublishingSettings() {
  const state = useFoliolePublishingDraftState();
  const connection = useConnectionActions(state);
  const site = siteActions(state);
  const theme = useThemeActions(state);
  const disabled = state.status !== 'idle';
  const connected = Boolean(state.settings?.pages_url && state.settings.account_id && state.settings.project_name);
  const hasSavedToken = Boolean(state.settings?.has_credentials);
  const savedCustomDomain = state.settings ? foliolePublishingCustomDomain(state.settings) : '';
  const updateForm = (patch: Partial<FoliolePublishingForm>) => {
    state.setError(null); state.setForm((value) => ({ ...value, ...patch }));
  };
  const accountIdInvalid = Boolean(state.form.accountId) && !isCloudflareAccountId(state.form.accountId);
  const apiTokenInvalid = Boolean(state.form.apiToken) && !isCloudflareApiToken(state.form.apiToken);
  const tokenReady = state.form.apiToken
    ? isCloudflareApiToken(state.form.apiToken)
    : Boolean(state.settings?.credentials_valid);
  const saveDraft = async () => {
    if (connected) return;
    state.setError(null);
    try {
      await persistFoliolePublishingDraft(state, state.form);
      state.setError(null);
    } catch (reason) { state.setError(reason instanceof Error ? reason.message : "Couldn't save Foliole Publish settings."); }
  };
  return {
    accountIdInvalid, apiTokenInvalid,
    canDeploy: !disabled && isCloudflareAccountId(state.form.accountId)
      && tokenReady && Boolean(state.form.projectName.trim()),
    canUpdateWeb: connected && !disabled,
    canUpdateAddress: connected && !disabled && state.form.customDomain.trim() !== savedCustomDomain,
    canViewWeb: connected && !disabled && Boolean(state.settings?.site_address),
    connected, disabled, error: state.error, form: state.form, hasSavedToken, pagesUrl: state.settings?.pages_url ?? '',
    saveDraft: () => void saveDraft(),
    siteAddress: state.settings?.site_address ?? '', status: state.status,
    ...connection, ...site, ...theme, updateForm
  };
}

export type FoliolePublishingSettingsState = ReturnType<typeof useFoliolePublishingSettings>;
