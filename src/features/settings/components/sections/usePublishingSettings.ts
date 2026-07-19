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

export type PublishingFeedback = 'authorizationOpened' | 'connected' | 'saved' | null;
export type PublishingStatus = 'authorizing' | 'idle' | 'loading' | 'saving' | 'testing';

const EMPTY_FORM: PublishingFormState = { authorizationResult: '', siteUrl: '' };

function usePublishingFormState() {
  const t = useTranslation();
  const [form, setForm] = useState<PublishingFormState>(EMPTY_FORM);
  const [status, setStatus] = useState<PublishingStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PublishingFeedback>(null);
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
  return { error, feedback, form, hasApiKey, savedSiteUrl, setError, setFeedback, setForm, setHasApiKey, setSavedSiteUrl, setStatus, status };
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
  state.setFeedback(null);
  try {
    await persistPublishingSettings(state, form);
    state.setFeedback('saved');
  } catch {
    state.setError(t('settings.publishing.error.save'));
  } finally {
    state.setStatus((current) => current === 'saving' ? 'idle' : current);
  }
}

async function testPublishingConnection(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('testing');
  state.setError(null);
  state.setFeedback(null);
  try {
    await persistPublishingSettings(state, state.form);
    const catalog = await loadDiscoursePublishCatalogFromRuntime({ refresh: true });
    if (!catalog || catalog.from_cache) throw new Error('Discourse catalog unavailable');
    state.setFeedback('connected');
  } catch {
    state.setError(t('settings.publishing.error.test'));
  } finally {
    state.setStatus('idle');
  }
}

async function beginAuthorization(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('authorizing');
  state.setError(null);
  state.setFeedback(null);
  try {
    await persistPublishingSettings(state, state.form);
    const result = await beginDiscourseUserApiAuthorizationFromRuntime(state.form.siteUrl);
    if (!result) throw new Error('Discourse authorization unavailable');
    await openExternalUrl(result.authorization_url);
    state.setFeedback('authorizationOpened');
  } catch {
    state.setError(t('settings.publishing.error.authorization'));
  } finally {
    state.setStatus('idle');
  }
}

async function completeAuthorization(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('saving');
  state.setError(null);
  state.setFeedback(null);
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
    state.setFeedback('connected');
  } catch {
    state.setError(t('settings.publishing.error.authorization'));
  } finally {
    state.setStatus('idle');
  }
}

async function disconnectPublishingSettings(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('saving');
  state.setError(null);
  state.setFeedback(null);
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
    state.setFeedback(null);
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
    canAuthorize: !disabled && hasSiteUrl,
    canCompleteAuthorization: !disabled && hasSiteUrl && Boolean(state.form.authorizationResult.trim()),
    canTest: !disabled && hasSiteUrl && state.hasApiKey,
    completeAuthorization: () => void completeAuthorization(state, t),
    disconnect: () => void disconnectPublishingSettings(state, t),
    disabled,
    saveForumUrl,
    testConnection: () => void testPublishingConnection(state, t),
    updateForm
  };
}
