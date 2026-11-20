import { useInsertionEffect, useLayoutEffect, useRef } from 'react';

import type { FlowTiming } from '../../lib/core/flow/flowTiming';
import { noteAndroidFlowCard, recordAndroidFlowNextCard } from '../shared/platform/supportLog/androidFlowTiming';

import type { CompanionReadingActivity } from './companionReadingActivity';

export type FlowDisplayTiming = {
  timing: FlowTiming; nodeId: string; generation: number; bodySettled?: boolean; editorSettled?: boolean; lastBodyStatus?: string;
};

const editorTimings = new WeakMap<CompanionReadingActivity, FlowDisplayTiming>();

export function markFlowEditorReady(activity: CompanionReadingActivity | undefined, nodeId: string) {
  const timing = activity && editorTimings.get(activity);
  if (timing?.nodeId === nodeId) finishEditor(timing, 'done');
}

function finishEditor(timing: FlowDisplayTiming, status: 'done' | 'cancelled' | 'skipped') {
  if (timing.editorSettled) return;
  timing.editorSettled = true;
  timing.timing('editor-ready', status);
}

export function finishFlowBody(timing: FlowDisplayTiming | undefined, status: 'done' | 'cancelled' | 'failed' | 'empty') {
  if (!timing) return;
  if (!timing.bodySettled) {
    timing.bodySettled = true;
    timing.timing('body', status);
  }
  if (status !== 'done') finishEditor(timing, status === 'cancelled' ? 'cancelled' : 'skipped');
}

export function useCompanionFlowBodyTiming(timing: FlowDisplayTiming | undefined, currentNodeId: string | null,
  article: { nodeId: string; bodyStatus?: string | undefined; content?: string } | null, activity: CompanionReadingActivity, active: boolean) {
  const previous = useRef<FlowDisplayTiming | undefined>(undefined);
  useInsertionEffect(() => {
    if (!timing || !active || timing.nodeId !== currentNodeId || activity.nodeId !== currentNodeId) return;
    editorTimings.set(activity, timing);
    return () => { editorTimings.delete(activity); };
  }, [timing, currentNodeId, activity, active]);
  useLayoutEffect(() => {
    if (previous.current !== timing) finishFlowBody(previous.current, 'cancelled');
    previous.current = timing;
    if (!timing) return;
    if (!active || timing.nodeId !== currentNodeId) finishFlowBody(timing, 'cancelled');
    else if (!timing.bodySettled && article?.nodeId === timing.nodeId) {
      switch (article.bodyStatus) {
        case undefined: case 'ready':
          recordAndroidFlowNextCard(timing.timing, article.nodeId, article.content ?? '');
          finishFlowBody(timing, 'done');
          break;
        case 'failed': case 'empty': finishFlowBody(timing, article.bodyStatus); break;
        case 'missing': case 'fetching':
          if (timing.lastBodyStatus !== article.bodyStatus) timing.timing(`body-${article.bodyStatus}`, 'done');
          timing.lastBodyStatus = article.bodyStatus;
      }
    }
  }, [timing, currentNodeId, article, active]);
  useLayoutEffect(() => {
    // Runs after the display branch so an action's source card is replaced only once its successor is recorded.
    if (active && article && article.nodeId === currentNodeId && (!article.bodyStatus || article.bodyStatus === 'ready')) {
      noteAndroidFlowCard(article.nodeId, article.content ?? '');
    }
  }, [currentNodeId, article, active]);
  useLayoutEffect(() => () => finishFlowBody(previous.current, 'cancelled'), []);
}
