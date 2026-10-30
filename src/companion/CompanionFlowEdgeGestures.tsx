import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { setCompanionFlowGestureRegion } from '../shared/platform/companion/runtime/companionFlowGestureRegion';
import type { HistoryMode } from '../store/workspaceReviewHistoryTarget';

import { FLOW_GESTURE_REGION, FLOW_GESTURE_MIN_TRAVEL, FLOW_GESTURE_MAX_VERTICAL_TRAVEL } from './companionFlowGestureTokens';
import { useCompanionReadingPageNavigation } from './CompanionReadingPageNavigation';
import { useCompanionTouchClick } from './useCompanionTouchClick';

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
  const turnPage = useCompanionReadingPageNavigation();
  const start = useRef<{ id: number; x: number; y: number; mode: HistoryMode; startedAt: number } | null>(null);
  function begin(event: PointerEvent, mode: HistoryMode) {
    start.current = null;
    if (!props.enabled || (!turnPage && !(mode === 'undo' ? props.canUndo : props.canRedo)) ||
      event.pointerType !== 'touch' || !event.isPrimary || !window.getSelection()?.isCollapsed) return;
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, mode, startedAt: Date.now() };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finish(event: PointerEvent) {
    const gesture = start.current;
    start.current = null;
    if (!gesture || gesture.id !== event.pointerId || !props.enabled || !window.getSelection()?.isCollapsed) return;
    const horizontal = event.clientX - gesture.x;
    const vertical = Math.abs(event.clientY - gesture.y);
    if (turnPage && vertical >= 40 && vertical > Math.abs(horizontal) && Date.now() - gesture.startedAt < 500) {
      turnPage(event.clientY < gesture.y ? 1 : -1);
      return;
    }
    if (!(gesture.mode === 'undo' ? props.canUndo : props.canRedo)) return;
    const travel = gesture.mode === 'undo' ? horizontal : -horizontal;
    if (travel < FLOW_GESTURE_MIN_TRAVEL || vertical > FLOW_GESTURE_MAX_VERTICAL_TRAVEL ||
      !window.getSelection()?.isCollapsed) return;
    event.preventDefault();
    props.onApply(gesture.mode);
  }
  if (!props.enabled) return null;
  if (unavailable) return <p role="alert" className="fixed bottom-20 left-6 right-6 z-workspace-overlay text-sm text-error">{t('companion.reading.gestureError')}</p>;
  return <div className="pointer-events-none fixed inset-0 z-workspace-overlay">
    {(['undo', 'redo'] as const).map(mode => <FlowEdgeTouchRegion key={mode} mode={mode}
      paged={Boolean(turnPage)} enabled={Boolean(turnPage) || (mode === 'undo' ? props.canUndo : props.canRedo)}
      label={t(mode === 'undo' ? 'desktop.command.undo' : 'desktop.command.redo')}
      onActivate={event => {
        if (window.getSelection()?.isCollapsed === false) return;
        if (turnPage) turnPage(mode === 'undo' ? -1 : 1);
        else if (event.type === 'click' && event.detail === 0) props.onApply(mode);
      }}
      onBegin={event => begin(event, mode)} onFinish={finish}
      onMove={event => {
        if (!turnPage && start.current && Math.abs(event.clientY - start.current.y) > FLOW_GESTURE_MAX_VERTICAL_TRAVEL) start.current = null;
      }} onCancel={() => { start.current = null; }} />)}
  </div>;
}

function FlowEdgeTouchRegion(props: {
  mode: HistoryMode; enabled: boolean; paged: boolean; label: string;
  onActivate: Parameters<typeof useCompanionTouchClick>[0];
  onBegin(event: PointerEvent): void; onFinish(event: PointerEvent): void;
  onMove(event: PointerEvent): void; onCancel(): void;
}) {
  const tap = useCompanionTouchClick(props.onActivate, { disabled: !props.enabled, preserveSelection: true });
  return <button type="button" data-testid={`flow-edge-${props.mode}`} aria-label={props.label}
    disabled={!props.enabled} className="pointer-events-auto absolute"
    style={{ width: FLOW_GESTURE_REGION.edgeWidth, height: FLOW_GESTURE_REGION.bandHeight,
      top: `min(calc(100% - ${FLOW_GESTURE_REGION.bandHeight}px), max(44px, calc((100% / 3 - ${FLOW_GESTURE_REGION.bandHeight}px) / 2)))`,
      [props.mode === 'undo' ? 'left' : 'right']: 0, touchAction: props.paged ? 'pinch-zoom' : 'pan-y pinch-zoom' }}
    onPointerDown={event => { tap.onPointerDown(event); props.onBegin(event); }}
    onPointerUp={event => { tap.onPointerUp(event); props.onFinish(event); }}
    onPointerMove={event => { tap.onPointerMove(event); props.onMove(event); }}
    onPointerCancel={() => { tap.onPointerCancel(); props.onCancel(); }} onClick={tap.onClick} />;
}
