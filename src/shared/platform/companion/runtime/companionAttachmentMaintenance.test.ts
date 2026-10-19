// @vitest-environment node
import { expect, it, vi } from 'vitest';

import type { AttachmentObservationState } from '../../../../../lib/platform/attachmentMaintenanceContract';
import { createDisplayLibrary } from '../sync/workspace-state/companionDisplaySnapshotConcurrency.testSupport';

import type { CapacitorCompanionDatabaseOwner } from './capacitorCompanionDatabaseOwner';
import { runCompanionAttachmentMaintenance } from './companionAttachmentMaintenance';

const runtime = vi.hoisted(() => ({ owner: null as CapacitorCompanionDatabaseOwner | null,
  files: vi.fn() }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({ getIosCompanionDatabaseOwner: () => runtime.owner }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ FolioleCompanionSync: { maintainAttachmentFiles: runtime.files } }));


function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

it('does not hold the writer while inventory waits and refuses cleanup after an intervening edit', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  const inventory = deferred();
  const release = deferred();
  let stateWrites = 0;
  runtime.files.mockImplementation(async ({ operation }) => {
    if (operation === 'generation') return { generation: 'fixture' };
    if (operation === 'read-state') return {};
    if (operation === 'write-state') { stateWrites++; return {}; }
    if (operation === 'inventory') { inventory.resolve(); await release.promise; return { files: [] }; }
    throw new Error(`Unexpected file mutation ${operation}`);
  });
  let maintenance: Promise<unknown> | undefined;
  try {
    await library.owner.open({ expectedHostName: 'fixture', now: '2026-10-19T00:00:00.000Z' });
    maintenance = runCompanionAttachmentMaintenance({ action: 'observe' });
    const outcome = maintenance.then(() => 'completed', error => String(error));
    await inventory.promise;
    const writing = library.owner.runWriter(db => db.run("INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES ('edit','Edited','','now','now')"));
    const completed = await Promise.race([writing.then(() => true), new Promise<boolean>(done => setTimeout(() => done(false), 200))]);
    release.resolve();
    await writing;
    expect(completed, 'foreground write must finish before file inventory resumes').toBe(true);
    expect(await outcome).toContain('attachment_scan_database_changed');
    expect(stateWrites).toBe(0);
  } finally { release.resolve(); await maintenance?.catch(() => undefined); await library.close(); }
});

it('allows its own availability updates while cleaning multiple eligible files', async () => {
  const library = createDisplayLibrary('android');
  runtime.owner = library.owner;
  const keys = ['a', 'b'].map(letter => `${letter.repeat(64)}.png`);
  const moved: string[] = [];
  let state: AttachmentObservationState = { databaseGeneration: 'fixture', automatic: true,
    observationThreshold: 1, lastObservationDay: null, counts: {} };
  runtime.files.mockImplementation(async ({ operation, storageKey, trash, state: saved }) => {
    if (operation === 'generation') return { generation: 'fixture' };
    if (operation === 'read-state') return { state: JSON.stringify(state) };
    if (operation === 'write-state') { state = JSON.parse(saved); return {}; }
    if (operation === 'inventory') return { files: (trash ? moved : keys.filter(key => !moved.includes(key)))
      .map(key => ({ storageKey: key, sizeBytes: 10 })) };
    if (operation === 'move') { moved.push(storageKey); return { available: false }; }
    throw new Error(`Unexpected operation ${operation}`);
  });
  try {
    await library.owner.open({ expectedHostName: 'fixture', now: '2026-10-19T00:00:00.000Z' });
    await runCompanionAttachmentMaintenance({ action: 'observe' });
    expect(moved).toEqual(keys);
    expect(state.counts).toEqual({});
  } finally { await library.close(); }
});
