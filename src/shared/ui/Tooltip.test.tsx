import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger } from './Tooltip';
import { TruncatedTextTooltip } from './TruncatedTextTooltip';

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
    expect(arrow).not.toBeNull();
    expect(arrow).toHaveClass('fill-[var(--app-tooltip-bg)]');
    expect(arrow).toHaveClass('stroke-[var(--app-tooltip-border-color)]');
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
