import { useEffect, useState } from 'react';

import type { NativeFoliolePublishSettings } from '../../../../../lib/platform/nativeFoliolePublishContract';
import {
  connectFoliolePublishSettingsToRuntime,
  disconnectFoliolePublishSettingsFromRuntime,
  loadFoliolePublishSettingsFromRuntime,
  previewFoliolePublishFromRuntime,
  updateFoliolePublishSiteAddressInRuntime
} from '../../../../shared/platform/foliolePublishRepository';

export interface FoliolePublishingForm {
  accountId: string;
  apiToken: string;
  customDomain: string;
  projectName: string;
}
type Status = 'connecting' | 'disconnecting' | 'idle' | 'loading' | 'previewing' | 'updating';
type SetupStep = 'credentials' | 'site';
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

export function useFoliolePublishingSettings() {
  const { error, form, setError, setForm, setSettings, setStatus, settings, status } = useLoadedSettings();
  const [step, setStep] = useState<SetupStep>('credentials');
  const [projectConflict, setProjectConflict] = useState(false);
  const disabled = status !== 'idle';
  const connected = Boolean(settings?.has_credentials && settings.account_id && settings.project_name);
  const updateForm = (patch: Partial<FoliolePublishingForm>) => {
    setError(null); setProjectConflict(false); setForm((value) => ({ ...value, ...patch }));
  };
  const applySettings = (value: NativeFoliolePublishSettings) => {
    setSettings(value); setForm(formFromSettings(value)); setStep('credentials'); setProjectConflict(false);
  };
  const deploy = async (useExistingProject: boolean) => {
    setStatus('connecting'); setError(null);
    try {
      const result = await connectFoliolePublishSettingsToRuntime({
        account_id: form.accountId.trim(), api_token: form.apiToken.trim(), project_name: form.projectName.trim(),
        site_address: '', use_existing_project: useExistingProject
      });
      if (result.status === 'project_exists') setProjectConflict(true); else applySettings(result.settings);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn't create the Cloudflare site."); }
    finally { setStatus('idle'); }
  };
  const disconnect = async () => {
    setStatus('disconnecting'); setError(null);
    try { const value = await disconnectFoliolePublishSettingsFromRuntime(); setSettings(value); setForm(EMPTY); setStep('credentials'); }
    catch { setError("Couldn't disconnect Foliole Publish."); } finally { setStatus('idle'); }
  };
  const preview = async () => {
    setStatus('previewing'); setError(null);
    try { await previewFoliolePublishFromRuntime(); } catch { setError("Couldn't open the local preview."); }
    finally { setStatus('idle'); }
  };
  const updateSiteAddress = async () => {
    setStatus('updating'); setError(null);
    try { applySettings(await updateFoliolePublishSiteAddressInRuntime(form.customDomain.trim())); }
    catch (reason) {
      if (settings) setForm(formFromSettings(settings));
      setError(reason instanceof Error ? reason.message : "Couldn't update the public address.");
    }
    finally { setStatus('idle'); }
  };
  const savedCustomDomain = settings ? customDomain(settings) : '';
  return {
    canContinue: !disabled && Boolean(form.accountId.trim() && form.apiToken.trim()),
    canDeploy: !disabled && Boolean(form.projectName.trim()),
    canUpdateAddress: connected && !disabled && form.customDomain.trim() !== savedCustomDomain,
    connected, disabled, error, form, pagesUrl: settings?.pages_url ?? '', projectConflict, status, step,
    back: () => setStep('credentials'), continue: () => setStep('site'), deploy: () => void deploy(false),
    disconnect: () => void disconnect(), preview: () => void preview(), updateForm,
    updateSiteAddress: () => void updateSiteAddress(), useExistingProject: () => void deploy(true)
  };
}

export type FoliolePublishingSettingsState = ReturnType<typeof useFoliolePublishingSettings>;
