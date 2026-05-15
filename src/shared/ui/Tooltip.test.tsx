import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger } from './Tooltip';
import { TruncatedTextTooltip } from './TruncatedTextTooltip';

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

it('leaves title tooltip trigger disabled when text fits', () => {
  render(<TruncatedTextTooltip text="Short title">Short title</TruncatedTextTooltip>);

  expect(screen.getByText('Short title')).toHaveAttribute('data-truncated-text-tooltip-trigger', 'false');
});
