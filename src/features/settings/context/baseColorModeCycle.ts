import { useCallback, useEffect, useRef, useState } from 'react';

import type { BaseColorMode, ResolvedBaseColorMode } from '../model/baseColorMode';

export const BASE_COLOR_MODE_SELECTION_DURATION_MS = 2_000;

type CycleSession = {
  index: number;
  sequence: readonly BaseColorMode[];
};

function createSequence(resolvedMode: ResolvedBaseColorMode): readonly BaseColorMode[] {
  return resolvedMode === 'light'
    ? ['dark', 'system', 'light']
    : ['light', 'system', 'dark'];
}

export function useBaseColorModeCycle() {
  const [isBaseColorModeSelectionActiveState, setSelectionActive] = useState(false);
  const sessionRef = useRef<CycleSession | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const advanceBaseColorModeCycle = useCallback((resolvedMode: ResolvedBaseColorMode) => {
    const session = sessionRef.current ?? { index: -1, sequence: createSequence(resolvedMode) };
    const index = (session.index + 1) % session.sequence.length;
    sessionRef.current = { ...session, index };
    setSelectionActive(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      sessionRef.current = null;
      setSelectionActive(false);
    }, BASE_COLOR_MODE_SELECTION_DURATION_MS);
    return session.sequence[index]!;
  }, []);

  return { advanceBaseColorModeCycle, isBaseColorModeSelectionActiveState };
}
