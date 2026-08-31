import { type FormEvent, useEffect, useRef, useState } from 'react';

import type { NativeAssistantByokSettings } from '../../../../../lib/platform/nativeAssistantByokContract';
import {
  disconnectAssistantByokSettings,
  loadAssistantByokSettings,
  saveAssistantByokSettings
} from '../../../../shared/platform/assistantRuntime';

const EMPTY_SETTINGS: NativeAssistantByokSettings = {
  endpoint: '', has_api_key: false, model: '', selected_provider: 'codex-app-server', state: 'not_configured'
};

type SettingsStatus = 'disconnecting' | 'idle' | 'loading' | 'saving';

export function useSettingsAideByok() {
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [keyEntered, setKeyEntered] = useState(false);
  const [status, setStatus] = useState<SettingsStatus>('loading');
  const [error, setError] = useState(false);
  useInitialByokSettings({ setEndpoint, setError, setModel, setSettings, setStatus });

  const disabled = status !== 'idle';
  const endpointNeedsKey = settings.has_api_key && endpoint.trim() !== settings.endpoint;
  const canSave = Boolean(endpoint.trim() && model.trim())
    && (!endpointNeedsKey || keyEntered)
    && (settings.has_api_key || keyEntered);

  function applySettings(value: NativeAssistantByokSettings) {
    setSettings(value);
    setEndpoint(value.endpoint);
    setModel(value.model);
    setError(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave || disabled) return;
    setStatus('saving');
    setError(false);
    const apiKey = apiKeyRef.current?.value.trim() ?? '';
    try {
      const value = await saveAssistantByokSettings({
        endpoint: endpoint.trim(), model: model.trim(), ...(apiKey ? { api_key: apiKey } : {})
      });
      if (!value) throw new Error('byok_settings_unavailable');
      applySettings(value);
    } catch {
      setError(true);
    } finally {
      if (apiKeyRef.current) apiKeyRef.current.value = '';
      setKeyEntered(false);
      setStatus('idle');
    }
  }

  async function disconnect() {
    if (disabled) return;
    setStatus('disconnecting');
    setError(false);
    try {
      const value = await disconnectAssistantByokSettings();
      if (!value) throw new Error('byok_settings_unavailable');
      applySettings(value);
    } catch {
      setError(true);
    } finally {
      setStatus('idle');
    }
  }

  return {
    apiKeyRef, canSave, disabled, disconnect, endpoint, endpointNeedsKey, error,
    keyEntered, model, save, setEndpoint, setKeyEntered, setModel, settings, status
  };
}

function useInitialByokSettings(setters: {
  setEndpoint: (value: string) => void;
  setError: (value: boolean) => void;
  setModel: (value: string) => void;
  setSettings: (value: NativeAssistantByokSettings) => void;
  setStatus: (value: SettingsStatus) => void;
}) {
  useEffect(() => {
    let active = true;
    void loadAssistantByokSettings()
      .then((value) => {
        if (!active || !value) return;
        setters.setSettings(value);
        setters.setEndpoint(value.endpoint);
        setters.setModel(value.model);
        setters.setError(false);
      })
      .catch(() => { if (active) setters.setError(true); })
      .finally(() => { if (active) setters.setStatus('idle'); });
    return () => { active = false; };
  }, []);
}
