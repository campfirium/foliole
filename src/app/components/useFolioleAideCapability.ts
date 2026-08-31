import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { NativeAssistantByokSettings } from '../../../lib/platform/nativeAssistantByokContract';
import type {
  NativeAssistantFailureCategory,
  NativeAssistantProviderId
} from '../../../lib/platform/nativeAssistantContract';
import * as assistantRuntime from '../../shared/platform/assistantRuntime';
import {
  getFolioleAideEnabled,
  setFolioleAideEnabled,
  subscribeFolioleAideEnabled
} from '../../shared/platform/folioleAideSettings';

import {
  createFailureDiagnostic,
  isAssistantReady,
  isCapabilityFailureCategory,
  readDiagnostic,
  readUnavailableReason,
  type FolioleAideCapabilityDiagnostic,
  type FolioleAideCapabilityState,
  type FolioleAideCapabilityUnavailableReason
} from './folioleAideCapabilityModel';
import {
  useByokSettingsRefresh,
  useByokSettingsSubscription
} from './useFolioleAideByokSettings';

export type {
  FolioleAideCapabilityDiagnostic,
  FolioleAideCapabilityState,
  FolioleAideCapabilityUnavailableReason,
  FolioleAideDiagnosticState,
  FolioleAideToolsDiagnosticState
} from './folioleAideCapabilityModel';

export function useFolioleAideCapability() {
  const [enabled, setEnabled] = useState(() => getFolioleAideEnabled());
  const [state, setState] = useState<FolioleAideCapabilityState>(() => readInitialState(enabled));
  const [unavailableReason, setUnavailableReason] = useState<FolioleAideCapabilityUnavailableReason | null>(null);
  const [diagnostic, setDiagnostic] = useState<FolioleAideCapabilityDiagnostic | null>(null);
  const [byokSettings, setByokSettings] = useState<NativeAssistantByokSettings | null>(null);
  const [codexReady, setCodexReady] = useState(false);

  useEnabledAideSubscription(setEnabled, setDiagnostic, setState, setUnavailableReason);

  const statusCheck = useAssistantStatusCheck({
    setByokSettings,
    setCodexReady,
    setDiagnostic,
    setState,
    setUnavailableReason
  });

  useByokSettingsSubscription({
    invalidateStatusCheck: statusCheck.invalidate,
    setByokSettings,
    setDiagnostic,
    setState,
    setUnavailableReason
  });

  useAutoCheckEnabledAide(enabled, state, statusCheck.check);

  const enable = useCallback(async () => {
    setFolioleAideEnabled(true);
    setEnabled(true);
    await statusCheck.check();
  }, [statusCheck]);

  const signIn = useAssistantSignIn(statusCheck.check, setDiagnostic, setState, setUnavailableReason);
  const refreshByokSettings = useByokSettingsRefresh(setByokSettings);

  const markUnavailableFromFailure = useCapabilityFailure({
    byokConfigured: byokSettings?.state === 'configured',
    refreshByokSettings,
    setCodexReady,
    setDiagnostic,
    setState,
    setUnavailableReason
  });
  const selectProvider = useProviderSelection(setByokSettings);

  return useMemo(
    () => ({
      enabled,
      enable,
      diagnostic,
      byokSettings,
      codexReady,
      markUnavailableFromFailure,
      ready: state === 'ready',
      unavailableReason,
      retry: statusCheck.check,
      selectProvider,
      signIn,
      state
    }),
    [byokSettings, codexReady, diagnostic, enable, enabled, markUnavailableFromFailure, selectProvider, signIn, state, statusCheck, unavailableReason]
  );
}

function useEnabledAideSubscription(
  setEnabled: (enabled: boolean) => void,
  setDiagnostic: (diagnostic: FolioleAideCapabilityDiagnostic | null) => void,
  setState: (state: FolioleAideCapabilityState) => void,
  setUnavailableReason: (reason: FolioleAideCapabilityUnavailableReason | null) => void
) {
  useEffect(() => subscribeFolioleAideEnabled((nextEnabled) => {
    setEnabled(nextEnabled);
    setUnavailableReason(null);
    setDiagnostic(null);
    setState(readInitialState(nextEnabled));
  }), [setDiagnostic, setEnabled, setState, setUnavailableReason]);
}

function useAssistantStatusCheck(setters: {
  setByokSettings: (value: NativeAssistantByokSettings | null) => void;
  setCodexReady: (value: boolean) => void;
  setDiagnostic: (value: FolioleAideCapabilityDiagnostic | null) => void;
  setState: (value: FolioleAideCapabilityState) => void;
  setUnavailableReason: (value: FolioleAideCapabilityUnavailableReason | null) => void;
}) {
  const latestCheck = useRef(0);
  const check = useCallback(async () => {
    const checkId = ++latestCheck.current;
    setters.setState('checking');
    setters.setUnavailableReason(null);
    setters.setDiagnostic(null);
    try {
      const byokRequest = 'loadAssistantByokSettings' in assistantRuntime
        ? assistantRuntime.loadAssistantByokSettings()
        : Promise.resolve(null);
      const [status, byok] = await Promise.all([assistantRuntime.loadAssistantStatus(), byokRequest]);
      if (checkId !== latestCheck.current) return;
      const nextCodexReady = isAssistantReady(status);
      const byokReady = byok?.state === 'configured';
      setters.setByokSettings(byok);
      setters.setCodexReady(nextCodexReady);
      setters.setDiagnostic(readDiagnostic(status));
      if (nextCodexReady || byokReady) {
        setters.setState('ready');
        return;
      }
      setters.setUnavailableReason(readUnavailableReason(status));
      setters.setState('unavailable');
    } catch {
      if (checkId !== latestCheck.current) return;
      setters.setCodexReady(false);
      setters.setDiagnostic({ codex: 'unknown', tools: 'unknown' });
      setters.setUnavailableReason('statusFailed');
      setters.setState('unavailable');
    }
  }, [
    setters.setByokSettings,
    setters.setCodexReady,
    setters.setDiagnostic,
    setters.setState,
    setters.setUnavailableReason
  ]);
  const invalidate = useCallback(() => {
    latestCheck.current += 1;
  }, []);
  return useMemo(() => ({ check, invalidate }), [check, invalidate]);
}

function useAssistantSignIn(
  check: () => Promise<void>,
  setDiagnostic: (value: FolioleAideCapabilityDiagnostic | null) => void,
  setState: (value: FolioleAideCapabilityState) => void,
  setUnavailableReason: (value: FolioleAideCapabilityUnavailableReason | null) => void
) {
  return useCallback(async () => {
    setState('checking');
    setUnavailableReason(null);
    const result = await assistantRuntime.startAssistantChatGptLogin().catch(() => null);
    if (result?.state === 'ready') return check();
    const category = result?.failure?.category ?? 'auth_failed';
    setDiagnostic(createFailureDiagnostic(category, null));
    setUnavailableReason(category);
    setState('unavailable');
  }, [check, setDiagnostic, setState, setUnavailableReason]);
}

function useProviderSelection(
  setByokSettings: (settings: NativeAssistantByokSettings | null) => void
) {
  return useCallback(async (provider: NativeAssistantProviderId) => {
    if (!('selectAssistantProvider' in assistantRuntime)) return;
    const next = await assistantRuntime.selectAssistantProvider(provider);
    if (next) setByokSettings(next);
  }, [setByokSettings]);
}

function useCapabilityFailure(input: {
  byokConfigured: boolean;
  refreshByokSettings: () => Promise<void>;
  setCodexReady: (ready: boolean) => void;
  setDiagnostic: Dispatch<SetStateAction<FolioleAideCapabilityDiagnostic | null>>;
  setState: (state: FolioleAideCapabilityState) => void;
  setUnavailableReason: (reason: FolioleAideCapabilityUnavailableReason | null) => void;
}) {
  const {
    byokConfigured,
    refreshByokSettings,
    setCodexReady,
    setDiagnostic,
    setState,
    setUnavailableReason
  } = input;
  return useCallback((provider: NativeAssistantProviderId, category: NativeAssistantFailureCategory) => {
    if (provider === 'openai-compatible') {
      if (category === 'not_configured') void refreshByokSettings();
      return;
    }
    setCodexReady(false);
    if (byokConfigured || !isCapabilityFailureCategory(category)) return;
    setUnavailableReason(category);
    setDiagnostic((current) => createFailureDiagnostic(category, current));
    setState('unavailable');
  }, [byokConfigured, refreshByokSettings, setCodexReady, setDiagnostic, setState, setUnavailableReason]);
}

function readInitialState(enabled: boolean): FolioleAideCapabilityState {
  return enabled ? 'needsCheck' : 'notEnabled';
}

function useAutoCheckEnabledAide(
  enabled: boolean,
  state: FolioleAideCapabilityState,
  check: () => Promise<void>
) {
  useEffect(() => {
    if (enabled && state === 'needsCheck') void check();
  }, [check, enabled, state]);
}
