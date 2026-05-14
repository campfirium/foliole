import { expect, it } from 'vitest';

import {
  appFloatingInputClassName,
  appFloatingItemClassName,
  appFloatingListClassName,
  appFloatingOverlayClassName,
  appFloatingSurfaceClassName
} from './FloatingSurface';

it('keeps command and search surfaces on shared floating tokens', () => {
  expect(appFloatingOverlayClassName()).toContain('bg-[var(--app-floating-overlay-bg)]');
  expect(appFloatingSurfaceClassName('panel')).toContain('bg-[var(--app-floating-surface-bg)]');
  expect(appFloatingInputClassName()).toContain('bg-[var(--app-floating-input-bg)]');
  expect(appFloatingInputClassName()).toContain('border-[var(--app-floating-divider-color)]');
  expect(appFloatingInputClassName()).toContain('focus-visible:outline-none');
  expect(appFloatingInputClassName()).toContain('focus-visible:ring-ring');
  expect(appFloatingListClassName()).toContain(
    '[--app-scrollbar-thumb-color:var(--app-floating-scrollbar-thumb-color)]'
  );
  expect(appFloatingItemClassName()).toContain('hover:bg-[var(--app-floating-item-hover-bg)]');
  expect(appFloatingItemClassName()).toContain(
    'data-[active=true]:bg-[var(--app-floating-item-active-bg)]'
  );
});
