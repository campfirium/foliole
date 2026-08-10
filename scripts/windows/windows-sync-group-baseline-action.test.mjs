// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  resolveWindowsProtectionIdentity, runWindowsSyncGroupBaselineReset
} from './windows-sync-group-baseline-action.mjs';

it('uses one active win32 member or a fresh product identity for C protection', () => {
  expect(resolveWindowsProtectionIdentity({ activeDeviceIdentities: {
    win32: ['active-c']
  }, deviceIdentity: null })).toBe('active-c');
  expect(resolveWindowsProtectionIdentity({ activeDeviceIdentities: {}, deviceIdentity: null },
    'fresh-c')).toBe('fresh-c');
  expect(() => resolveWindowsProtectionIdentity({ activeDeviceIdentities: {
    win32: ['c', 'conflict']
  }, deviceIdentity: null })).toThrow('not uniquely recoverable');
});

it('discards the disposable C workspace and boots a fresh empty product state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-windows-baseline-'));
  const clientRoot = path.join(root, '.tmp', 'artifacts', 'windows-sync-group-client-c');
  const library = path.join(clientRoot, 'library');
  fs.mkdirSync(path.join(library, 'Data'), { recursive: true });
  fs.mkdirSync(path.join(clientRoot, 'user-data'), { recursive: true });
  fs.writeFileSync(path.join(library, 'Data', 'foliole.db'), 'old');
  const paths = { repoRoot: root };
  const facts = (empty) => ({ activeMemberCount: empty ? 0 : 2, attachmentCount: empty ? 0 : 3,
    activeDeviceIdentities: {}, contentBlobCount: empty ? 0 : 4,
    deviceIdentity: empty ? null : 'device-c-old',
    integrity: 'ok', localGroupId: empty ? null : 'group-old',
    localMemberState: empty ? null : 'active', localTimelineId: empty ? null : 'timeline-old',
    nodeCount: empty ? 2 : 5, userNodeCount: empty ? 0 : 3 });
  const controls = [];
  const inspectDatabase = async (_execute, _paths, databasePath = path.join(library, 'Data', 'foliole.db')) =>
    facts(fs.readFileSync(databasePath, 'utf8') === 'fresh');
  const result = await runWindowsSyncGroupBaselineReset({ buildIdentity: 'candidate-1',
    controlNativeClient: async (_execute, _paths, action) => controls.push(action),
    evidenceRoot: path.join(root, 'evidence'), execute: async () => ({ code: 0 }),
    inspectDatabase, loadOverview: async () => ({ primary_device_state: {
      primary_device_id: 'fresh-c'
    } }), openSession: async () => {
      fs.mkdirSync(path.join(library, 'Data'), { recursive: true });
      fs.writeFileSync(path.join(library, 'Data', 'foliole.db'), 'fresh');
      return { app: { close: async () => undefined } };
    }, paths });
  const manifest = JSON.parse(fs.readFileSync(result.syncGroupBaseline.manifestPath, 'utf8'));
  expect(controls).toEqual([]);
  expect(manifest).toMatchObject({
    emptyFacts: { activeMemberCount: 0, localGroupId: null, nodeCount: 2 },
    resultStatus: 'success' });
  expect(manifest).not.toHaveProperty('originalProtection');
  expect(manifest).not.toHaveProperty('baselineProtection');
});

it('recreates an already-empty disposable C workspace without retaining its prior identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 't121-windows-empty-baseline-'));
  const clientRoot = path.join(root, '.tmp', 'artifacts', 'windows-sync-group-client-c');
  const library = path.join(clientRoot, 'library');
  const database = path.join(library, 'Data', 'foliole.db');
  fs.mkdirSync(path.dirname(database), { recursive: true });
  fs.mkdirSync(path.join(clientRoot, 'user-data'), { recursive: true });
  fs.writeFileSync(database, 'already-empty');
  const emptyFacts = { activeMemberCount: 0, attachmentCount: 0, activeDeviceIdentities: {},
    contentBlobCount: 0, deviceIdentity: null, integrity: 'ok', localGroupId: null,
    localMemberState: null, localTimelineId: null, nodeCount: 2, userNodeCount: 0 };
  let sessionCount = 0;
  const result = await runWindowsSyncGroupBaselineReset({ buildIdentity: 'candidate-empty',
    evidenceRoot: path.join(root, 'evidence'), execute: async () => ({ code: 0 }),
    inspectDatabase: async () => emptyFacts,
    loadOverview: async () => ({ primary_device_state: {
      primary_device_id: 'fresh-c'
    } }), openSession: async () => {
      sessionCount += 1;
      fs.mkdirSync(path.dirname(database), { recursive: true });
      fs.writeFileSync(database, 'fresh');
      return { app: { close: async () => undefined } };
    }, paths: { repoRoot: root } });
  const manifest = JSON.parse(fs.readFileSync(result.syncGroupBaseline.manifestPath, 'utf8'));
  expect(sessionCount).toBe(1);
  expect(manifest.emptyFacts.deviceIdentity).toBeTruthy();
  expect(manifest).not.toHaveProperty('originalProtection');
});
