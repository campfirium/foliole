import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';

import { getStoredAppLocale } from '../localization/appLanguage';
import { preloadTranslationCatalog } from '../localization/translations';

import { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger } from './Tooltip';
import { TruncatedTextTooltip } from './TruncatedTextTooltip';

beforeAll(() => preloadTranslationCatalog(getStoredAppLocale()));

class TestResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

function makeRect(right: number): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right,
    top: 0,
    width: right,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
}

it('renders tooltip content with shared tooltip tokens', () => {
  render(
    <AppTooltipProvider delayDuration={0}>
      <AppTooltip defaultOpen>
        <AppTooltipTrigger asChild>
          <button type="button">Hover</button>
        </AppTooltipTrigger>
        <AppTooltipContent>Shared tooltip</AppTooltipContent>
      </AppTooltip>
    </AppTooltipProvider>
  );

  const tooltip = screen.getByRole('tooltip').parentElement;
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  expect(tooltip).not.toBeNull();
  if (!tooltip) {
    throw new Error('Tooltip content wrapper missing');
  }
  expect(tooltip.className).toContain('rounded-[var(--app-tooltip-radius)]');
  expect(tooltip.className).toContain('bg-[var(--app-tooltip-bg)]');
  expect(tooltip.className).toContain('border-[var(--app-tooltip-border-color)]');
  expect(tooltip.className).toContain('text-[var(--app-tooltip-fg)]');
  expect(tooltip.className).toContain('whitespace-normal');
  expect(tooltip.className).toContain('[box-shadow:var(--app-tooltip-shadow)]');
});

it('renders optional tooltip arrows using the tooltip surface tokens', () => {
  const resizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = TestResizeObserver as typeof ResizeObserver;

  try {
    render(
      <AppTooltipProvider delayDuration={0}>
        <AppTooltip defaultOpen>
          <AppTooltipTrigger asChild>
            <button type="button">Hover</button>
          </AppTooltipTrigger>
          <AppTooltipContent arrow>Shared tooltip</AppTooltipContent>
        </AppTooltip>
      </AppTooltipProvider>
    );

    const arrow = document.querySelector('svg');
    const arrowPath = document.querySelector('svg path');
    expect(arrow).not.toBeNull();
    expect(arrow).toHaveClass('translate-y-[-1px]');
    expect(arrowPath).toHaveAttribute('d', 'M 0 0 L 6 7 L 12 0');
    expect(arrowPath).toHaveAttribute('fill', 'var(--app-tooltip-bg)');
    expect(arrowPath).toHaveAttribute('stroke', 'var(--app-tooltip-border-color)');
  } finally {
    globalThis.ResizeObserver = resizeObserver;
  }
});

it('enables title tooltip trigger only when text is truncated', () => {
  const scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 120 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 80 });

  try {
    render(<TruncatedTextTooltip text="Long title">Long title</TruncatedTextTooltip>);
    expect(screen.getByText('Long title')).toHaveAttribute('data-truncated-text-tooltip-trigger', 'true');
  } finally {
    if (scrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  }
});

it('enables title tooltip trigger when a full tooltip is forced', () => {
  render(
    <TruncatedTextTooltip forceTooltip text="Full path">
      Short
    </TruncatedTextTooltip>
  );
  expect(screen.getByText('Short')).toHaveAttribute('data-truncated-text-tooltip-trigger', 'true');
});

it('positions truncated title tooltip from the current list boundary', () => {
  const scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 160 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 80 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList.contains('workspace-region-main-topic') ? makeRect(500) : makeRect(420);
  };

  try {
    render(
      <div className="workspace-region-main-topic">
        <TruncatedTextTooltip text="Long title">Long title</TruncatedTextTooltip>
      </div>
    );

    expect(screen.getByText('Long title')).toHaveAttribute('data-truncated-text-tooltip-side-offset', '90');
  } finally {
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
    if (scrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  }
});

it('draws truncated title tooltip as one measured bubble path', async () => {
  const resizeObserver = globalThis.ResizeObserver;
  const scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  globalThis.ResizeObserver = TestResizeObserver as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 120 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 80 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      bottom: 40,
      height: 40,
      left: 0,
      right: 160,
      top: 0,
      width: 160,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };

  try {
    render(<TruncatedTextTooltip text="Long title">Long title</TruncatedTextTooltip>);
    const trigger = screen.getByText('Long title');
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' });

    const tooltipContent = await screen.findByRole('tooltip');
    const tooltip = tooltipContent.parentElement;
    expect(tooltip?.className).toContain('border-transparent');
    expect(tooltip?.className).toContain('bg-transparent');
    expect(tooltip?.className).toContain('max-w-[min(15rem,calc(100vw-2rem))]');
    expect(tooltip?.className).toContain('[--app-tooltip-padding-x:0.75rem]');
    expect(tooltip?.className).toContain('[--app-tooltip-padding-y:0.5rem]');
    expect(tooltip?.className).not.toContain('before:border-r-[var(--app-tooltip-border-color)]');
    const arrow = document.querySelector('svg[aria-hidden="true"]');
    expect(arrow).not.toBeNull();
    expect(arrow).toHaveClass('left-[-8px]');
    expect(arrow).toHaveAttribute('viewBox', '0 0 168 40');
    const bubblePath = arrow?.querySelector('path[stroke="var(--app-tooltip-border-color)"]');
    expect(bubblePath).toHaveAttribute('fill', 'var(--app-tooltip-bg)');
    expect(bubblePath).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    expect(bubblePath?.getAttribute('d')).toContain('L 0 20');
    expect(bubblePath?.getAttribute('d')).toContain('Q 8 0 16 0');
  } finally {
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
    if (scrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
    globalThis.ResizeObserver = resizeObserver;
  }
});

it('prefers the outer workspace boundary over inner tree containers', () => {
  const scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 160 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 80 });
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('workspace-region-main-topic')) {
      return makeRect(500);
    }
    if (this.getAttribute('role') === 'tree') {
      return makeRect(460);
    }
    return makeRect(420);
  };

  try {
    render(
      <div className="workspace-region-main-topic">
        <div role="tree">
          <TruncatedTextTooltip text="Long title">Long title</TruncatedTextTooltip>
        </div>
      </div>
    );

    expect(screen.getByText('Long title')).toHaveAttribute('data-truncated-text-tooltip-side-offset', '90');
  } finally {
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
    if (scrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  }
});

it('leaves title tooltip trigger disabled when text fits', () => {
  render(<TruncatedTextTooltip text="Short title">Short title</TruncatedTextTooltip>);

  expect(screen.getByText('Short title')).toHaveAttribute('data-truncated-text-tooltip-trigger', 'false');
});
