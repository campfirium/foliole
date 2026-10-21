import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { CapacitorCompanionDatabaseOwner } from '../runtime/capacitorCompanionDatabaseOwner';

import { saveCompanionContentEdit } from './companionContentEditing';
import { insertContentEditNode, openContentEditDatabase } from './companionContentEditing.testSupport';

const state = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null }));
vi.mock('@capacitor/core', () => ({ Capacitor: {
  getPlatform: () => 'ios', isNativePlatform: () => true
}, registerPlugin: vi.fn(() => ({})) }));
vi.mock('../runtime/iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => state.owner }));

let database: Database.Database;
let directory: string;
const now = '2026-10-21T00:00:00.000Z';

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), 'foliole-content-title-'));
  ({ database, owner: state.owner } = await openContentEditDatabase(directory, now));
});

afterEach(async () => {
  await state.owner?.close();
  state.owner = null;
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

async function saveTopic(isTitleManual: boolean, content: string) {
  await insertContentEditNode(state.owner!, { id: 'topic', content: 'Apples\nBread\n', kind: 'topic',
    title: 'Original title', isTitleManual, hideTitleHeading: false, parentNodeId: null, reveal: null,
    anchorLink: null, reading: null, review: null, createdAt: now, updatedAt: now }, 'base');
  await saveCompanionContentEdit({ nodeId: 'topic', content, versionId: 'edited', baseVersionId: 'base',
    updatedAt: '2026-10-21T01:00:00.000Z' });
  return database.prepare(`SELECT n.title, json_extract(v.snapshot_json, '$.title') AS versionTitle
    FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id WHERE n.id = 'topic'`).get();
}

// Same cases as the desktop editor: a unique article heading wins, then a manual title, then the body.
it.each([
  { isTitleManual: false, content: '# New heading\nApples\n', title: 'New heading' },
  { isTitleManual: true, content: '# New heading\nApples\n', title: 'New heading' },
  { isTitleManual: true, content: 'Pears\nBread\n', title: 'Original title' },
  { isTitleManual: false, content: 'Pears\nBread\n', title: 'Pears' },
  { isTitleManual: true, content: '# One\nPears\n# Two\n', title: 'Original title' },
  { isTitleManual: false, content: '# One\nPears\n# Two\n', title: 'One' }
])('saves a mobile body edit with the desktop title (manual=$isTitleManual, $title)', async ({ isTitleManual, content, title }) => {
  expect(await saveTopic(isTitleManual, content)).toEqual({ title, versionTitle: title });
});
