import * as React from 'react';

import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from './Tooltip';

type TruncatedTextTooltipProps = {
  children: React.ReactNode;
  text: string;
} & React.ComponentPropsWithoutRef<'span'>;

const DEFAULT_SIDE_OFFSET = 6;
const TOOLTIP_ARROW_WIDTH = 8;
const TOOLTIP_ARROW_HEIGHT = 16;
const TOOLTIP_RADIUS = 12;
const TOOLTIP_BOUNDARY_GAP = 2;
const TOOLTIP_BOUNDARY_SELECTORS = [
  '.workspace-region-main-topic',
  '.workspace-region-main-folder',
  '[aria-label="Folder list body"]',
  '[aria-label="Current folder contents"]',
  '[role="tree"]',
];

function isElementTruncated(element: HTMLElement) {
  return element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight;
}

function getTooltipBoundary(element: HTMLElement) {
  for (const selector of TOOLTIP_BOUNDARY_SELECTORS) {
    const boundary = element.closest<HTMLElement>(selector);
    if (boundary) {
      return boundary;
    }
  }
  return null;
}

function getTooltipSideOffset(element: HTMLElement) {
  const boundary = getTooltipBoundary(element);
  if (!boundary) {
    return DEFAULT_SIDE_OFFSET;
  }

  const triggerRect = element.getBoundingClientRect();
  const boundaryRect = boundary.getBoundingClientRect();
  const offset = boundaryRect.right - triggerRect.right + TOOLTIP_ARROW_WIDTH + TOOLTIP_BOUNDARY_GAP;
  return Math.max(DEFAULT_SIDE_OFFSET, Math.round(offset));
}

function useElementSize(element: HTMLElement | null) {
  const [size, setSize] = React.useState({ height: 0, width: 0 });
  React.useLayoutEffect(() => {
    if (!element) return undefined;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setSize({ height: Math.round(rect.height), width: Math.round(rect.width) });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

function buildTooltipBubblePath(width: number, height: number) {
  const arrow = TOOLTIP_ARROW_WIDTH;
  const halfArrow = TOOLTIP_ARROW_HEIGHT / 2;
  const radius = Math.min(TOOLTIP_RADIUS, Math.floor(height / 2));
  const bodyRight = arrow + width;
  const centerY = height / 2;
  return [
    `M ${arrow + radius} 0`,
    `H ${bodyRight - radius}`,
    `Q ${bodyRight} 0 ${bodyRight} ${radius}`,
    `V ${height - radius}`,
    `Q ${bodyRight} ${height} ${bodyRight - radius} ${height}`,
    `H ${arrow + radius}`,
    `Q ${arrow} ${height} ${arrow} ${height - radius}`,
    `V ${centerY + halfArrow}`,
    `L 0 ${centerY}`,
    `L ${arrow} ${centerY - halfArrow}`,
    `V ${radius}`,
    `Q ${arrow} 0 ${arrow + radius} 0`,
    'Z',
  ].join(' ');
}

function TruncatedTooltipBubbleSurface({ height, width }: { height: number; width: number }) {
  if (height <= 0 || width <= 0) return null;
  const path = buildTooltipBubblePath(width, height);
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-[-8px] top-0 overflow-visible"
      focusable="false"
      height={height}
      viewBox={`0 0 ${width + TOOLTIP_ARROW_WIDTH} ${height}`}
      width={width + TOOLTIP_ARROW_WIDTH}
    >
      <path d={path} fill="var(--app-tooltip-bg)" stroke="var(--app-tooltip-border-color)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TruncatedTooltipContent(props: {
  setTooltipElement: (element: HTMLElement | null) => void;
  sideOffset: number;
  size: { height: number; width: number };
  text: string;
}) {
  return (
    <AppTooltipContent
      align="center"
      className="relative max-w-[min(16rem,calc(100vw-2rem))] overflow-visible border-transparent bg-transparent p-0 text-foreground/86 [--app-tooltip-bg:color-mix(in_srgb,rgb(var(--color-bg-elevated))_88%,rgb(var(--color-bg-panel))_12%)] [--app-tooltip-border-color:rgb(var(--color-foreground)/0.12)] [--app-tooltip-fg:rgb(var(--color-foreground)/0.86)] [--app-tooltip-shadow:var(--shadow-panel)]"
      ref={props.setTooltipElement}
      side="right"
      sideOffset={props.sideOffset}
    >
      <TruncatedTooltipBubbleSurface height={props.size.height} width={props.size.width} />
      <span className="relative block px-[var(--app-tooltip-padding-x)] py-[var(--app-tooltip-padding-y)]">{props.text}</span>
    </AppTooltipContent>
  );
}

export function TruncatedTextTooltip({ children, text, ...spanProps }: TruncatedTextTooltipProps) {
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);
  const [sideOffset, setSideOffset] = React.useState(DEFAULT_SIDE_OFFSET);
  const [tooltipElement, setTooltipElement] = React.useState<HTMLElement | null>(null);
  const tooltipSize = useElementSize(tooltipElement);

  const updateTooltipState = React.useCallback(() => {
    const element = textRef.current;
    setIsTruncated(element ? isElementTruncated(element) : false);
    setSideOffset(element ? getTooltipSideOffset(element) : DEFAULT_SIDE_OFFSET);
  }, []);

  React.useLayoutEffect(() => {
    updateTooltipState();
    const element = textRef.current;
    if (!element) {
      return;
    }

    window.addEventListener('resize', updateTooltipState);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', updateTooltipState);
    }

    const observer = new ResizeObserver(updateTooltipState);
    observer.observe(element);
    const boundary = getTooltipBoundary(element);
    if (boundary) {
      observer.observe(boundary);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTooltipState);
    };
  }, [text, updateTooltipState]);

  const textElement = (
    <span
      {...spanProps}
      data-truncated-text-tooltip-trigger={isTruncated ? 'true' : 'false'}
      data-truncated-text-tooltip-side-offset={isTruncated ? sideOffset : undefined}
      onFocus={updateTooltipState}
      onPointerEnter={updateTooltipState}
      ref={textRef}
    >
      {children}
    </span>
  );

  if (!isTruncated) {
    return textElement;
  }

  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>{textElement}</AppTooltipTrigger>
      <TruncatedTooltipContent setTooltipElement={setTooltipElement} sideOffset={sideOffset} size={tooltipSize} text={text} />
    </AppTooltip>
  );
}
