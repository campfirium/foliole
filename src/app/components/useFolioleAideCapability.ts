import { useCallback, useEffect, useMemo, useState } from 'react';
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

  useEffect(
    () =>
      subscribeFolioleAideEnabled((nextEnabled) => {
        setEnabled(nextEnabled);
        setUnavailableReason(null);
        setDiagnostic(null);
        setState(readInitialState(nextEnabled));
      }),
    []
  );

  const check = useAssistantStatusCheck({
    setByokSettings,
    setCodexReady,
    setDiagnostic,
    setState,
    setUnavailableReason
  });

  useByokSettingsSubscription(check, setByokSettings);

  useAutoCheckEnabledAide(enabled, state, check);

  const enable = useCallback(async () => {
    setFolioleAideEnabled(true);
    setEnabled(true);
    await check();
  }, [check]);

  const signIn = useAssistantSignIn(check, setDiagnostic, setState, setUnavailableReason);

  const markUnavailableFromFailure = useCapabilityFailure({
    byokConfigured: byokSettings?.state === 'configured',
    check,
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
      retry: check,
      selectProvider,
      signIn,
      state
    }),
    [byokSettings, check, codexReady, diagnostic, enable, enabled, markUnavailableFromFailure, selectProvider, signIn, state, unavailableReason]
  );
}

function useByokSettingsSubscription(
  check: () => Promise<void>,
  setByokSettings: (settings: NativeAssistantByokSettings | null) => void
) {
  useEffect(() => {
    if (!('subscribeAssistantByokSettings' in assistantRuntime)) return;
    return assistantRuntime.subscribeAssistantByokSettings((settings) => {
      setByokSettings(settings);
      void check();
    });
  }, [check, setByokSettings]);
}

function useAssistantStatusCheck(setters: {
  setByokSettings: (value: NativeAssistantByokSettings | null) => void;
  setCodexReady: (value: boolean) => void;
  setDiagnostic: (value: FolioleAideCapabilityDiagnostic | null) => void;
  setState: (value: FolioleAideCapabilityState) => void;
  setUnavailableReason: (value: FolioleAideCapabilityUnavailableReason | null) => void;
}) {
  return useCallback(async () => {
    setters.setState('checking');
    setters.setUnavailableReason(null);
    setters.setDiagnostic(null);
    try {
      const byokRequest = 'loadAssistantByokSettings' in assistantRuntime
        ? assistantRuntime.loadAssistantByokSettings()
        : Promise.resolve(null);
      const [status, byok] = await Promise.all([assistantRuntime.loadAssistantStatus(), byokRequest]);
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
  check: () => Promise<void>;
  setCodexReady: (ready: boolean) => void;
  setDiagnostic: Dispatch<SetStateAction<FolioleAideCapabilityDiagnostic | null>>;
  setState: (state: FolioleAideCapabilityState) => void;
  setUnavailableReason: (reason: FolioleAideCapabilityUnavailableReason | null) => void;
}) {
  const {
    byokConfigured,
    check,
    setCodexReady,
    setDiagnostic,
    setState,
    setUnavailableReason
  } = input;
  return useCallback((provider: NativeAssistantProviderId, category: NativeAssistantFailureCategory) => {
    if (provider === 'openai-compatible') {
      if (category === 'not_configured') void check();
      return;
    }
    setCodexReady(false);
    if (byokConfigured || !isCapabilityFailureCategory(category)) return;
    setUnavailableReason(category);
    setDiagnostic((current) => createFailureDiagnostic(category, current));
    setState('unavailable');
  }, [byokConfigured, check, setCodexReady, setDiagnostic, setState, setUnavailableReason]);
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
