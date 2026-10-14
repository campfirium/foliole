/* global process */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const APP = path.join(ROOT, 'ios/App/App');
const ISOLATED_SQLITE_MARKER = /sql-surface: ios-isolated-(?:pack|snapshot|framed-staging)-owner/;
const RETIRED_ACTIVE_DATABASE_TOKENS = [
  'FolioleCompanionLearningWriteDatabase',
  'FolioleCompanionGeneratedReadQueryRunner',
  'FolioleCompanionSyncDiagnosticQueryStore',
  'FolioleCompanionAttachmentResourceStore'
];

describe('iOS active database ownership', () => {
  it('keeps active-library SQLite out of the formal Swift target', async () => {
    const names = (await readdir(APP)).filter((name) => name.endsWith('.swift'));
    const sources = await Promise.all(names.map((name) => readFile(path.join(APP, name), 'utf8')));
    const source = sources.filter((value) => !ISOLATED_SQLITE_MARKER.test(value));

    expect(source.join('\n')).not.toContain('sqlite3_open');
    expect(source.join('\n')).not.toContain('CapacitorDatabase/foliole-companion');
    for (const token of RETIRED_ACTIVE_DATABASE_TOKENS) expect(source.join('\n')).not.toContain(token);
  });

  it('exposes only Sync Group, network, discovery, file, and framed-transfer methods from Swift', async () => {
    const plugin = await readFile(path.join(APP, 'FolioleCompanionSyncPlugin.swift'), 'utf8');
    const methods = [...plugin.matchAll(/CAPPluginMethod\(name: "([^"]+)"/g)].map((match) => match[1]).sort();

    expect(methods).toEqual([
      'accessFramedSyncFile', 'cancelRequestSyncHttp', 'postRequestSyncHttp',
      'configureFramedSyncPayloadBudget', 'closeFramedSyncPayloadBudget',
      'releaseFramedSyncPayloadLoan', 'validateFramedSyncPayloadLoan',
      'acceptSyncGroupJoinRequest', 'beginSyncRun', 'desktopHttpRequest',
      'loadDiscoveryCandidates', 'loadSyncGroupDeviceIdentity', 'loadSyncGroupProviderState',
      'loadSyncParticipationState', 'maintainAttachmentFiles', 'readRemoteImageResponse',
      'rejectSyncGroupJoinRequest',
      'resolveAttachmentResource',
      'resolveSyncGroupDataRequest', 'setSyncEnabled', 'setSyncPaused', 'signCompanionSyncRequest',
      'startDiscoverySession', 'startSyncGroupProvider',
      'stopDiscoverySession', 'stopSyncGroupProvider', 'writeImageAttachment'
    ].sort());
  });

  it('routes iOS reads, writes, sync apply, and attachment availability through the shared owner', async () => {
    const files = [
      'src/shared/platform/companion/runtime/iosCompanionActiveDatabase.ts',
      'src/shared/platform/companion/runtime/iosCompanionActiveDatabaseReads.ts',
      'src/shared/platform/companion/runtime/iosCompanionActiveDatabaseWrites.ts',
      'src/shared/platform/companion/sync/framed/companionAttachmentBlockFiles.ts',
      'src/shared/platform/companion/sync/framed/companionRequestSyncDatabaseHost.ts'
    ];
    const source = (await Promise.all(files.map((file) => readFile(path.join(ROOT, file), 'utf8')))).join('\n');

    expect(source).toContain('getIosCompanionDatabaseOwner');
    expect(source).toContain('readIosCompanionDatabase');
    expect(source).toContain('writeIosCompanionDatabase');
    expect(source).toContain('recordFramedSyncResourceAvailability');
    expect(source).toContain('owner.runWriter');
  });
});
