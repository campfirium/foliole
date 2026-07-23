import { useEffect, useRef, useState } from 'react';

import {
  getWordPressSiteKind,
  isWordPressApplicationPasswordValid,
  normalizeWordPressApplicationPassword,
  normalizeWordPressSiteUrl,
  type WordPressSiteKind
} from '../../../../../lib/core/wordpress/wordpressConnectionInput';
import type { NativeWordPressPublishSettings } from '../../../../../lib/platform/nativeWordPressPublishContract';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  connectWordPressPublishSettingsToRuntime,
  disconnectWordPressPublishSettingsFromRuntime,
  loadWordPressPublishCatalogFromRuntime,
  loadWordPressPublishSettingsFromRuntime,
  saveWordPressPublishDraftToRuntime
} from '../../../../shared/platform/wordpressPublishRepository';

export interface WordPressPublishingForm {
  applicationPassword: string;
  siteUrl: string;
  username: string;
}

type WordPressPublishingStatus = 'connecting' | 'disconnecting' | 'idle' | 'loading';
const EMPTY_FORM: WordPressPublishingForm = { applicationPassword: '', siteUrl: '', username: '' };

export type { WordPressSiteKind };

function useWordPressPublishingState(t: ReturnType<typeof useTranslation>) {
  const [form, setForm] = useState<WordPressPublishingForm>(EMPTY_FORM);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [status, setStatus] = useState<WordPressPublishingStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [settings, setSettings] = useState<NativeWordPressPublishSettings | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    void loadWordPressPublishSettingsFromRuntime()
      .then((settings) => {
        if (!settings) return;
        setSettings(settings);
        setForm((current) => ({ ...current, siteUrl: settings.site_url, username: settings.username }));
        setHasCredentials(settings.has_credentials);
        setConnected(settings.credentials_valid);
      })
      .catch(() => setError(t('settings.publishing.wordpress.error.load')))
      .finally(() => setStatus('idle'));
  }, [t]);
  const enqueueSave = <T,>(save: () => Promise<T>) => {
    const queued = saveQueue.current.then(save, save);
    saveQueue.current = queued.then(() => undefined, () => undefined);
    return queued;
  };
  return { connected, enqueueSave, error, form, hasCredentials, settings, setConnected, setError, setForm, setHasCredentials, setSettings, setStatus, status };
}

type PublishingState = ReturnType<typeof useWordPressPublishingState>;

function readConnectionError(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  return error.message.replace(/^Error invoking remote method '[^']+': Error: /u, '');
}

async function persistWordPressDraft(state: PublishingState, form = state.form) {
  const saved = await state.enqueueSave(() => saveWordPressPublishDraftToRuntime({
    application_password: normalizeWordPressApplicationPassword(form.applicationPassword),
    site_url: form.siteUrl.trim(),
    username: form.username.trim()
  }));
  if (!saved) throw new Error('WordPress runtime unavailable');
  state.setSettings(saved);
  state.setHasCredentials(saved.has_credentials);
  state.setConnected(saved.credentials_valid);
  return saved;
}

async function connectWordPress(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('connecting');
  state.setError(null);
  try {
    const form = state.form;
    await persistWordPressDraft(state, form);
    const settings = await connectWordPressPublishSettingsToRuntime({
      application_password: normalizeWordPressApplicationPassword(form.applicationPassword),
      site_url: normalizeWordPressSiteUrl(form.siteUrl),
      username: form.username.trim()
    });
    if (!settings) throw new Error('WordPress runtime unavailable');
    if (!settings.credentials_valid) throw new Error('WordPress credentials were unavailable after connecting.');
    await loadWordPressPublishCatalogFromRuntime({ refresh: true }).catch(() => null);
    state.setSettings(settings);
    state.setForm({ applicationPassword: '', siteUrl: settings.site_url, username: settings.username });
    state.setHasCredentials(true);
    state.setConnected(true);
  } catch (error) {
    state.setError(readConnectionError(error, t('settings.publishing.wordpress.error.connect')));
  } finally {
    state.setStatus('idle');
  }
}

async function disconnectWordPress(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('disconnecting');
  state.setError(null);
  try {
    const settings = await disconnectWordPressPublishSettingsFromRuntime();
    if (!settings) throw new Error('WordPress runtime unavailable');
    state.setForm(EMPTY_FORM);
    state.setSettings(settings);
    state.setHasCredentials(false);
    state.setConnected(false);
  } catch {
    state.setError(t('settings.publishing.wordpress.error.disconnect'));
  } finally {
    state.setStatus('idle');
  }
}

export function useWordPressPublishingSettings() {
  const t = useTranslation();
  const state = useWordPressPublishingState(t);
  const disabled = state.status !== 'idle';
  const siteKind = getWordPressSiteKind(state.form.siteUrl);
  const siteUrlInvalid = Boolean(state.form.siteUrl.trim()) && siteKind === 'unknown';
  const applicationPasswordInvalid = Boolean(normalizeWordPressApplicationPassword(state.form.applicationPassword))
    && siteKind !== 'unknown'
    && !isWordPressApplicationPasswordValid(state.form.applicationPassword, siteKind);
  const canConnect = !disabled && !state.connected && Boolean(
    state.form.siteUrl.trim() && state.form.username.trim()
      && (state.form.applicationPassword.trim() || state.hasCredentials)
  ) && !siteUrlInvalid && !applicationPasswordInvalid;
  const updateForm = (patch: Partial<WordPressPublishingForm>) => {
    state.setConnected(false);
    if ('siteUrl' in patch || 'username' in patch) state.setHasCredentials(false);
    state.setError(null);
    state.setForm((current) => ({ ...current, ...patch }));
  };
  const saveDraft = () => {
    void persistWordPressDraft(state).catch((error) => {
      state.setError(readConnectionError(error, t('settings.publishing.wordpress.error.connect')));
    });
  };
  return {
    canConnect,
    applicationPasswordInvalid,
    connected: state.connected,
    disconnect: () => void disconnectWordPress(state, t),
    disabled,
    error: state.error,
    fieldsDisabled: disabled || state.connected,
    form: state.form,
    hasCredentials: state.hasCredentials,
    siteKind,
    siteUrlInvalid,
    saveDraft,
    status: state.status,
    submit: () => { if (canConnect) void connectWordPress(state, t); else saveDraft(); },
    updateForm
  };
}
