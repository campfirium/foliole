import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AppTooltipContentLayout } from './TooltipContentLayout';

it('keeps a tooltip title and description in one shared content layout', () => {
  render(<AppTooltipContentLayout description="Drag to act." title="Action (Quick)" />);

  expect(screen.getByText('Action (Quick)')).toHaveClass('font-medium');
  expect(screen.getByText('Drag to act.')).toHaveClass('text-foreground/70');
});
