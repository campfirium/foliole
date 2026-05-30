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
      actionMode: 'keep',
      directoryPath: '/tmp/merged-source',
      highlightMode: 'merged',
      highlightPolicy: 'adopt',
      sourceId: 'draft-import-source-101',
      sourceType: 'generic',
      watchPaths: ['/tmp/merged-source']
    })
  ]);
});

it('watches original and highlight folders for generic split keep imports', () => {
  const settings = createDefaultImportManagerSettings();
  settings.sources = [
    {
      actionMode: 'delete',
      archivePath: '',
      highlightMode: 'split',
      highlightPath: '/tmp/highlights',
      id: 'draft-import-source-102',
      keepPreview: null,
      keepState: 'enabled',
      primaryPath: '/tmp/originals'
    }
  ];

  expect(resolveKeepImportConfigs(settings)).toEqual([
    expect.objectContaining({
      actionMode: 'delete',
      directoryPath: '/tmp/originals',
      highlightDirectoryPath: '/tmp/highlights',
      highlightMode: 'split',
      highlightPolicy: 'reference_only',
      sourceId: 'draft-import-source-102',
      sourceType: 'generic',
      watchPaths: ['/tmp/originals', '/tmp/highlights']
    })
  ]);
});

it('keeps mirror output folders out of watched import configs', () => {
  const settings = createDefaultImportManagerSettings();
  settings.sources = [
    {
      actionMode: 'keep',
      archivePath: '',
      highlightMode: 'merged',
      highlightPath: '',
      id: 'mirror-source',
      keepPreview: null,
      keepState: 'enabled',
      primaryPath: '/library/Mirror'
    },
    {
      actionMode: 'keep',
      archivePath: '',
      highlightMode: 'merged',
      highlightPath: '',
      id: 'external-source',
      keepPreview: null,
      keepState: 'enabled',
      primaryPath: '/library/External'
    }
  ];

  expect(resolveKeepImportConfigs(settings, { unsafePathCandidates: [{ label: 'Mirror', path: '/library/Mirror' }] })).toEqual([
    expect.objectContaining({
      directoryPath: '/library/External',
      sourceId: 'external-source'
    })
  ]);
});
