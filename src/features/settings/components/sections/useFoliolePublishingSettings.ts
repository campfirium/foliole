import { useEffect, useState } from 'react';

import type { NativeFoliolePublishSettings } from '../../../../../lib/platform/nativeFoliolePublishContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  connectFoliolePublishSettingsToRuntime,
  disconnectFoliolePublishSettingsFromRuntime,
  loadFoliolePublishSettingsFromRuntime,
  updateFoliolePublishSiteAddressInRuntime
} from '../../../../shared/platform/foliolePublishRepository';
import { requestAppConfirmation } from '../../../../shared/ui';

export interface FoliolePublishingForm {
  accountId: string;
  apiToken: string;
  customDomain: string;
  projectName: string;
}
type Status = 'connecting' | 'disconnecting' | 'idle' | 'loading' | 'updating';
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
      let result = await connectWithForm(state, false);
      if (result.status === 'subdomain_detected' || result.status === 'subdomain_not_detected') {
        if (!await confirmSubdomain(t, result.status === 'subdomain_detected')) return;
        result = await connectWithForm(state, true);
      }
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
  const updateSiteAddress = async () => {
    state.setStatus('updating'); state.setError(null);
    try { applySettings(state, await updateFoliolePublishSiteAddressInRuntime(state.form.customDomain.trim())); }
    catch (reason) {
      if (state.settings) state.setForm(formFromSettings(state.settings));
      state.setError(reason instanceof Error ? reason.message : "Couldn't update the public address.");
    }
    finally { state.setStatus('idle'); }
  };
  return { updateSiteAddress: () => void updateSiteAddress() };
}

export function useFoliolePublishingSettings() {
  const state = useLoadedSettings();
  const connection = useConnectionActions(state);
  const site = siteActions(state);
  const disabled = state.status !== 'idle';
  const connected = Boolean(state.settings?.has_credentials && state.settings.account_id && state.settings.project_name);
  const savedCustomDomain = state.settings ? customDomain(state.settings) : '';
  const updateForm = (patch: Partial<FoliolePublishingForm>) => {
    state.setError(null); state.setForm((value) => ({ ...value, ...patch }));
  };
  return {
    canDeploy: !disabled && Boolean(state.form.accountId.trim() && state.form.apiToken.trim() && state.form.projectName.trim()),
    canUpdateAddress: connected && !disabled && state.form.customDomain.trim() !== savedCustomDomain,
    connected, disabled, error: state.error, form: state.form, pagesUrl: state.settings?.pages_url ?? '',
    siteAddress: state.settings?.site_address ?? '', status: state.status,
    ...connection, ...site, updateForm
  };
}

export type FoliolePublishingSettingsState = ReturnType<typeof useFoliolePublishingSettings>;
