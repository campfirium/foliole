import { expect, it } from 'vitest';

import type { AttachmentObservationState } from '../../platform/attachmentMaintenanceContract.js';

import { maintainAttachments, type AttachmentMaintenancePort } from './attachmentMaintenance.js';

function fixture() {
  let state: AttachmentObservationState | null = null;
  const values = { generation: 'db-1', revision: 'r1', scanRevision: 'r1', references: [] as string[],
    files: ['a.png'], trash: [] as string[], unreadable: false, failMove: false };
  const port: AttachmentMaintenancePort = {
    generation: async () => values.generation,
    references: async () => {
      if (values.unreadable) throw new Error('unreadable');
      return { revision: values.scanRevision, storageKeys: values.references };
    },
    inventory: async (trash) => (trash ? values.trash : values.files).map((storageKey) => ({ storageKey, sizeBytes: 10 })),
    readState: async () => state && structuredClone(state),
    writeState: async (next) => { state = structuredClone(next); },
    withStableRevision: async (revision, action) => {
      if (revision !== values.revision) throw new Error('changed');
      return action();
    },
    move: async (key, trash) => {
      if (values.failMove) throw new Error('rename failed');
      const from = trash ? values.files : values.trash;
      const to = trash ? values.trash : values.files;
      from.splice(from.indexOf(key), 1); to.push(key);
    },
    removeTrash: async (key) => { values.trash.splice(values.trash.indexOf(key), 1); }
  };
  return { port, values, state: () => state };
}

it('counts at most once per use day, rechecks manual cleanup, and resets re-referenced files', async () => {
  const f = fixture();
  await maintainAttachments(f.port, { action: 'configure', settings: { automatic: false, observationThreshold: 2 } }, 'day-1');
  await maintainAttachments(f.port, { action: 'observe' }, 'day-1');
  await maintainAttachments(f.port, { action: 'observe' }, 'day-1');
  expect(f.state()?.counts['a.png']).toBe(1);
  await maintainAttachments(f.port, { action: 'clean' }, 'day-2');
  expect(f.values.files).toEqual(['a.png']);
  f.values.references = ['a.png'];
  await maintainAttachments(f.port, { action: 'observe' }, 'day-2');
  expect(f.state()?.counts['a.png']).toBe(0);
  f.values.references = [];
  await maintainAttachments(f.port, { action: 'observe' }, 'day-3');
  await maintainAttachments(f.port, { action: 'observe' }, 'day-4');
  expect(f.values.files).toEqual(['a.png']);
  await maintainAttachments(f.port, { action: 'clean' }, 'day-4');
  expect(f.values.trash).toEqual(['a.png']);
  await maintainAttachments(f.port, { action: 'restore', storageKeys: ['a.png'] }, 'day-4');
  expect(f.values.files).toEqual(['a.png']);
});

it('does not count interrupted, unreadable, or changed scans', async () => {
  const f = fixture();
  f.values.unreadable = true;
  await expect(maintainAttachments(f.port, { action: 'observe' }, 'day-1')).rejects.toThrow('unreadable');
  f.values.unreadable = false; f.values.revision = 'r2';
  await expect(maintainAttachments(f.port, { action: 'observe' }, 'day-1')).rejects.toThrow('changed');
  f.values.revision = 'r1';
  await expect(maintainAttachments(f.port, { action: 'observe' }, 'day-1', AbortSignal.abort())).rejects.toThrow();
  expect(f.state()).toBeNull();
});

it('invalidates conclusions after database replacement and preserves files on move failure', async () => {
  const f = fixture();
  await maintainAttachments(f.port, { action: 'configure', settings: { automatic: false, observationThreshold: 1 } }, 'day-1');
  await maintainAttachments(f.port, { action: 'observe' }, 'day-1');
  f.values.failMove = true;
  await expect(maintainAttachments(f.port, { action: 'clean' }, 'day-1')).rejects.toThrow('rename failed');
  expect(f.values.files).toEqual(['a.png']);
  f.values.generation = 'restored';
  expect((await maintainAttachments(f.port, { action: 'status' }, 'day-1')).eligibleBytes).toBe(0);
  f.values.failMove = false;
  await maintainAttachments(f.port, { action: 'clean' }, 'day-1');
  expect(f.values.files).toEqual(['a.png']);
});

it('runs automatic cleanup only after a new valid observation and retains trash until explicit empty', async () => {
  const f = fixture();
  await maintainAttachments(f.port, { action: 'configure', settings: { automatic: true, observationThreshold: 1 } }, 'day-1');
  await maintainAttachments(f.port, { action: 'observe' }, 'day-1');
  expect(f.values.trash).toEqual(['a.png']);
  await maintainAttachments(f.port, { action: 'observe' }, 'day-2');
  expect(f.values.trash).toEqual(['a.png']);
  await maintainAttachments(f.port, { action: 'empty-trash' }, 'day-2');
  expect(f.values.trash).toEqual([]);
});

it('requires thirty complete observations by default and rejects corrupt persisted counts', async () => {
  const f = fixture();
  for (let day = 1; day <= 29; day++) await maintainAttachments(f.port, { action: 'observe' }, `day-${day}`);
  expect((await maintainAttachments(f.port, { action: 'clean' }, 'day-29')).eligibleBytes).toBe(0);
  expect(f.values.files).toEqual(['a.png']);
  expect((await maintainAttachments(f.port, { action: 'observe' }, 'day-30')).eligibleBytes).toBe(10);
  await f.port.writeState({ ...f.state()!, observationThreshold: 0 });
  await expect(maintainAttachments(f.port, { action: 'clean' }, 'day-30')).rejects.toThrow('state_invalid');
  expect(f.values.files).toEqual(['a.png']);
});

it('rechecks the database immediately before moving a previously eligible file', async () => {
  const f = fixture();
  await maintainAttachments(f.port, { action: 'configure', settings: { automatic: false, observationThreshold: 1 } }, 'day-1');
  await maintainAttachments(f.port, { action: 'observe' }, 'day-1');
  const save = f.port.writeState;
  f.port.writeState = async (state) => { await save(state); f.values.revision = 'new-reference'; };
  await expect(maintainAttachments(f.port, { action: 'clean' }, 'day-1')).rejects.toThrow('changed');
  expect(f.values.files).toEqual(['a.png']);
});
