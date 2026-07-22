import { useEffect, useRef, useState } from 'react';

import type { NativeFoliolePublishSettings } from '../../../../../lib/platform/nativeFoliolePublishContract';
import {
  loadFoliolePublishSettingsFromRuntime,
  saveFoliolePublishDraftToRuntime
} from '../../../../shared/platform/foliolePublishRepository';

export interface FoliolePublishingForm {
  accountId: string;
  apiToken: string;
  customDomain: string;
  projectName: string;
}

export type FoliolePublishingStatus = 'connecting' | 'disconnecting' | 'idle' | 'loading' | 'openingTheme' | 'resettingTheme' | 'saving' | 'updating' | 'updatingLocal' | 'updatingWeb' | 'viewingLocal' | 'viewingWeb';
export const EMPTY_FOLIOLE_PUBLISHING_FORM: FoliolePublishingForm = {
  accountId: '', apiToken: '', customDomain: '', projectName: ''
};

export function foliolePublishingCustomDomain(settings: NativeFoliolePublishSettings) {
  return settings.site_address === settings.pages_url ? '' : settings.site_address;
}

export function foliolePublishingFormFromSettings(settings: NativeFoliolePublishSettings): FoliolePublishingForm {
  return {
    accountId: settings.account_id,
    apiToken: '',
    customDomain: foliolePublishingCustomDomain(settings),
    projectName: settings.project_name
  };
}

export function useFoliolePublishingDraftState() {
  const [form, setForm] = useState(EMPTY_FOLIOLE_PUBLISHING_FORM);
  const [settings, setSettings] = useState<NativeFoliolePublishSettings | null>(null);
  const [status, setStatus] = useState<FoliolePublishingStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    void loadFoliolePublishSettingsFromRuntime().then((value) => {
      if (!value) return;
      setSettings(value);
      setForm(foliolePublishingFormFromSettings(value));
    }).catch(() => setError("Couldn't load Foliole Publish settings.")).finally(() => setStatus('idle'));
  }, []);
  const enqueueSave = <T,>(save: () => Promise<T>) => {
    const queued = saveQueue.current.then(save, save);
    saveQueue.current = queued.then(() => undefined, () => undefined);
    return queued;
  };
  return { enqueueSave, error, form, setError, setForm, setSettings, setStatus, settings, status };
}

export type FoliolePublishingDraftState = ReturnType<typeof useFoliolePublishingDraftState>;

export async function persistFoliolePublishingDraft(
  state: FoliolePublishingDraftState,
  form = state.form
) {
  const saved = await state.enqueueSave(() => saveFoliolePublishDraftToRuntime({
    account_id: form.accountId.trim(), api_token: form.apiToken.trim(),
    project_name: form.projectName.trim()
  }));
  state.setSettings(saved);
  state.setForm((current) => ({
    ...current,
    accountId: current.accountId === form.accountId ? saved.account_id : current.accountId,
    apiToken: current.apiToken === form.apiToken ? '' : current.apiToken,
    projectName: current.projectName === form.projectName ? saved.project_name : current.projectName
  }));
  return saved;
}
