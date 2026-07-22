import { useEffect, useState } from 'react';

import {
  getWordPressSiteKind,
  isWordPressApplicationPasswordValid,
  normalizeWordPressApplicationPassword,
  normalizeWordPressSiteUrl,
  type WordPressSiteKind
} from '../../../../../lib/core/wordpress/wordpressConnectionInput';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  connectWordPressPublishSettingsToRuntime,
  disconnectWordPressPublishSettingsFromRuntime,
  loadWordPressPublishSettingsFromRuntime
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
  useEffect(() => {
    void loadWordPressPublishSettingsFromRuntime()
      .then((settings) => {
        if (!settings) return;
        setForm((current) => ({ ...current, siteUrl: settings.site_url }));
        setHasCredentials(settings.has_credentials);
        setConnected(settings.has_credentials);
      })
      .catch(() => setError(t('settings.publishing.wordpress.error.load')))
      .finally(() => setStatus('idle'));
  }, [t]);
  return {
    connected, error, form, hasCredentials, setConnected, setError, setForm, setHasCredentials, setStatus, status
  };
}

type PublishingState = ReturnType<typeof useWordPressPublishingState>;

function readConnectionError(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message.trim()) return fallback;
  return error.message.replace(/^Error invoking remote method '[^']+': Error: /u, '');
}

async function connectWordPress(state: PublishingState, t: ReturnType<typeof useTranslation>) {
  state.setStatus('connecting');
  state.setError(null);
  try {
    const settings = await connectWordPressPublishSettingsToRuntime({
      application_password: normalizeWordPressApplicationPassword(state.form.applicationPassword),
      site_url: normalizeWordPressSiteUrl(state.form.siteUrl),
      username: state.form.username.trim()
    });
    if (!settings) throw new Error('WordPress runtime unavailable');
    if (!settings.has_credentials) throw new Error('WordPress credentials were unavailable after connecting.');
    state.setForm({ applicationPassword: '', siteUrl: settings.site_url, username: '' });
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
    state.form.siteUrl.trim() && state.form.username.trim() && state.form.applicationPassword.trim()
  ) && !siteUrlInvalid && !applicationPasswordInvalid;
  const updateForm = (patch: Partial<WordPressPublishingForm>) => {
    state.setConnected(false);
    state.setError(null);
    state.setForm((current) => ({ ...current, ...patch }));
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
    status: state.status,
    submit: () => { if (canConnect) void connectWordPress(state, t); },
    updateForm
  };
}
