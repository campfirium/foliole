import { useEffect, useRef, useState } from 'react';

const SAVE_DELAY_MS = 400;

// Device-local Aide settings; every change applies from the next message, so edits are saved shortly after typing.
export function useAideDeviceSettings<T>(options: {
  createDefault: () => T;
  load: () => Promise<T | null>;
  normalize: (value: unknown) => T;
  save: (value: T) => Promise<unknown>;
}) {
  const { createDefault, load, normalize, save } = options;
  const [settings, setSettings] = useState<T>(createDefault);
  const [saveFailed, setSaveFailed] = useState(false);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    let active = true;
    void load()
      .then((value) => { if (active && value && !pending.current) setSettings(normalize(value)); })
      .catch(() => undefined);
    return () => { active = false; };
    // Loaded once when the pane opens.
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) void saveRef.current(pending.current).catch(() => undefined);
  }, []);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (!value) return;
    pending.current = null;
    void saveRef.current(value)
      .then(() => setSaveFailed(false))
      .catch(() => setSaveFailed(true));
  };

  const update = (next: T) => {
    const normalized = normalize(next);
    setSettings(normalized);
    pending.current = normalized;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  return { flush, saveFailed, settings, update };
}
