import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  notifyContentRegionScaleCommandStateChanged,
  registerContentRegionScaleCommandHandler
} from '../../../shared/commands/contentRegionScaleCommands';
import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { applyAppDisplayScalePercent } from '../../../shared/platform/appDisplayScale';
import {
  DEFAULT_APP_DISPLAY_SCALE_PERCENT,
  DEFAULT_CONTENT_REGION_SCALE_PERCENT,
  getAppDisplayScalePercent,
  getContentRegionScales,
  normalizeContentRegionScalePercent,
  setAppDisplayScalePercent as persistAppDisplayScalePercent,
  setContentRegionScales,
  type ContentRegionScaleId,
  type ContentRegionScales
} from '../model/displayScaleSettings';

interface DisplayScaleContextValue {
  appDisplayScalePercent: number;
  contentRegionScales: ContentRegionScales;
  focusedContentRegionId: ContentRegionScaleId | null;
  focusContentRegion: (regionId: ContentRegionScaleId) => void;
  getContentRegionScale: (regionId: ContentRegionScaleId) => number;
  setAppDisplayScalePercent: (percent: number) => void;
  setContentRegionScale: (regionId: ContentRegionScaleId, percent: number) => void;
}

const DisplayScaleContext = createContext<DisplayScaleContextValue | null>(null);

export function DisplayScaleProvider({ children }: { children: ReactNode }) {
  const [appDisplayScalePercent, setAppScaleState] = useState(getAppDisplayScalePercent);
  const [contentRegionScales, setRegionScalesState] = useState(getContentRegionScales);
  const [focusedContentRegionId, focusContentRegion] = useState<ContentRegionScaleId | null>(null);

  const setAppScale = useCallback((percent: number) => {
    const normalized = persistAppDisplayScalePercent(percent);
    setAppScaleState(normalized);
  }, []);

  useEffect(() => {
    void applyAppDisplayScalePercent(appDisplayScalePercent);
  }, [appDisplayScalePercent]);

  const setContentRegionScale = useCallback((regionId: ContentRegionScaleId, percent: number) => {
    setRegionScalesState((current) => {
      const normalized = normalizeContentRegionScalePercent(percent);
      const next = { ...current };
      if (normalized === DEFAULT_CONTENT_REGION_SCALE_PERCENT) delete next[regionId];
      else next[regionId] = normalized;
      setContentRegionScales(next);
      return next;
    });
  }, []);

  useEffect(() => {
    notifyContentRegionScaleCommandStateChanged();
  }, [contentRegionScales, focusedContentRegionId]);

  useEffect(() => registerContentRegionScaleCommandHandler({
    isEnabled: (id) => {
      if (!focusedContentRegionId) return false;
      const percent = contentRegionScales[focusedContentRegionId] ?? DEFAULT_CONTENT_REGION_SCALE_PERCENT;
      if (id === APP_COMMAND_IDS.increaseContentRegionScale) return percent < 160;
      if (id === APP_COMMAND_IDS.decreaseContentRegionScale) return percent > 80;
      return percent !== DEFAULT_CONTENT_REGION_SCALE_PERCENT;
    },
    run: (id) => {
      if (!focusedContentRegionId) return false;
      const percent = contentRegionScales[focusedContentRegionId] ?? DEFAULT_CONTENT_REGION_SCALE_PERCENT;
      const next = id === APP_COMMAND_IDS.increaseContentRegionScale
        ? percent + 10
        : id === APP_COMMAND_IDS.decreaseContentRegionScale ? percent - 10 : DEFAULT_CONTENT_REGION_SCALE_PERCENT;
      setContentRegionScale(focusedContentRegionId, next);
      return true;
    }
  }), [contentRegionScales, focusedContentRegionId, setContentRegionScale]);

  const value = useMemo<DisplayScaleContextValue>(() => ({
    appDisplayScalePercent,
    contentRegionScales,
    focusedContentRegionId,
    focusContentRegion,
    getContentRegionScale: (regionId) => contentRegionScales[regionId] ?? DEFAULT_CONTENT_REGION_SCALE_PERCENT,
    setAppDisplayScalePercent: setAppScale,
    setContentRegionScale
  }), [appDisplayScalePercent, contentRegionScales, focusedContentRegionId, setAppScale, setContentRegionScale]);

  return <DisplayScaleContext.Provider value={value}>{children}</DisplayScaleContext.Provider>;
}

export function useDisplayScale() {
  const value = useContext(DisplayScaleContext);
  if (!value) throw new Error('useDisplayScale must be used within DisplayScaleProvider');
  return value;
}

export { DEFAULT_APP_DISPLAY_SCALE_PERCENT };
