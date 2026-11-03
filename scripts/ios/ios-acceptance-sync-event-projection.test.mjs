// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

import {
  loadProjection, persistFriProjection, resolveFriEvidenceRoot
} from './ios-acceptance-sync-event-projection.mjs';

it('reads the current signed projection while exposing only sync completion fields', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-current-projection-'));
  const value = {
    build_identity: 'candidate', container_identity: 'com.campfirium.foliole.ios.dev',
    conflict_versions: [], inventory: [], state_inventory_rows: [],
    acceptance_document: [], overwrite_pending: 0,
    events: [{ run_id: 'new-manual', status: 'completed', result: 'completed',
      trigger_reason: 'manual', started_at: '2026-10-30T05:00:00Z',
      message: 'Sync completed.', summary: { nodes: 1 } }]
  };
  const file = path.join(root, 'projection.json');
  const run = async () => persistFriProjection(
    loadProjection(root, 'candidate', 'com.campfirium.foliole.ios.dev'), path.join(root, 'saved'));
  try {
    fs.writeFileSync(file, JSON.stringify(value));
    const result = await run();
    expect(result.value.events[0]).toMatchObject({ run_id: 'new-manual', status: 'completed' });
    expect(result.value.events[0]).not.toHaveProperty('message');
    expect(result.value.events[0]).not.toHaveProperty('summary');
    expect(result.value).not.toHaveProperty('inventory');
    expect(JSON.parse(fs.readFileSync(result.file, 'utf8'))).toEqual(result.value);
    fs.writeFileSync(file, JSON.stringify({ ...value, workgroup_key: 'unexpected' }));
    await expect(run()).rejects.toThrow('unsupported fields');
    delete value.events[0].message;
    value.events[0].credential = 'unexpected';
    fs.writeFileSync(file, JSON.stringify(value));
    await expect(run()).rejects.toThrow('unsupported fields');
  } finally { fs.rmSync(root, { force: true, recursive: true }); }
});

it('loads promoted Fri evidence from the runner receipt', () => {
  const result = { lines: ['build output', JSON.stringify({
    classification: 'accepted', promoted: '/evidence/accepted'
  })] };
  expect(resolveFriEvidenceRoot(result, '/requested')).toBe('/evidence/accepted');
  expect(resolveFriEvidenceRoot({ lines: ['build output'] }, '/requested')).toBe('/requested');
});

it('copies a promoted projection into its run-specific evidence root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fri-projection-'));
  const source = path.join(root, 'promoted.json');
  const evidenceRoot = path.join(root, 'run');
  fs.writeFileSync(source, '{"events":[]}\n');

  const persisted = persistFriProjection({ file: source, value: { events: [] } }, evidenceRoot);

  expect(persisted.file).toBe(path.join(evidenceRoot, 'projection.json'));
  expect(JSON.parse(fs.readFileSync(persisted.file, 'utf8'))).toEqual({ events: [] });
  fs.rmSync(root, { force: true, recursive: true });
});
