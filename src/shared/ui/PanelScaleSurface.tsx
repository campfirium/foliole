import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { useDisplayScale } from '../../features/settings/context/DisplayScaleProvider';
import type { PanelScaleId } from '../../features/settings/model/displayScaleSettings';

const PanelScaleSurfaceContext = createContext<PanelScaleId | null>(null);

function useScaleFeedback(enabled: boolean, percent: number) {
  const [showFeedback, setShowFeedback] = useState(false);
  const previousPercent = useRef(percent);
  useEffect(() => {
    if (!enabled) {
      previousPercent.current = percent;
      setShowFeedback(false);
      return undefined;
    }
    if (previousPercent.current === percent) return;
    previousPercent.current = percent;
    setShowFeedback(true);
    const timer = window.setTimeout(() => setShowFeedback(false), 900);
    return () => window.clearTimeout(timer);
  }, [enabled, percent]);
  return showFeedback;
}

export function PanelScaleSurface(props: {
  children: ReactNode;
  enabled?: boolean;
  label: string;
  panelId: PanelScaleId;
}) {
  const parentPanelId = useContext(PanelScaleSurfaceContext);
  if (parentPanelId) {
    throw new Error(`PanelScaleSurface ${props.panelId} cannot be nested inside ${parentPanelId}`);
  }

  const displayScale = useDisplayScale();
  const enabled = props.enabled !== false;
  const percent = enabled ? displayScale.getPanelScale(props.panelId) : 100;
  const showFeedback = useScaleFeedback(enabled, percent);

  useEffect(() => {
    if (!enabled) return undefined;
    return displayScale.registerPanel(props.panelId);
  }, [displayScale.registerPanel, enabled, props.panelId]);

  const focusPanel = () => {
    if (enabled) displayScale.focusPanel(props.panelId);
  };
  const scale = percent / 100;
  return (
    <PanelScaleSurfaceContext.Provider value={props.panelId}>
      <div
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
        data-panel-scale-surface=""
        {...(enabled ? { 'data-panel-scale-id': props.panelId } : {})}
        onFocusCapture={focusPanel}
        onPointerDownCapture={focusPanel}
      >
        <div
          className="flex h-full min-h-0 min-w-0 w-full flex-col origin-top-left"
          style={{ height: '100%', width: '100%', zoom: scale }}
        >
          {props.children}
        </div>
        {showFeedback ? (
          <div
            aria-live="polite"
            className="pointer-events-none absolute right-3 top-3 z-50 rounded-md bg-foreground/85 px-2.5 py-1 text-xs text-background shadow-md"
          >
            {props.label} · {percent}%
          </div>
        ) : null}
      </div>
    </PanelScaleSurfaceContext.Provider>
  );
}
