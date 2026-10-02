import { useEffect, useMemo, useState } from 'react';

import { reviewCalendarDayKey, reviewCalendarMonths } from '../../../../lib/core/review/reviewCalendarDates';
import { resolveCurrentDayStart } from '../../../../lib/core/review/reviewDayBoundary';
import type { NativeReviewCalendarHistory } from '../../../../lib/platform/nativeReviewCalendarContract';
import { loadReviewCalendarHistoryFromRuntime } from '../../../shared/platform/runtime/reviewCalendarRuntimeRepository';
import { selectReviewCalendarSchedule } from '../../../store/workspaceReviewCalendar';
import { useWorkspaceStore } from '../../../store/workspaceStore';
import { getCurrentReviewSchedulerSettings } from '../../settings/model/reviewSchedulerSettings';

export function useReviewCalendar() {
  const nodesById = useWorkspaceStore((s) => s.nodesById);
  const nodeOrder = useWorkspaceStore((s) => s.nodeOrder);
  const trashedNodeIds = useWorkspaceStore((s) => s.trashedNodeIds);
  const [now, setNow] = useState(() => new Date());
  const [history, setHistory] = useState<NativeReviewCalendarHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const hour = getCurrentReviewSchedulerSettings().newDayStartsAtHour;
  const today = reviewCalendarDayKey(now, hour);
  const months = useMemo(() => reviewCalendarMonths(resolveCurrentDayStart(now, hour)), [today, hour]);
  const from = new Date(months[0]!.getFullYear(), months[0]!.getMonth(), 1, hour).toISOString();
  const last = months[11]!;
  const to = new Date(last.getFullYear(), last.getMonth() + 1, 1, hour).toISOString();

  useEffect(() => {
    let cancelled = false;
    setHistory(null); setFailed(false);
    void loadReviewCalendarHistoryFromRuntime({ from, to }).then((result) => {
      if (!cancelled) setHistory(result);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [from, to, nodesById, retry]);

  useEffect(() => {
    const update = () => { setNow(new Date()); setRetry((v) => v + 1); };
    const boundary = resolveCurrentDayStart(new Date(), hour);
    boundary.setDate(boundary.getDate() + 1);
    const timer = window.setTimeout(update, Math.max(1, boundary.getTime() - Date.now()));
    window.addEventListener('focus', update);
    return () => { window.clearTimeout(timer); window.removeEventListener('focus', update); };
  }, [today, hour]);

  const schedule = useMemo(() => selectReviewCalendarSchedule({
    nodeOrder, nodesById, trashedNodeIds, now: now.toISOString(), newDayStartsAtHour: hour
  }), [nodesById, nodeOrder, trashedNodeIds, now, hour]);
  const recorded = useMemo(() => new Map(history?.days.map((day) => [day.day, day])), [history]);
  function counts(day: string) {
    if (day >= today) return schedule[day] ?? { day, items: 0, topics: 0 };
    if (!history) return { day, items: null, topics: null };
    return recorded.get(day) ?? { day, items: 0, topics: day < history.topicCoverageFrom ? null : 0 };
  }
  return { today, months, counts, failed, retry: () => setRetry((v) => v + 1) };
}
