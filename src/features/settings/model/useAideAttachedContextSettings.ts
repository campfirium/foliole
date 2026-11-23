import { useEffect, useRef, useState } from 'react';

import {
  createDefaultAideAttachedContextSettings,
  normalizeAideAttachedContextSettings,
  type AideAttachedContextSettings
} from '../../../../lib/core/assistant/aideAttachedContextSettings';
import {
  loadAssistantAttachedContextSettings,
  saveAssistantAttachedContextSettings
} from '../../../shared/platform/assistantRuntime';

const SAVE_DELAY_MS = 400;

// Device-local settings; every change applies from the next message, so edits are saved shortly after typing.
export function useAideAttachedContextSettings() {
  const [settings, setSettings] = useState<AideAttachedContextSettings>(createDefaultAideAttachedContextSettings);
  const [saveFailed, setSaveFailed] = useState(false);
  const pending = useRef<AideAttachedContextSettings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    void loadAssistantAttachedContextSettings()
      .then((value) => { if (active && value && !pending.current) setSettings(normalizeAideAttachedContextSettings(value)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) void saveAssistantAttachedContextSettings(pending.current).catch(() => undefined);
  }, []);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (!value) return;
    pending.current = null;
    void saveAssistantAttachedContextSettings(value)
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true));
  };

  const update = (next: AideAttachedContextSettings) => {
    const normalized = normalizeAideAttachedContextSettings(next);
    setSettings(normalized);
    pending.current = normalized;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  return { flush, saveFailed, settings, update };
}
