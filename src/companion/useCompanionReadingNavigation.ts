import { useEffect, useRef, useState } from 'react';

import type { CompanionReadingActivity } from './companionReadingActivity';

export type CompanionReadingNavigation = {
  key: string;
  previous: (() => void) | undefined;
  next: (() => void) | undefined;
};
export type CompanionReadingNavigationControls = {
  disabled: boolean;
  error: boolean;
  previous: (() => void) | undefined;
  next: (() => void) | undefined;
};

export function useCompanionReadingNavigation(activity: CompanionReadingActivity,
  navigation: CompanionReadingNavigation | undefined): CompanionReadingNavigationControls | undefined {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const latest = useRef(navigation);
  latest.current = navigation;
  const owner = useRef<object | null>(null);
  useEffect(() => {
    owner.current = {};
    busy.current = false;
    setOpening(false);
    setError(false);
    return () => { owner.current = null; };
  }, [activity, navigation?.key]);

  async function open(direction: 'previous' | 'next') {
    if (busy.current || activity.editing || !latest.current?.[direction]) return;
    const started = owner.current;
    busy.current = true;
    setOpening(true);
    setError(false);
    try {
      await activity.flush();
      if (started && owner.current === started && !activity.editing) latest.current?.[direction]?.();
    } catch {
      if (owner.current === started) setError(true);
    } finally {
      if (owner.current === started) { busy.current = false; setOpening(false); }
    }
  }
  return navigation ? {
    disabled: opening || activity.editing,
    error,
    previous: navigation.previous ? () => void open('previous') : undefined,
    next: navigation.next ? () => void open('next') : undefined
  } : undefined;
}
