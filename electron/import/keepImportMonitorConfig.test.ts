// @vitest-environment node

import { expect, it } from 'vitest';

import { createDefaultImportManagerSettings } from '../../lib/core/import/importManagerSettings.js';

import { resolveKeepImportConfigs } from './keepImportMonitorConfig.js';

it('uses adopt highlight handling for generic merged keep imports', () => {
  const settings = createDefaultImportManagerSettings();
  settings.sources = [
    {
      actionMode: 'keep',
      archivePath: '',
      highlightMode: 'merged',
      highlightPath: '',
      id: 'draft-import-source-101',
      keepPreview: null,
      keepState: 'enabled',
      primaryPath: '/tmp/merged-source'
    }
  ];

  expect(resolveKeepImportConfigs(settings)).toEqual([
    expect.objectContaining({
      directoryPath: '/tmp/merged-source',
      highlightPolicy: 'adopt',
      sourceId: 'draft-import-source-101',
      sourceType: 'generic',
      watchPaths: ['/tmp/merged-source']
    })
  ]);
});
