import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';

interface UseFitBlockImageHeightArgs {
  fitBlockImagesToViewport: boolean;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  hasMarkdownImages: boolean;
  imageEffectKey: string;
  nodeId: string | null;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number; viewportHeight: number } | null) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}

function measureNonImageHeight(content: HTMLElement) {
  const contentStyle = getComputedStyle(content);
  const paddingTop = Number.parseFloat(contentStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(contentStyle.paddingBottom) || 0;
  const directChildren = Array.from(content.children) as HTMLElement[];

  return directChildren.reduce((sum, child) => {
    const imageElement = child.querySelector('.cm-md-image-element-block') as HTMLElement | null;
    if (imageElement) {
      return sum + Math.max(0, child.getBoundingClientRect().height - imageElement.getBoundingClientRect().height);
    }
    return sum + child.getBoundingClientRect().height;
  }, paddingTop + paddingBottom);
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useImageHeightReporter(args: UseFitBlockImageHeightArgs) {
  const { fitBlockImagesToViewport, hasMarkdownImages, hostRef, imageEffectKey, nodeId, onFitBlockImageMetricsChange, rootRef } = args;
  const [imageMaxHeight, setImageMaxHeight] = useState<string | undefined>(undefined);
  const onFitBlockImageMetricsChangeRef = useLatestRef(onFitBlockImageMetricsChange);

  useLayoutEffect(() => {
    if (!fitBlockImagesToViewport || !hasMarkdownImages || !rootRef.current) {
      setImageMaxHeight(undefined);
      onFitBlockImageMetricsChangeRef.current?.(null);
      return;
    }

    const element = rootRef.current;
    const host = hostRef.current;
    let frameId = 0;
    const updateHeight = () => {
      const content = element.querySelector('.cm-content') as HTMLElement | null;
      const scroller = element.querySelector('.cm-scroller') as HTMLElement | null;
      const imageElements = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLElement[];
      if (!content || !scroller || imageElements.length === 0) {
        setImageMaxHeight(undefined);
        onFitBlockImageMetricsChangeRef.current?.(null);
        return;
      }
      const nonImageHeight = measureNonImageHeight(content);
      const nextHeight = Math.max(120, Math.floor((scroller.clientHeight - nonImageHeight - 8) / imageElements.length));
      onFitBlockImageMetricsChangeRef.current?.({ imageCount: imageElements.length, nonImageHeight, viewportHeight: scroller.clientHeight });
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
  }, [fitBlockImagesToViewport, hasMarkdownImages, hostRef, imageEffectKey, nodeId, onFitBlockImageMetricsChangeRef, rootRef]);

  return imageMaxHeight;
}

interface UseImageLoadStateArgs {
  hasMarkdownImages: boolean;
  imageEffectKey: string;
  nodeId: string | null;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}

function useImageLoadStateReporter(args: UseImageLoadStateArgs) {
  const { hasMarkdownImages, imageEffectKey, nodeId, onImageLoadStateChange, rootRef } = args;
  const onImageLoadStateChangeRef = useLatestRef(onImageLoadStateChange);

  useEffect(() => {
    if (!hasMarkdownImages || !rootRef.current) {
      onImageLoadStateChangeRef.current?.({ loadedCount: 0, totalCount: 0 });
      return;
    }

    const element = rootRef.current;
    let frameId = 0;
    const reportState = () => {
      const images = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLImageElement[];
      onImageLoadStateChangeRef.current?.({
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
  }, [hasMarkdownImages, imageEffectKey, nodeId, onImageLoadStateChangeRef, rootRef]);
}

export function useMarkdownEditorImageEffects(args: UseFitBlockImageHeightArgs & UseImageLoadStateArgs) {
  const imageMaxHeight = useImageHeightReporter(args);
  useImageLoadStateReporter(args);
  return { imageMaxHeight };
}
