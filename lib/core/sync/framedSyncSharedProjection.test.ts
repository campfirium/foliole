import { expect, it } from 'vitest';

import {
  importSourceSharedState,
  privateStateIdentity,
  watchedFolderSharedState
} from './framedSyncSharedProjection.js';

it('uses structured private state identity without colon-joined ambiguity', () => {
  expect(privateStateIdentity({
    formFactor: 'desktop', host: 'Mac:Studio', key: 'node:1', platform: 'darwin', scope: 'host'
  })).toEqual({
    form_factor: 'desktop', host: 'Mac:Studio', key: 'node:1', platform: 'darwin', scope: 'host'
  });
});

it('keeps local watched-folder paths outside shared state', () => {
  const shared = {
    actionMode: 'learn', bindingId: 'binding-1', connectionStatus: 'connected',
    highlightMode: 'capture', host: 'Mac', hostPlatform: 'darwin',
    ownerDeviceId: 'device-a', sourceRef: 'watched:stable'
  };
  expect(watchedFolderSharedState(shared)).not.toHaveProperty('reported_path');
  expect(watchedFolderSharedState(shared)).not.toHaveProperty('primary_path');
  expect(watchedFolderSharedState({ ...shared, sourceRef: 'file:///Users/me/private' }))
    .toMatchObject({ source_ref: '' });
  expect(watchedFolderSharedState({ ...shared, sourceRef: 'C:\\Users\\me\\private' }))
    .toMatchObject({ source_ref: '' });
});

it('removes local paths and Readwise observation clocks from import source state', () => {
  const base = {
    lastContentFingerprint: 'content', latestNodeId: 'node-1', provider: 'desktop_text_file',
    remoteAnnotationsJson: '[]', remoteConnectionRef: null, remoteDocumentId: null,
    remoteImportStateJson: '{}', remoteProvider: null, sourceFingerprint: 'source-1',
    sourceKind: 'html', sourceLocation: null, sourceLocator: '/Users/me/private/article.html',
    sourceName: 'Article', sourceRef: null, watchedBindingId: null, watchedRelativePath: null
  };
  expect(importSourceSharedState(base)).toMatchObject({ source_locator: '' });
  expect(importSourceSharedState({ ...base, sourceLocation: '\\\\server\\private',
    sourceLocator: 'C:\\Users\\me\\article.html' })).toMatchObject({ source_location: '', source_locator: '' });
  expect(importSourceSharedState({
    ...base, sourceRef: 'file:///Users/me/private', watchedRelativePath: '../private/article.html'
  })).toMatchObject({ source_ref: '', watched_relative_path: '' });
  expect(importSourceSharedState({
    ...base, sourceRef: 'watched:stable', watchedRelativePath: 'articles/item.html'
  })).toMatchObject({ source_ref: 'watched:stable', watched_relative_path: 'articles/item.html' });

  const readwise = importSourceSharedState({
    ...base, remoteConnectionRef: 'connection', remoteDocumentId: 'document', remoteProvider: 'readwise',
    remoteImportStateJson: JSON.stringify({
      annotations: [{ blockedAt: 'local-blocked-clock', contentHash: 'hash', kind: 'highlight',
        nodeId: 'node-1', remoteId: 'highlight-1', sourceUpdatedAt: 'local-source-clock' }],
      documentBlockedAt: 'local-document-clock',
      remoteLifecycle: { checkedAt: 'local-check-clock', export: 'present', reader: 'missing',
        scope: { readerLocation: 'all', version: 1 } },
      sourceUpdate: { contentHash: 'pending', sourceUpdatedAt: 'local-pending-clock', status: 'pending' },
      sourceUpdatedAt: 'local-root-clock'
    })
  });
  expect(JSON.stringify(readwise)).not.toContain('local-');
  expect(readwise).not.toHaveProperty('source_locator');
});
