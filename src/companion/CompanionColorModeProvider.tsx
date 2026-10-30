import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { getBaseColorMode, setBaseColorMode } from '../features/settings/model/appearanceReadingModeSettings';
import { resolveBaseColorMode, type BaseColorMode } from '../features/settings/model/baseColorMode';
import { applyCompanionHostAppearance } from '../shared/platform/companion/runtime/companionAppearance';

function readColorMode() {
  try { return getBaseColorMode(); } catch { return 'system' as const; }
}

function useResolvedColorMode(mode: BaseColorMode) {
  const [resolved, setResolved] = useState(() => resolveBaseColorMode(mode));
  useLayoutEffect(() => {
    const refresh = () => setResolved(resolveBaseColorMode(mode));
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    refresh();
    if (media?.addEventListener) media.addEventListener('change', refresh);
    else media?.addListener(refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      if (media?.removeEventListener) media.removeEventListener('change', refresh);
      else media?.removeListener(refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [mode]);
  return mode === 'system' ? resolved : mode;
}

function useApplyColorMode(mode: ReturnType<typeof useResolvedColorMode>) {
  const [hostError, setHostError] = useState(false);
  const pending = useRef(Promise.resolve());
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.resolvedBaseColor = mode;
    root.style.colorScheme = mode;
    const channels = getComputedStyle(root).getPropertyValue('--color-canvas').trim();
    const background = channels ? `#${channels.split(/\s+/).map((value) => Number(value).toString(16).padStart(2, '0')).join('')}` : '';
    if (background) {
      for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', background);
    }
    let active = true;
    pending.current = pending.current.then(() => applyCompanionHostAppearance(mode, background)).then(() => {
      if (active) setHostError(false);
    }).catch(() => { if (active) setHostError(true); });
    return () => { active = false; };
  }, [mode]);
  return hostError;
}

interface CompanionColorModeValue {
  mode: BaseColorMode;
  saveError: boolean;
  hostError: boolean;
  updateMode(mode: BaseColorMode): void;
}

const CompanionColorModeContext = createContext<CompanionColorModeValue | null>(null);

export function CompanionColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState(readColorMode);
  const [saveError, setSaveError] = useState(false);
  const resolved = useResolvedColorMode(mode);
  const hostError = useApplyColorMode(resolved);
  const updateMode = (next: BaseColorMode) => {
    try {
      setBaseColorMode(next);
      setMode(next);
      setSaveError(false);
    } catch { setSaveError(true); }
  };
  return <CompanionColorModeContext.Provider value={{ mode, saveError, hostError, updateMode }}>
    {children}
  </CompanionColorModeContext.Provider>;
}

export function useCompanionColorMode() {
  return useContext(CompanionColorModeContext);
}
