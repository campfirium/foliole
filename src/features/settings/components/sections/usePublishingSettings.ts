import { useEffect, useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  beginDiscourseUserApiAuthorizationFromRuntime,
  completeDiscourseUserApiAuthorizationFromRuntime,
  disconnectDiscoursePublishSettingsFromRuntime,
  loadDiscoursePublishCatalogFromRuntime,
  loadDiscoursePublishSettingsFromRuntime,
  saveDiscoursePublishSettingsToRuntime
} from '../../../../shared/platform/discoursePublishRepository';
import { openExternalUrl } from '../../../../shared/platform/runtimeExternalNavigation';

export interface PublishingFormState {
  authorizationResult: string;
  siteUrl: string;
}

export type PublishingStatus = 'authorizing' | 'connecting' | 'idle' | 'loading' | 'saving';

const EMPTY_FORM: PublishingFormState = { authorizationResult: '', siteUrl: '' };

function usePublishingFormState() {
  const t = useTranslation();
  const [form, setForm] = useState<PublishingFormState>(EMPTY_FORM);
  const [status, setStatus] = useState<PublishingStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [savedSiteUrl, setSavedSiteUrl] = useState('');
  useEffect(() => {
    void loadDiscoursePublishSettingsFromRuntime()
      .then((settings) => {
        if (settings) {
          setForm({ authorizationResult: '', siteUrl: settings.site_url });
          setHasApiKey(settings.has_api_key);
          setSavedSiteUrl(settings.site_url);
        }
        setStatus('idle');
      })
      .catch(() => {
        setError(t('settings.publishing.error.load'));
        setStatus('idle');
      });
  }, [t]);
  return { error, form, hasApiKey, savedSiteUrl, setError, setForm, setHasApiKey, setSavedSiteUrl, setStatus, status };
}

type PublishingState = ReturnType<typeof usePublishingFormState>;

async function persistPublishingSettings(state: PublishingState, form: PublishingFormState) {
  const saved = await saveDiscoursePublishSettingsToRuntime({
    site_url: form.siteUrl
  });
  if (!saved) return;
  state.setHasApiKey(saved.has_api_key);
  state.setSavedSiteUrl(saved.site_url);
  state.setForm((current) => ({
    ...current,
    siteUrl: current.siteUrl === form.siteUrl ? saved.site_url : current.siteUrl
  }));
  return saved;
}

async function savePublishingSettings(state: PublishingState, t: ReturnType<typeof useTranslation>, form: PublishingFormState) {
  state.setStatus('saving');
  state.setError(null);
  try {
    await persistPublishingSettings(state, form);
  } catch {
    state.setError(t('settings.publishing.error.save'));
  } finally {
    state.setStatus((current) => current === 'saving' ? 'idle' : current);
  }
}

async function beginAuthorization(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('authorizing');
  state.setError(null);
  try {
    await persistPublishingSettings(state, state.form);
    const result = await beginDiscourseUserApiAuthorizationFromRuntime(state.form.siteUrl);
    if (!result) throw new Error('Discourse authorization unavailable');
    await openExternalUrl(result.authorization_url);
  } catch {
    state.setError(t('settings.publishing.error.authorization'));
  } finally {
    state.setStatus('idle');
  }
}

async function completeAuthorization(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('connecting');
  state.setError(null);
  try {
    const saved = await completeDiscourseUserApiAuthorizationFromRuntime(
      state.form.siteUrl,
      state.form.authorizationResult.trim()
    );
    if (!saved) throw new Error('Discourse authorization unavailable');
    state.setHasApiKey(saved.has_api_key);
    state.setSavedSiteUrl(saved.site_url);
    state.setForm((current) => ({ ...current, authorizationResult: '' }));
    const catalog = await loadDiscoursePublishCatalogFromRuntime({ refresh: true });
    if (!catalog || catalog.from_cache) throw new Error('Discourse catalog unavailable');
  } catch {
    state.setError(t('settings.publishing.error.authorization'));
  } finally {
    state.setStatus('idle');
  }
}

async function disconnectPublishingSettings(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('saving');
  state.setError(null);
  try {
    const settings = await disconnectDiscoursePublishSettingsFromRuntime();
    if (settings) {
      state.setForm(EMPTY_FORM);
      state.setHasApiKey(false);
      state.setSavedSiteUrl('');
    }
  } catch {
    state.setError(t('settings.publishing.error.disconnect'));
  } finally {
    state.setStatus('idle');
  }
}

export function usePublishingSettings() {
  const t = useTranslation();
  const state = usePublishingFormState();
  const updateForm = (patch: Partial<PublishingFormState>) => {
    state.setError(null);
    state.setForm((current) => ({ ...current, ...patch }));
  };
  const saveForumUrl = () => {
    if (state.form.siteUrl.trim() !== state.savedSiteUrl) void savePublishingSettings(state, t, state.form);
  };
  const disabled = state.status !== 'idle';
  const hasSiteUrl = Boolean(state.form.siteUrl.trim());
  return {
    ...state,
    beginAuthorization: () => void beginAuthorization(state, t),
    canAuthorize: !disabled && !state.hasApiKey && hasSiteUrl,
    canCompleteAuthorization: !disabled && !state.hasApiKey && hasSiteUrl && Boolean(state.form.authorizationResult.trim()),
    completeAuthorization: () => void completeAuthorization(state, t),
    disconnect: () => void disconnectPublishingSettings(state, t),
    disabled,
    saveForumUrl,
    updateForm
  };
}
