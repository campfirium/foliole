import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react';

const SNAPSHOT_SETTLE_DELAY_MS = 300;

function createSettledSnapshot(current: string, updated: string, updatedExternalVersion: number) {
  return { current, updated, updatedExternalVersion };
}

function useExternalUpdatedContentSync(args: {
  comparisonMode: string;
  setSnapshots: Dispatch<SetStateAction<ReturnType<typeof createSettledSnapshot>>>;
  updatedContent: string;
  updatedRef: MutableRefObject<string>;
}) {
  const didSyncInitialUpdatedRef = useRef(false);
  const { comparisonMode, setSnapshots, updatedContent, updatedRef } = args;
  useEffect(() => {
    if (!didSyncInitialUpdatedRef.current) {
      didSyncInitialUpdatedRef.current = true;
      return;
    }
    const isExternalUpdate = updatedRef.current !== updatedContent;
    updatedRef.current = updatedContent;
    setSnapshots((current) => current.updated === updatedContent && !isExternalUpdate
      ? current
      : createSettledSnapshot(
          current.current,
          updatedContent,
          current.updatedExternalVersion + (isExternalUpdate ? 1 : 0)
        ));
  }, [comparisonMode, setSnapshots, updatedContent, updatedRef]);
}

export interface SourceUpdatePanelSnapshots {
  current: string;
  setCurrent: (content: string) => void;
  setUpdated: (content: string) => void;
  updated: string;
  updatedExternalVersion: number;
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
    updated: args.updatedContent,
    updatedExternalVersion: 0
  });

  const publishSettledSnapshot = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setSnapshots((current) =>
        createSettledSnapshot(currentRef.current, updatedRef.current, current.updatedExternalVersion));
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

  useExternalUpdatedContentSync({
    comparisonMode: args.comparisonMode,
    setSnapshots,
    updatedContent: args.updatedContent,
    updatedRef
  });
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
