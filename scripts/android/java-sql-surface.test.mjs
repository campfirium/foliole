import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JAVA_ROOT = path.join(ROOT, 'android/app/src/main/java/com/foliole/android');
const ISOLATED_SQLITE = new Set([
  'FolioleCompanionContentBlobPack.java',
  'FolioleCompanionSyncGroupDatabase.java',
  'FolioleCompanionSyncGroupContentBlobBatch.java',
  'FolioleCompanionSyncGroupResources.java',
  'FolioleCompanionSyncPackDatabaseValidator.java',
  'FolioleCompanionSyncPackPayloadWriter.java',
  'FolioleCompanionSyncPackProvider.java'
]);

function javaFiles() {
  return fs.readdirSync(JAVA_ROOT).filter((name) => name.endsWith('.java')).sort();
}

function source(name) {
  return fs.readFileSync(path.join(JAVA_ROOT, name), 'utf8');
}

describe('Android Java SQL surface', () => {
  it('keeps SQLite limited to isolated temporary pack creation and validation', () => {
    const formalSource = javaFiles().filter((name) => !ISOLATED_SQLITE.has(name)).map(source).join('\n');
    expect(formalSource).not.toContain('SQLiteOpenHelper');
    expect(formalSource).not.toContain('android.database.sqlite.SQLiteDatabase');
    expect(formalSource).not.toContain('getReadableDatabase(');
    expect(formalSource).not.toContain('getWritableDatabase(');
    expect(formalSource).not.toContain('releaseDatabaseConnection');
    expect(formalSource).not.toContain('foliole-companionSQLite.db');
  });

  it('exposes only network, Sync Group, file, and staged-pack methods from Java', () => {
    const plugin = source('FolioleCompanionSyncPlugin.java');
    const methods = [...plugin.matchAll(/@PluginMethod\s+public void\s+([A-Za-z0-9_]+)/g)]
      .map((match) => match[1]).sort();
    expect(methods).toEqual([
      'acceptSyncGroupJoinRequest', 'beginSyncRun', 'desktopHttpRequest',
      'downloadAttachmentResourceBatch',
      'downloadContentBlobBatch', 'finishAttachmentResourceBatch', 'finishContentBlobBatch',
      'loadDiscoveryCandidates', 'loadSyncGroupDeviceIdentity', 'loadSyncGroupProviderState', 'loadSyncParticipationState',
      'rejectSyncGroupJoinRequest',
      'resolveAttachmentResource', 'resolveSyncGroupDataRequest',
      'setSyncEnabled', 'setSyncPaused', 'signCompanionSyncRequest',
      'stageAttachmentResourceBatch', 'startDiscoverySession', 'startSyncGroupProvider',
      'stopDiscoverySession', 'stopSyncGroupProvider'
    ].sort());
  });

  it('routes Android reads, writes, alternatives, and sync through the shared owner', () => {
    const files = [
      'src/shared/platform/companionBootstrap.ts',
      'src/shared/platform/companion/runtime/companionNodeTextAlternativeRepository.ts',
      'src/shared/platform/companion/runtime/iosCompanionActiveDatabase.ts',
      'src/shared/platform/companionSyncStateWriters.ts',
      'src/shared/platform/companionSyncPackApply.ts'
    ];
    const sharedSource = files.map((name) => fs.readFileSync(path.join(ROOT, name), 'utf8')).join('\n');
    expect(sharedSource).toContain("runtime.kind !== 'android-native' && runtime.kind !== 'ios-native'");
    expect(sharedSource).toContain('getIosCompanionDatabaseOwner');
    expect(sharedSource).toContain('readIosCompanionDatabase');
    expect(sharedSource).toContain('writeIosCompanionDatabase');
  });
});
