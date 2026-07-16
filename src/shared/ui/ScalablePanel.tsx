import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useDisplayScale } from '../../features/settings/context/DisplayScaleProvider';
import type { PanelScaleId } from '../../features/settings/model/displayScaleSettings';
import { cn } from '../lib/utils';

export function ScalablePanel(props: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
  label: string;
  panelId: PanelScaleId;
}) {
  const displayScale = useDisplayScale();
  const enabled = props.enabled !== false;
  const percent = enabled ? displayScale.getPanelScale(props.panelId) : 100;
  const [showFeedback, setShowFeedback] = useState(false);
  const previousPercent = useRef(percent);

  useEffect(() => {
    if (!enabled) return undefined;
    return displayScale.registerPanel(props.panelId);
  }, [displayScale.registerPanel, enabled, props.panelId]);
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

  const focusPanel = () => {
    if (enabled) displayScale.focusPanel(props.panelId);
  };
  const scale = percent / 100;
  const compensatedSize = `${(100 / scale).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}%`;
  return (
    <div
      className={cn('relative min-h-0 min-w-0 overflow-hidden', props.className)}
      {...(enabled ? { 'data-panel-scale-id': props.panelId } : {})}
      onFocusCapture={focusPanel}
      onPointerDownCapture={focusPanel}
    >
      <div
        className="flex min-h-0 min-w-0 origin-top-left"
        style={{ height: compensatedSize, width: compensatedSize, zoom: scale }}
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
  );
}
