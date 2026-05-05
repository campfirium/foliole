import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { computeSharedBlockImageMaxHeight, type BlockImageMetrics } from './documentPanelBodyLayout';

function useDocumentPanelLayoutHeight(layoutRef: RefObject<HTMLDivElement | null>) {
  const [layoutHeight, setLayoutHeight] = useState(0);

  useEffect(() => {
    const element = layoutRef.current;
    if (!element) {
      return;
    }
    const updateHeight = () => {
      const stack = element.querySelector('.document-panel-editor-stack') as HTMLElement | null;
      const nextHeight = (stack ?? element).getBoundingClientRect().height;
      setLayoutHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight));
    };
    updateHeight();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [layoutRef]);

  return layoutHeight;
}

export function useDocumentPanelBodyMetrics(args: {
  editorContent: string;
  editorNodeId: string | null;
  onPromptImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  reveal: string;
}) {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const layoutHeight = useDocumentPanelLayoutHeight(layoutRef);
  const [promptImageMetrics, setPromptImageMetrics] = useState<BlockImageMetrics | null>(null);
  const [answerImageMetrics, setAnswerImageMetrics] = useState<BlockImageMetrics | null>(null);
  const [promptImageState, setPromptImageState] = useState({ loadedCount: 0, totalCount: 0 });
  const [answerImageState, setAnswerImageState] = useState({ loadedCount: 0, totalCount: 0 });

  const sharedBlockImageMaxHeight = useMemo(
    () =>
      computeSharedBlockImageMaxHeight({
        answerMetrics: answerImageMetrics,
        availableHeight: layoutHeight,
        promptMetrics: promptImageMetrics
      }),
    [answerImageMetrics, layoutHeight, promptImageMetrics]
  );

  const handlePromptImageLoadStateChange = useCallback(
    (state: { loadedCount: number; totalCount: number }) => setPromptImageState(state),
    []
  );
  const handleAnswerImageLoadStateChange = useCallback(
    (state: { loadedCount: number; totalCount: number }) => setAnswerImageState(state),
    []
  );

  useEffect(() => {
    setPromptImageState({ loadedCount: 0, totalCount: 0 });
    setAnswerImageState({ loadedCount: 0, totalCount: 0 });
  }, [args.editorContent, args.editorNodeId, args.reveal]);

  useEffect(() => {
    args.onPromptImageLoadStateChange?.({
      loadedCount: promptImageState.loadedCount + answerImageState.loadedCount,
      totalCount: promptImageState.totalCount + answerImageState.totalCount
    });
  }, [answerImageState, args.onPromptImageLoadStateChange, promptImageState]);

  return {
    handleAnswerImageLoadStateChange,
    handlePromptImageLoadStateChange,
    layoutRef,
    setAnswerImageMetrics,
    setPromptImageMetrics,
    sharedBlockImageMaxHeight
  };
}
