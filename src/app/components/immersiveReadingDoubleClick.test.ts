import { expect, it } from 'vitest';

import { resolveImmersiveDoubleClickEditHandler } from './immersiveReadingDoubleClick';

it('only exposes immersive double-click editing while the preference is enabled', () => {
  const enterEdit = () => undefined;

  expect(resolveImmersiveDoubleClickEditHandler(enterEdit, true)).toBe(enterEdit);
  expect(resolveImmersiveDoubleClickEditHandler(enterEdit, false)).toBeUndefined();
});
