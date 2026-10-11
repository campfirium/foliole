import { expect, it } from 'vitest';

import { resolveCommandRoute } from './commandRoutes.js';

it('rejects retired arrangement history commands while keeping ordinary reorder available', () => {
  expect(resolveCommandRoute('read_parent_order_history')).toBeNull();
  expect(resolveCommandRoute('restore_parent_order_snapshot')).toBeNull();
  expect(resolveCommandRoute('replace_node_order')).toBe('storage');
});
