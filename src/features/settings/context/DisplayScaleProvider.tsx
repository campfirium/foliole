import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  notifyContentRegionScaleCommandStateChanged,
  registerContentRegionScaleCommandHandler
} from '../../../shared/commands/contentRegionScaleCommands';
import { APP_COMMAND_IDS } from '../../../shared/commands/ids';
import { applyAppDisplayScalePercent } from '../../../shared/platform/appDisplayScale';
import {
  DEFAULT_APP_DISPLAY_SCALE_PERCENT,
  DEFAULT_PANEL_SCALE_PERCENT,
  MAX_PANEL_SCALE_PERCENT,
  MIN_PANEL_SCALE_PERCENT,
  PANEL_SCALE_STEP,
  getAppDisplayScalePercent,
  getPanelScales,
  normalizePanelScalePercent,
  setAppDisplayScalePercent as persistAppDisplayScalePercent,
  setPanelScales,
  type PanelScaleId,
  type PanelScales
} from '../model/displayScaleSettings';

interface DisplayScaleContextValue {
  appDisplayScalePercent: number;
  panelScales: PanelScales;
  focusedPanelId: PanelScaleId | null;
  focusPanel: (panelId: PanelScaleId) => void;
  getPanelScale: (panelId: PanelScaleId) => number;
  registerPanel: (panelId: PanelScaleId) => () => void;
  setAppDisplayScalePercent: (percent: number) => void;
  setPanelScale: (panelId: PanelScaleId, percent: number) => void;
}

const DisplayScaleContext = createContext<DisplayScaleContextValue | null>(null);

function useMountedPanelRegistry() {
  const [mountedPanelIds, setMountedPanelIds] = useState<Set<PanelScaleId>>(() => new Set());
  const [focusedPanelId, setFocusedPanelId] = useState<PanelScaleId | null>(null);
  const registerPanel = useCallback((panelId: PanelScaleId) => {
    setMountedPanelIds((current) => new Set(current).add(panelId));
    return () => {
      setMountedPanelIds((current) => {
        const next = new Set(current);
        next.delete(panelId);
        return next;
      });
      setFocusedPanelId((current) => current === panelId ? null : current);
    };
  }, []);
  const focusPanel = useCallback((panelId: PanelScaleId) => {
    if (mountedPanelIds.has(panelId)) setFocusedPanelId(panelId);
  }, [mountedPanelIds]);
  return { focusPanel, focusedPanelId, mountedPanelIds, registerPanel };
}

export function DisplayScaleProvider({ children }: { children: ReactNode }) {
  const [appDisplayScalePercent, setAppScaleState] = useState(getAppDisplayScalePercent);
  const [panelScales, setPanelScalesState] = useState(getPanelScales);
  const { focusPanel, focusedPanelId, mountedPanelIds, registerPanel } = useMountedPanelRegistry();

  const setAppScale = useCallback((percent: number) => {
    const normalized = persistAppDisplayScalePercent(percent);
    setAppScaleState(normalized);
  }, []);

  useEffect(() => {
    void applyAppDisplayScalePercent(appDisplayScalePercent);
  }, [appDisplayScalePercent]);

  const setPanelScale = useCallback((panelId: PanelScaleId, percent: number) => {
    setPanelScalesState((current) => {
      const normalized = normalizePanelScalePercent(percent);
      const next = { ...current };
      if (normalized === DEFAULT_PANEL_SCALE_PERCENT) delete next[panelId];
      else next[panelId] = normalized;
      setPanelScales(next);
      return next;
    });
  }, []);

  useEffect(() => {
    notifyContentRegionScaleCommandStateChanged();
  }, [focusedPanelId, mountedPanelIds, panelScales]);

  useEffect(() => registerContentRegionScaleCommandHandler({
    isEnabled: (id) => {
      if (!focusedPanelId || !mountedPanelIds.has(focusedPanelId)) return false;
      const percent = panelScales[focusedPanelId] ?? DEFAULT_PANEL_SCALE_PERCENT;
      if (id === APP_COMMAND_IDS.increaseContentRegionScale) return percent < MAX_PANEL_SCALE_PERCENT;
      if (id === APP_COMMAND_IDS.decreaseContentRegionScale) return percent > MIN_PANEL_SCALE_PERCENT;
      return percent !== DEFAULT_PANEL_SCALE_PERCENT;
    },
    run: (id) => {
      if (!focusedPanelId || !mountedPanelIds.has(focusedPanelId)) return false;
      const percent = panelScales[focusedPanelId] ?? DEFAULT_PANEL_SCALE_PERCENT;
      const next = id === APP_COMMAND_IDS.increaseContentRegionScale
        ? percent + PANEL_SCALE_STEP
        : id === APP_COMMAND_IDS.decreaseContentRegionScale ? percent - PANEL_SCALE_STEP : DEFAULT_PANEL_SCALE_PERCENT;
      setPanelScale(focusedPanelId, next);
      return true;
    }
  }), [focusedPanelId, mountedPanelIds, panelScales, setPanelScale]);

  const value = useMemo<DisplayScaleContextValue>(() => ({
    appDisplayScalePercent,
    panelScales,
    focusedPanelId,
    focusPanel,
    getPanelScale: (panelId) => panelScales[panelId] ?? DEFAULT_PANEL_SCALE_PERCENT,
    registerPanel,
    setAppDisplayScalePercent: setAppScale,
    setPanelScale
  }), [appDisplayScalePercent, focusPanel, focusedPanelId, panelScales, registerPanel, setAppScale, setPanelScale]);

  return <DisplayScaleContext.Provider value={value}>{children}</DisplayScaleContext.Provider>;
}

export function useDisplayScale() {
  const value = useContext(DisplayScaleContext);
  if (!value) throw new Error('useDisplayScale must be used within DisplayScaleProvider');
  return value;
}

export { DEFAULT_APP_DISPLAY_SCALE_PERCENT };
