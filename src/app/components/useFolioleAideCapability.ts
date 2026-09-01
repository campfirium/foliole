import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { NativeAssistantByokSettings } from '../../../lib/platform/nativeAssistantByokContract';
import type {
  NativeAssistantFailureCategory,
  NativeAssistantProviderId
} from '../../../lib/platform/nativeAssistantContract';
import * as assistantRuntime from '../../shared/platform/assistantRuntime';

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
  const [state, setState] = useState<FolioleAideCapabilityState>('needsCheck');
  const [unavailableReason, setUnavailableReason] = useState<FolioleAideCapabilityUnavailableReason | null>(null);
  const [diagnostic, setDiagnostic] = useState<FolioleAideCapabilityDiagnostic | null>(null);
  const [byokSettings, setByokSettings] = useState<NativeAssistantByokSettings | null>(null);
  const [codexReady, setCodexReady] = useState(false);

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

  useAutoCheckAide(state, statusCheck.check);

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
      enable: statusCheck.check,
      diagnostic,
      byokSettings,
      codexReady,
      markUnavailableFromFailure,
      ready: state === 'ready',
      unavailableReason,
      retry: statusCheck.check,
      selectProvider,
      state
    }),
    [byokSettings, codexReady, diagnostic, markUnavailableFromFailure, selectProvider, state, statusCheck, unavailableReason]
  );
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
      const status = await assistantRuntime.loadAssistantStatus();
      const byok = 'loadAssistantByokSettings' in assistantRuntime
        ? await assistantRuntime.loadAssistantByokSettings()
        : null;
      if (checkId !== latestCheck.current) return;
      const nextCodexReady = isAssistantReady(status);
      const byokReady = byok?.selected_provider === 'openai-compatible'
        && byok.state === 'configured';
      setters.setByokSettings(byok);
      setters.setCodexReady(nextCodexReady);
      setters.setDiagnostic(readDiagnostic(status));
      const selectedReady = byok?.selected_provider === 'openai-compatible'
        ? byokReady
        : nextCodexReady;
      if (selectedReady) {
        setters.setState('ready');
        return;
      }
      setters.setUnavailableReason(byok?.selected_provider === 'openai-compatible'
        ? 'not_configured'
        : readUnavailableReason(status));
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

function useAutoCheckAide(
  state: FolioleAideCapabilityState,
  check: () => Promise<void>
) {
  useEffect(() => {
    if (state === 'needsCheck') void check();
  }, [check, state]);
}
