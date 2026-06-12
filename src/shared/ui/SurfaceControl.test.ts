import { expect, it } from 'vitest';

import { appSurfaceControlClassName } from './SurfaceControl';

it('keeps document surface controls on semantic control tokens', () => {
  const className = appSurfaceControlClassName();

  expect(className).toContain('--app-surface-control-bg');
  expect(className).toContain('--app-control-border-color');
  expect(className).toContain('text-ui-md');
  expect(className).not.toContain('bg-bg-elevated');
  expect(className).not.toContain('border-border bg');
});
