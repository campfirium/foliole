// @vitest-environment node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import type { AttachmentObservationState } from '../../platform/attachmentMaintenanceContract.js';

import { maintainAttachments, type AttachmentMaintenancePort } from './attachmentMaintenance.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(automatic = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'observation-result-'));
  roots.push(root);
  for (const directory of ['active', 'trash']) fs.mkdirSync(path.join(root, directory));
  let state: AttachmentObservationState = { automatic, databaseGeneration: 'g1', observationThreshold: 1,
    counts: {}, lastObservationDay: null };
  const inventories: boolean[] = [];
  const write = (body: string) => {
    const key = `${createHash('sha256').update(body).digest('hex')}.png`;
    fs.writeFileSync(path.join(root, 'active', key), body);
    return key;
  };
  const port: AttachmentMaintenancePort = {
    generation: async () => 'g1', references: async () => ({ revision: 'r1', storageKeys: [] }),
    inventory: async trash => {
      inventories.push(trash);
      const directory = path.join(root, trash ? 'trash' : 'active');
      return fs.readdirSync(directory).map(storageKey => ({ storageKey,
        sizeBytes: fs.statSync(path.join(directory, storageKey)).size }));
    },
    readState: async () => structuredClone(state),
    writeState: async next => { state = structuredClone(next); },
    withStableRevision: async (_, action) => action(),
    move: async (key, trash) => fs.renameSync(path.join(root, trash ? 'active' : 'trash', key),
      path.join(root, trash ? 'trash' : 'active', key)),
    requestMissing: async () => undefined,
    removeTrash: async key => fs.unlinkSync(path.join(root, 'trash', key))
  };
  return { port, write, inventories, state: () => state };
}

it.each([false, true])('returns only completion without a second inventory, automatic=%s', async automatic => {
  const f = fixture(automatic);
  const key = f.write('original');
  expect(await maintainAttachments(f.port, { action: 'observe' }, 'day-1')).toEqual({ observationComplete: true });
  expect(f.inventories).toEqual([false]);
  expect(f.state().lastObservationDay).toBe('day-1');
  expect(await maintainAttachments(f.port, { action: 'status' }, 'day-1')).toMatchObject({ usedBytes: 8,
    eligibleBytes: automatic ? 0 : 8, trashBytes: automatic ? 8 : 0,
    trash: automatic ? [{ storageKey: key, sizeBytes: 8 }] : [] });
});

it('reports incomplete without reading either directory or advancing the day', async () => {
  const f = fixture(true);
  f.write('original');
  f.port.references = async () => null;
  expect(await maintainAttachments(f.port, { action: 'observe' }, 'day-1')).toEqual({ observationComplete: false });
  expect(f.inventories).toEqual([]);
  expect(f.state()).toMatchObject({ counts: {}, lastObservationDay: null });
});

it('lets explicit status read newly arrived files after observation', async () => {
  const f = fixture();
  f.write('original');
  f.port.references = async () => ({ revision: 'r1', storageKeys: ['missing'] });
  f.port.requestMissing = async () => { f.write('arrived-bytes'); };
  await maintainAttachments(f.port, { action: 'observe' }, 'day-1');
  expect(f.inventories).toEqual([false]);
  expect(await maintainAttachments(f.port, { action: 'status' }, 'day-1')).toMatchObject({
    usedBytes: 21, eligibleBytes: 8, trashBytes: 0, trash: [] });
});

it.each(['inventory', 'writeState', 'requestMissing', 'move'] as const)('propagates %s failure without a completion receipt', async operation => {
  const f = fixture(true);
  f.write('original');
  f.port.references = async () => ({ revision: 'r1', storageKeys: ['missing'] });
  f.port[operation] = async () => { throw new Error('operation_failed'); };
  await expect(maintainAttachments(f.port, { action: 'observe' }, 'day-1')).rejects.toThrow('operation_failed');
});

it('does not request a storage summary that could fail after a completed observation', async () => {
  const f = fixture();
  const inventory = f.port.inventory;
  let reads = 0;
  f.port.inventory = async trash => {
    if (++reads > 1) throw new Error('summary_inventory_failed');
    return inventory(trash);
  };
  expect(await maintainAttachments(f.port, { action: 'observe' }, 'day-1')).toEqual({ observationComplete: true });
  expect(f.state().lastObservationDay).toBe('day-1');
});
