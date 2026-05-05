import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger } from './Tooltip';

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
