import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { setCompanionFlowGestureRegion } from '../shared/platform/companion/runtime/companionFlowGestureRegion';
import type { HistoryMode } from '../store/workspaceReviewHistoryTarget';

import { FLOW_GESTURE_REGION, FLOW_GESTURE_MIN_TRAVEL, FLOW_GESTURE_MAX_VERTICAL_TRAVEL } from './companionFlowGestureTokens';

function useFlowGestureRegion(enabled: boolean) {
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    const update = () => {
      void setCompanionFlowGestureRegion({ ...FLOW_GESTURE_REGION, enabled,
        viewportWidth: window.innerWidth }).then(() => { if (active) setUnavailable(false); })
        .catch(() => { if (active) setUnavailable(true); });
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      active = false;
      window.removeEventListener('resize', update);
    };
  }, [enabled]);
  useEffect(() => () => {
    void setCompanionFlowGestureRegion({ ...FLOW_GESTURE_REGION, enabled: false,
      viewportWidth: window.innerWidth }).catch(() => {});
  }, []);
  return unavailable;
}

export function CompanionFlowEdgeGestures(props: {
  enabled: boolean; canUndo: boolean; canRedo: boolean; onApply(mode: HistoryMode): void;
}) {
  const t = useTranslation();
  const unavailable = useFlowGestureRegion(props.enabled);
  const start = useRef<{ id: number; x: number; y: number; mode: HistoryMode } | null>(null);
  function begin(event: PointerEvent, mode: HistoryMode) {
    start.current = null;
    if (!props.enabled || !(mode === 'undo' ? props.canUndo : props.canRedo) ||
      event.pointerType !== 'touch' || !event.isPrimary || !window.getSelection()?.isCollapsed) return;
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finish(event: PointerEvent) {
    const gesture = start.current;
    start.current = null;
    if (!gesture || gesture.id !== event.pointerId || !props.enabled ||
      !(gesture.mode === 'undo' ? props.canUndo : props.canRedo)) return;
    const horizontal = event.clientX - gesture.x;
    const vertical = Math.abs(event.clientY - gesture.y);
    const travel = gesture.mode === 'undo' ? horizontal : -horizontal;
    if (travel < FLOW_GESTURE_MIN_TRAVEL || vertical > FLOW_GESTURE_MAX_VERTICAL_TRAVEL ||
      !window.getSelection()?.isCollapsed) return;
    event.preventDefault();
    props.onApply(gesture.mode);
  }
  if (!props.enabled) return null;
  if (unavailable) return <p role="alert" className="fixed bottom-20 left-6 right-6 z-workspace-overlay text-sm text-error">{t('companion.reading.gestureError')}</p>;
  return <div className="pointer-events-none fixed inset-0 z-workspace-overlay">
    {(['undo', 'redo'] as const).map(mode => <button key={mode} type="button" data-testid={`flow-edge-${mode}`}
      aria-label={t(mode === 'undo' ? 'desktop.command.undo' : 'desktop.command.redo')}
      disabled={mode === 'undo' ? !props.canUndo : !props.canRedo}
      className="pointer-events-auto absolute top-1/2 -translate-y-1/2"
      style={{ width: FLOW_GESTURE_REGION.edgeWidth, height: FLOW_GESTURE_REGION.bandHeight,
        [mode === 'undo' ? 'left' : 'right']: 0, touchAction: 'pan-y pinch-zoom' }}
      onPointerDown={event => begin(event, mode)} onPointerUp={finish}
      onPointerMove={event => {
        if (start.current && Math.abs(event.clientY - start.current.y) > FLOW_GESTURE_MAX_VERTICAL_TRAVEL) start.current = null;
      }}
      onPointerCancel={() => { start.current = null; }}
      onClick={event => { if (event.detail === 0) props.onApply(mode); }} />)}
  </div>;
}
