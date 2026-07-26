import { useCallback, useEffect, useRef, useState } from 'react';

const SNAPSHOT_SETTLE_DELAY_MS = 300;

export interface SourceUpdatePanelSnapshots {
  current: string;
  setCurrent: (content: string) => void;
  setUpdated: (content: string) => void;
  updated: string;
}

export function useSourceUpdatePanelSnapshots(args: {
  comparisonMode: string;
  currentContent: string;
  updatedContent: string;
}): SourceUpdatePanelSnapshots {
  const currentRef = useRef(args.currentContent);
  const modeRef = useRef(args.comparisonMode);
  const updatedRef = useRef(args.updatedContent);
  const timerRef = useRef<number | null>(null);
  const [snapshots, setSnapshots] = useState({
    current: args.currentContent,
    updated: args.updatedContent
  });

  const publishSettledSnapshot = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setSnapshots({ current: currentRef.current, updated: updatedRef.current });
    }, SNAPSHOT_SETTLE_DELAY_MS);
  }, []);
  const setCurrent = useCallback((content: string) => {
    currentRef.current = content;
    publishSettledSnapshot();
  }, [publishSettledSnapshot]);
  const setUpdated = useCallback((content: string) => {
    updatedRef.current = content;
    publishSettledSnapshot();
  }, [publishSettledSnapshot]);

  useEffect(() => {
    updatedRef.current = args.updatedContent;
    setSnapshots((current) => current.updated === args.updatedContent
      ? current
      : { ...current, updated: args.updatedContent });
  }, [args.comparisonMode, args.updatedContent]);
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const modeChanged = modeRef.current !== args.comparisonMode;
  if (modeChanged) {
    modeRef.current = args.comparisonMode;
    updatedRef.current = args.updatedContent;
  }

  return {
    ...snapshots,
    setCurrent,
    setUpdated,
    updated: modeChanged ? args.updatedContent : snapshots.updated
  };
}
