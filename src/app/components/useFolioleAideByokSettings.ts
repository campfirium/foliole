import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { NativeAssistantByokSettings } from '../../../lib/platform/nativeAssistantByokContract';
import * as assistantRuntime from '../../shared/platform/assistantRuntime';

import type {
  FolioleAideCapabilityDiagnostic,
  FolioleAideCapabilityState,
  FolioleAideCapabilityUnavailableReason
} from './folioleAideCapabilityModel';

export function useByokSettingsSubscription(
  input: {
    invalidateStatusCheck: () => void;
    refreshStatus: () => Promise<void>;
    setByokSettings: (settings: NativeAssistantByokSettings | null) => void;
    setDiagnostic: Dispatch<SetStateAction<FolioleAideCapabilityDiagnostic | null>>;
    setState: (state: FolioleAideCapabilityState) => void;
    setUnavailableReason: (reason: FolioleAideCapabilityUnavailableReason | null) => void;
  }
) {
  useEffect(() => {
    if (!('subscribeAssistantByokSettings' in assistantRuntime)) return;
    return assistantRuntime.subscribeAssistantByokSettings((settings) => {
      input.invalidateStatusCheck();
      input.setByokSettings(settings);
      if (settings.selected_provider === 'openai-compatible' && settings.state !== 'configured') {
        input.setUnavailableReason('not_configured');
        input.setState('unavailable');
        return;
      }
      if (settings.selected_provider === 'openai-compatible') {
        input.setDiagnostic(null);
        input.setUnavailableReason(null);
        input.setState('ready');
        return;
      }
      void input.refreshStatus();
    });
  }, [input]);
}

export function useByokSettingsRefresh(
  setByokSettings: (settings: NativeAssistantByokSettings | null) => void
) {
  return useCallback(async () => {
    if (!('loadAssistantByokSettings' in assistantRuntime)) return;
    const settings = await assistantRuntime.loadAssistantByokSettings().catch(() => null);
    if (settings) setByokSettings(settings);
  }, [setByokSettings]);
}
