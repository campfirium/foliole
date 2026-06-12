import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger } from './Tooltip';

it('keeps truncated tooltip token overrides inside the shared tooltip wrapper', () => {
  render(
    <AppTooltipProvider delayDuration={0}>
      <AppTooltip defaultOpen>
        <AppTooltipTrigger asChild>
          <button type="button">Hover</button>
        </AppTooltipTrigger>
        <AppTooltipContent surface="truncated">Shared tooltip</AppTooltipContent>
      </AppTooltip>
    </AppTooltipProvider>
  );

  const tooltip = screen.getByRole('tooltip').parentElement;
  expect(tooltip?.className).toContain('border-transparent');
  expect(tooltip?.className).toContain('bg-transparent');
  expect(tooltip?.className).toContain('[--app-tooltip-padding-x:0.75rem]');
  expect(tooltip?.className).toContain('[--app-tooltip-shadow:var(--shadow-panel)]');
});

it('keeps truncated tooltip callers off private tooltip token overrides', () => {
  const source = readFileSync(join(process.cwd(), 'src/shared/ui/TruncatedTextTooltip.tsx'), 'utf8');

  expect(source).toContain('surface="truncated"');
  expect(source).not.toContain('--app-tooltip-bg:');
  expect(source).not.toContain('--app-tooltip-shadow:');
});
