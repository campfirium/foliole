import { expect, it } from 'vitest';

import {
  cloneDraftImportSource,
  createDraftImportSource,
  materializeWatchedSourceId
} from './importSourceWorkspaceModel';

it('gives each new watched-folder binding a device-independent unique id', () => {
  const draft = createDraftImportSource(101);
  const first = materializeWatchedSourceId(draft);
  const second = cloneDraftImportSource(draft);

  expect(first.id).toMatch(/^watched-/);
  expect(second.id).toMatch(/^watched-/);
  expect(first.id).not.toBe(second.id);
  expect(materializeWatchedSourceId(first)).toBe(first);
});
