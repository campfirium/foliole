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
import { useFoliolePublishingSiteTitle } from './useFoliolePublishingSiteTitle';

type LoadedState = FoliolePublishingDraftState;
type Translate = ReturnType<typeof useTranslation>;

function applySettings(state: LoadedState, value: NativeFoliolePublishSettings) {
  state.setSettings(value);
  state.setForm((current) => foliolePublishingFormFromSettings(value, current.siteTitle));
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

function useConnectionActions(state: LoadedState, requireSiteTitle: () => Promise<boolean>) {
  const t = useTranslation();
  const deploy = async () => {
    if (!await requireSiteTitle()) return;
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
      state.setSettings(value);
      state.setForm((current) => ({ ...EMPTY_FOLIOLE_PUBLISHING_FORM, siteTitle: current.siteTitle }));
    } catch { state.setError(t('settings.publishing.foliole.error.delete')); }
    finally { state.setStatus('idle'); }
  };
  return { deploy: () => void deploy(), disconnect: () => void disconnect() };
}

function siteActions(state: LoadedState, requireSiteTitle: () => Promise<boolean>) {
  const viewLocal = async () => {
    if (!await requireSiteTitle()) return;
    state.setStatus('viewingLocal'); state.setError(null);
    try { await viewFoliolePublishSiteFromRuntime(); }
    catch { state.setError("Couldn't open the local static pages."); }
    finally { state.setStatus('idle'); }
  };
  const viewWeb = async () => {
    if (!await requireSiteTitle()) return;
    if (!state.settings?.site_address) return;
    state.setStatus('viewingWeb'); state.setError(null);
    try { await openExternalUrl(state.settings.site_address); }
    catch { state.setError("Couldn't open the Web pages."); }
    finally { state.setStatus('idle'); }
  };
  const updateSiteAddress = async () => {
    if (!await requireSiteTitle()) return;
    state.setStatus('updating'); state.setError(null);
    try { applySettings(state, await updateFoliolePublishSiteAddressInRuntime(state.form.customDomain.trim())); }
    catch (reason) {
      const settings = state.settings;
      if (settings) {
        state.setForm((current) => foliolePublishingFormFromSettings(settings, current.siteTitle));
      }
      state.setError(reason instanceof Error ? reason.message : "Couldn't update the public address.");
    }
    finally { state.setStatus('idle'); }
  };
  const visitPages = async () => {
    if (await requireSiteTitle() && state.settings?.pages_url) await openExternalUrl(state.settings.pages_url);
  };
  return {
    updateSiteAddress: () => void updateSiteAddress(),
    visitPages: () => void visitPages(),
    viewLocal: () => void viewLocal(), viewWeb: () => void viewWeb()
  };
}

function useThemeActions(state: LoadedState, requireSiteTitle: () => Promise<boolean>) {
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
  const runWithSiteTitle = async (...args: Parameters<typeof run>) => {
    if (await requireSiteTitle()) await run(...args);
  };
  return {
    openTheme: () => void run('openingTheme', openFoliolePublishThemeFromRuntime, 'settings.publishing.foliole.theme.error.open'),
    resetTheme: () => void resetTheme(),
    updateLocal: () => void runWithSiteTitle('updatingLocal', updateFoliolePublishLocalPagesFromRuntime, 'settings.publishing.foliole.theme.error.updateLocal', true),
    updateWeb: () => void runWithSiteTitle('updatingWeb', publishFoliolePublishThemeChangesFromRuntime, 'settings.publishing.foliole.theme.error.updateWeb', true)
  };
}

export function useFoliolePublishingSettings() {
  const state = useFoliolePublishingDraftState();
  const siteTitle = useFoliolePublishingSiteTitle(state);
  const connection = useConnectionActions(state, siteTitle.requireSiteTitle);
  const site = siteActions(state, siteTitle.requireSiteTitle);
  const theme = useThemeActions(state, siteTitle.requireSiteTitle);
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
    ...connection, ...site, ...siteTitle, ...theme, updateForm
  };
}

export type FoliolePublishingSettingsState = ReturnType<typeof useFoliolePublishingSettings>;
