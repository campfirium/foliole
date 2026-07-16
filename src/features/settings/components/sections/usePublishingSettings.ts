import { useEffect, useState } from 'react';

import { definedProps } from '../../../../shared/lib/definedProps';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  disconnectDiscoursePublishSettingsFromRuntime,
  loadDiscoursePublishCatalogFromRuntime,
  loadDiscoursePublishSettingsFromRuntime,
  saveDiscoursePublishSettingsToRuntime
} from '../../../../shared/platform/discoursePublishRepository';

export interface PublishingFormState {
  apiKey: string;
  siteUrl: string;
}

export type PublishingFeedback = 'connected' | 'saved' | null;
export type PublishingStatus = 'idle' | 'loading' | 'saving' | 'testing';

const EMPTY_FORM: PublishingFormState = { apiKey: '', siteUrl: '' };

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
          setForm({ apiKey: '', siteUrl: settings.site_url });
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

async function persistPublishingSettings(state: PublishingState, form: PublishingFormState, includeApiKey: boolean) {
  const saved = await saveDiscoursePublishSettingsToRuntime({
    ...definedProps({ api_key: includeApiKey ? form.apiKey || undefined : undefined }),
    site_url: form.siteUrl
  });
  if (!saved) return;
  state.setHasApiKey(saved.has_api_key);
  state.setSavedSiteUrl(saved.site_url);
  state.setForm((current) => ({
    ...current,
    apiKey: includeApiKey && current.apiKey === form.apiKey ? '' : current.apiKey,
    siteUrl: current.siteUrl === form.siteUrl ? saved.site_url : current.siteUrl
  }));
}

async function savePublishingSettings(state: PublishingState, t: ReturnType<typeof useTranslation>, form: PublishingFormState, includeApiKey: boolean) {
  state.setStatus('saving');
  state.setError(null);
  state.setFeedback(null);
  try {
    await persistPublishingSettings(state, form, includeApiKey);
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
    await persistPublishingSettings(state, state.form, Boolean(state.form.apiKey.trim()));
    const catalog = await loadDiscoursePublishCatalogFromRuntime({ refresh: true });
    if (!catalog) throw new Error('Discourse catalog unavailable');
    state.setFeedback('connected');
  } catch {
    state.setError(t('settings.publishing.error.test'));
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
    if (state.form.siteUrl.trim() !== state.savedSiteUrl) void savePublishingSettings(state, t, state.form, false);
  };
  const saveApiKey = () => {
    if (state.form.apiKey.trim()) void savePublishingSettings(state, t, state.form, true);
  };
  const disabled = state.status === 'loading' || state.status === 'testing';
  const canTest = !disabled && Boolean(state.form.siteUrl.trim()) && (state.hasApiKey || Boolean(state.form.apiKey.trim()));
  return {
    ...state,
    canTest,
    disconnect: () => void disconnectPublishingSettings(state, t),
    disabled,
    saveApiKey,
    saveForumUrl,
    testConnection: () => void testPublishingConnection(state, t),
    updateForm
  };
}
