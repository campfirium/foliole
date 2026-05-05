import { useEffect, useLayoutEffect, useState, type MutableRefObject } from 'react';

interface UseFitBlockImageHeightArgs {
  fitBlockImagesToViewport: boolean;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  nodeId: string | null;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number } | null) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  value: string;
}

function useImageHeightReporter(args: UseFitBlockImageHeightArgs) {
  const { fitBlockImagesToViewport, hostRef, nodeId, onFitBlockImageMetricsChange, rootRef, value } = args;
  const [imageMaxHeight, setImageMaxHeight] = useState<string | undefined>(undefined);

  useLayoutEffect(() => {
    if (!fitBlockImagesToViewport || !rootRef.current) {
      setImageMaxHeight(undefined);
      onFitBlockImageMetricsChange?.(null);
      return;
    }

    const element = rootRef.current;
    const host = hostRef.current;
    let frameId = 0;
    const updateHeight = () => {
      const scroller = element.querySelector('.cm-scroller') as HTMLElement | null;
      const imageElements = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLElement[];
      if (!scroller || imageElements.length === 0) {
        setImageMaxHeight(undefined);
        onFitBlockImageMetricsChange?.(null);
        return;
      }
      const totalImageHeight = imageElements.reduce((sum, image) => sum + image.getBoundingClientRect().height, 0);
      const nonImageHeight = Math.max(0, scroller.scrollHeight - totalImageHeight);
      const nextHeight = Math.max(120, Math.floor((scroller.clientHeight - nonImageHeight - 8) / imageElements.length));
      onFitBlockImageMetricsChange?.({ imageCount: imageElements.length, nonImageHeight });
      setImageMaxHeight((current) => {
        const nextValue = `${nextHeight}px`;
        return current === nextValue ? current : nextValue;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateHeight);
    };
    const handleImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.classList.contains('cm-md-image-element-block')) {
        schedule();
      }
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(element);
    if (host) {
      resizeObserver?.observe(host);
    }
    element.addEventListener('load', handleImageLoad, true);
    schedule();

    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener('load', handleImageLoad, true);
      resizeObserver?.disconnect();
    };
  }, [fitBlockImagesToViewport, hostRef, nodeId, onFitBlockImageMetricsChange, rootRef, value]);

  return imageMaxHeight;
}

interface UseImageLoadStateArgs {
  nodeId: string | null;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  value: string;
}

function useImageLoadStateReporter(args: UseImageLoadStateArgs) {
  const { nodeId, onImageLoadStateChange, rootRef, value } = args;

  useEffect(() => {
    if (!rootRef.current) {
      onImageLoadStateChange?.({ loadedCount: 0, totalCount: 0 });
      return;
    }

    const element = rootRef.current;
    let frameId = 0;
    const reportState = () => {
      const images = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLImageElement[];
      onImageLoadStateChange?.({
        loadedCount: images.filter((image) => image.complete).length,
        totalCount: images.length
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(reportState);
    };
    const handleImageEvent = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.classList.contains('cm-md-image-element-block')) {
        schedule();
      }
    };

    schedule();
    element.addEventListener('error', handleImageEvent, true);
    element.addEventListener('load', handleImageEvent, true);

    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener('error', handleImageEvent, true);
      element.removeEventListener('load', handleImageEvent, true);
    };
  }, [nodeId, onImageLoadStateChange, rootRef, value]);
}

export function useMarkdownEditorImageEffects(args: UseFitBlockImageHeightArgs & UseImageLoadStateArgs) {
  const imageMaxHeight = useImageHeightReporter(args);
  useImageLoadStateReporter(args);
  return imageMaxHeight;
}
