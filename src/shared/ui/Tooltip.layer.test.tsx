import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger } from './Tooltip';

it('applies the requested semantic layer to tooltip content', () => {
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

  expect(screen.getByRole('tooltip').parentElement).toHaveStyle({ zIndex: 'var(--z-dropdown)' });
});
