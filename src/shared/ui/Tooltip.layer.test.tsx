import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger } from './Tooltip';

afterEach(() => {
  document.documentElement.style.removeProperty('--z-dropdown');
});

it('applies the requested semantic layer to tooltip content', () => {
  document.documentElement.style.setProperty('--z-dropdown', '1234');
  render(
    <AppTooltipProvider delayDuration={0}>
      <AppTooltip defaultOpen>
        <AppTooltipTrigger asChild>
          <button type="button">Folder</button>
        </AppTooltipTrigger>
        <AppTooltipContent layer="dropdown">Full folder path</AppTooltipContent>
      </AppTooltip>
    </AppTooltipProvider>
  );

  expect(screen.getByRole('tooltip').closest<HTMLElement>('[data-side]')?.style.zIndex).toBe('var(--z-dropdown)');
  expect(screen.getByRole('tooltip').closest<HTMLElement>('[data-radix-popper-content-wrapper]')?.style.zIndex).toBe('1234');
});
