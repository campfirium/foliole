import { useEffect, useState } from 'react';

import { cn } from '../lib/utils';

import { AppSpinner } from './EmptyState';

type LoadingPhase = 'quiet' | 'spinner' | 'details';

// A timer can fire just before the wall clock reaches its delay, so the fired delay is the lower bound.
function phaseAt(startedAt: number, reachedMs = 0): LoadingPhase {
  const elapsed = Math.max(Date.now() - startedAt, reachedMs);
  return elapsed >= 2000 ? 'details' : elapsed >= 300 ? 'spinner' : 'quiet';
}

function useLoadingPhase(startedAt: number) {
  const [phase, setPhase] = useState(() => phaseAt(startedAt));
  useEffect(() => {
    setPhase(phaseAt(startedAt));
    const timers = [300, 2000].map((delay) => globalThis.setTimeout(
      () => setPhase(phaseAt(startedAt, delay)), Math.max(0, startedAt + delay - Date.now())
    ));
    return () => timers.forEach((timer) => globalThis.clearTimeout(timer));
  }, [startedAt]);
  return phase;
}

export interface StartupLoadingSurfaceProps {
  description?: string;
  progress?: { completed: number; total: number };
  progressLabel?: string;
  startedAt?: number;
  title: string;
}

export function StartupLoadingSurface(props: StartupLoadingSurfaceProps) {
  const [mountedAt] = useState(Date.now);
  const phase = useLoadingPhase(props.startedAt ?? mountedAt);
  const showDetails = phase === 'details';
  const percent = props.progress && props.progress.total > 0
    ? Math.max(0, Math.min(100, Math.round(props.progress.completed / props.progress.total * 100)))
    : null;
  return (
    <main
      aria-busy="true"
      aria-label={phase !== 'quiet' ? props.title : undefined}
      className={cn('flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-foreground',
        showDetails && 'bg-[rgb(var(--role-legacy-canvas-rgb))]')}
      data-startup-loading-phase={phase}
      role={phase !== 'quiet' ? 'status' : undefined}
    >
      {phase !== 'quiet' && !(showDetails && percent !== null) ? (
        <AppSpinner className="motion-reduce:animate-none" decorative size="sm" />
      ) : null}
      {showDetails ? <h1 className="m-0 text-ui-md font-semibold">{props.title}</h1> : null}
      {showDetails && props.description ? (
        <p className="m-0 max-w-prose text-ui-base text-foreground/60">{props.description}</p>
      ) : null}
      {showDetails && percent !== null ? (
        <div
          aria-label={props.progressLabel ?? props.title}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="h-2 w-full max-w-[360px] overflow-hidden rounded-full bg-foreground/10"
          role="progressbar"
        >
          <div aria-hidden="true" className="h-full rounded-full bg-foreground/70" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </main>
  );
}
