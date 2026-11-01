// @vitest-environment node
import { expect, it } from 'vitest';

import type { NativeInvokeRequest } from '../../lib/platform/nativeContract.js';

import './commands.window-utility-extra.test-support.js';

import { handleInvokeRequest } from './commands.js';
import { syncAppMenuState } from './commands.window-utility-extra.test-support.js';

it.each([
  { enabledCommandIds: ['app.undo'], history: { undoTitle: 'Undo Delete Annotation', redoTitle: 'Redo', nativeEditing: false } },
  { enabledCommandIds: ['app.redo'], history: { undoTitle: 'Undo', redoTitle: 'Redo Edit Text', nativeEditing: false } },
  { enabledCommandIds: [], history: { undoTitle: 'Undo', redoTitle: 'Redo', nativeEditing: true } }
])('forwards exact typed history and enabled commands %j', async ({ enabledCommandIds, history }) => {
  const shortcutAccelerators = [{ commandId: 'app.undo', accelerator: 'CommandOrControl+Z' }];
  await expect(handleInvokeRequest({ command: 'sync_app_menu_state',
    args: { enabledCommandIds, shortcutAccelerators, history }
  } satisfies NativeInvokeRequest<'sync_app_menu_state'>)).resolves.toBeNull();
  expect(syncAppMenuState).toHaveBeenCalledExactlyOnceWith(enabledCommandIds, shortcutAccelerators, undefined, history);
});
