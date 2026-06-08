import { expect, it } from 'vitest';

import { cn } from './utils';

it('keeps project UI type scale classes alongside text color classes', () => {
  expect(cn('text-ui-md text-foreground')).toContain('text-ui-md');
  expect(cn('text-ui-md text-foreground')).toContain('text-foreground');
  expect(cn('text-sm text-ui-md text-foreground')).not.toContain('text-sm');
});
