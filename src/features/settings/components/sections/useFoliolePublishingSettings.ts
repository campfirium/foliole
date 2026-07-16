import { useEffect, useState } from 'react';

import { connectFoliolePublishSettingsToRuntime, disconnectFoliolePublishSettingsFromRuntime, loadFoliolePublishSettingsFromRuntime, previewFoliolePublishFromRuntime } from '../../../../shared/platform/foliolePublishRepository';

export interface FoliolePublishingForm { accountId: string; apiToken: string; projectName: string; siteAddress: string }
type Status = 'deploying' | 'disconnecting' | 'idle' | 'loading' | 'previewing';
const EMPTY: FoliolePublishingForm = { accountId: '', apiToken: '', projectName: '', siteAddress: '' };

export function useFoliolePublishingSettings() {
  const [form, setForm] = useState(EMPTY);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void loadFoliolePublishSettingsFromRuntime().then((value) => {
      if (!value) return;
      setForm({ accountId: value.account_id, apiToken: '', projectName: value.project_name, siteAddress: value.site_address });
      setHasCredentials(value.has_credentials);
    }).catch(() => setError("Couldn't load Foliole Publish settings.")).finally(() => setStatus('idle'));
  }, []);
  const disabled = status !== 'idle';
  const updateForm = (patch: Partial<FoliolePublishingForm>) => { setError(null); setForm((value) => ({ ...value, ...patch })); };
  const deploy = async () => {
    setStatus('deploying'); setError(null);
    try {
      const value = await connectFoliolePublishSettingsToRuntime({ account_id: form.accountId.trim(), api_token: form.apiToken.trim(), project_name: form.projectName.trim(), site_address: form.siteAddress.trim() });
      setForm({ accountId: value.account_id, apiToken: '', projectName: value.project_name, siteAddress: value.site_address });
      setHasCredentials(value.has_credentials);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn't deploy Foliole Publish."); }
    finally { setStatus('idle'); }
  };
  const disconnect = async () => {
    setStatus('disconnecting'); setError(null);
    try { await disconnectFoliolePublishSettingsFromRuntime(); setForm(EMPTY); setHasCredentials(false); }
    catch { setError("Couldn't disconnect Foliole Publish."); } finally { setStatus('idle'); }
  };
  const preview = async () => {
    setStatus('previewing'); setError(null);
    try { await previewFoliolePublishFromRuntime(); } catch { setError("Couldn't open the local preview."); }
    finally { setStatus('idle'); }
  };
  return { canDeploy: !disabled && Boolean(form.accountId.trim() && form.projectName.trim() && (form.apiToken.trim() || hasCredentials)), deploy: () => void deploy(), disabled, disconnect: () => void disconnect(), error, form, hasCredentials, preview: () => void preview(), status, updateForm };
}
