import { useEffect, useState } from 'react';

import { normalizeCloudflareProjectName } from '../../../../../lib/core/foliolePublish/cloudflarePagesProjectName';
import type { NativeFoliolePublishSettings } from '../../../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  connectFoliolePublishSettingsToRuntime,
  disconnectFoliolePublishSettingsFromRuntime,
  loadFoliolePublishSettingsFromRuntime,
  openFoliolePublishThemeFromRuntime,
  publishFoliolePublishThemeChangesFromRuntime,
  resetFoliolePublishThemeFromRuntime,
  updateFoliolePublishLocalPagesFromRuntime,
  updateFoliolePublishSiteAddressInRuntime,
  viewFoliolePublishSiteFromRuntime
} from '../../../../shared/platform/foliolePublishRepository';
import { probeUrlWithLinkPanel } from '../../../../shared/platform/linkPanelUrlProbe';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';
import { requestAppConfirmation } from '../../../../shared/ui';

import { isCloudflareAccountId, isCloudflareApiToken } from './cloudflareCredentialValidation';

export interface FoliolePublishingForm {
  accountId: string;
  apiToken: string;
  customDomain: string;
  projectName: string;
}
type Status = 'connecting' | 'disconnecting' | 'idle' | 'loading' | 'openingTheme' | 'resettingTheme' | 'updating' | 'updatingLocal' | 'updatingWeb' | 'viewingLocal' | 'viewingWeb';
const EMPTY: FoliolePublishingForm = { accountId: '', apiToken: '', customDomain: '', projectName: '' };

function customDomain(settings: NativeFoliolePublishSettings) {
  return settings.site_address === settings.pages_url ? '' : settings.site_address;
}

function formFromSettings(settings: NativeFoliolePublishSettings): FoliolePublishingForm {
  return {
    accountId: settings.account_id,
    apiToken: '',
    customDomain: customDomain(settings),
    projectName: settings.project_name
  };
}

function useLoadedSettings() {
  const [form, setForm] = useState(EMPTY);
  const [settings, setSettings] = useState<NativeFoliolePublishSettings | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void loadFoliolePublishSettingsFromRuntime().then((value) => {
      if (!value) return;
      setSettings(value); setForm(formFromSettings(value));
    }).catch(() => setError("Couldn't load Foliole Publish settings.")).finally(() => setStatus('idle'));
  }, []);
  return { error, form, setError, setForm, setSettings, setStatus, settings, status };
}

type LoadedState = ReturnType<typeof useLoadedSettings>;
type Translate = ReturnType<typeof useTranslation>;

function applySettings(state: LoadedState, value: NativeFoliolePublishSettings) {
  state.setSettings(value); state.setForm(formFromSettings(value));
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

function connectWithForm(state: LoadedState, confirmSubdomainRisk: boolean) {
  return connectFoliolePublishSettingsToRuntime({
    account_id: state.form.accountId.trim(), api_token: state.form.apiToken.trim(),
    confirm_subdomain_risk: confirmSubdomainRisk, project_name: state.form.projectName.trim(),
    site_address: ''
  });
}

function useConnectionActions(state: LoadedState) {
  const t = useTranslation();
  const deploy = async () => {
    state.setStatus('connecting'); state.setError(null);
    try {
      const projectName = normalizeCloudflareProjectName(state.form.projectName);
      const detected = await probeUrlWithLinkPanel(`https://${projectName}.pages.dev`);
      if (!await confirmSubdomain(t, detected)) return;
      const result = await connectWithForm(state, true);
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
      state.setSettings(value); state.setForm(EMPTY);
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
      if (state.settings) state.setForm(formFromSettings(state.settings));
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
    status: Status,
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
  const state = useLoadedSettings();
  const connection = useConnectionActions(state);
  const site = siteActions(state);
  const theme = useThemeActions(state);
  const disabled = state.status !== 'idle';
  const connected = Boolean(state.settings?.has_credentials && state.settings.account_id && state.settings.project_name);
  const savedCustomDomain = state.settings ? customDomain(state.settings) : '';
  const updateForm = (patch: Partial<FoliolePublishingForm>) => {
    state.setError(null); state.setForm((value) => ({ ...value, ...patch }));
  };
  const accountIdInvalid = Boolean(state.form.accountId) && !isCloudflareAccountId(state.form.accountId);
  const apiTokenInvalid = Boolean(state.form.apiToken) && !isCloudflareApiToken(state.form.apiToken);
  return {
    accountIdInvalid, apiTokenInvalid,
    canDeploy: !disabled && isCloudflareAccountId(state.form.accountId)
      && isCloudflareApiToken(state.form.apiToken) && Boolean(state.form.projectName.trim()),
    canUpdateWeb: connected && !disabled,
    canUpdateAddress: connected && !disabled && state.form.customDomain.trim() !== savedCustomDomain,
    canViewWeb: connected && !disabled && Boolean(state.settings?.site_address),
    connected, disabled, error: state.error, form: state.form, pagesUrl: state.settings?.pages_url ?? '',
    siteAddress: state.settings?.site_address ?? '', status: state.status,
    ...connection, ...site, ...theme, updateForm
  };
}

export type FoliolePublishingSettingsState = ReturnType<typeof useFoliolePublishingSettings>;
