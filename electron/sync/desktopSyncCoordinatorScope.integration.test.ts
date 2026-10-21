// @vitest-environment node
import { promises as fs } from 'node:fs';
import http from 'node:http';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { createDesktopFramedSyncTwoProcessFixture,
  type DesktopFramedSyncFixtureSnapshot } from './desktopFramedSyncTwoProcess.testSupport.js';

it('persists all available libraries after manual sync overlaps a targeted automatic round', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  const third = await fixture.startThird();
  const gate = await createRequestGate(fixture.rightSnapshot.origin);
  const right = { ...fixture.rightSnapshot, origin: gate.origin };
  try {
    await fixture.left.seed({ nodeId: 'left-topic', title: 'Left', content: 'Saved on first device' });
    await third.process.seed({ nodeId: 'third-topic', title: 'Third', content: 'Saved on third device' });
    await fixture.left.invoke('round', { input: peerCommand('remember_peer', right) });
    await fixture.left.invoke('round', { input: peerCommand('remember_peer', third.snapshot) });
    const automatic = fixture.left.invoke('round', { input: peerCommand('trigger_peer_sync', right) });
    await gate.entered;
    const manual = fixture.left.invoke('round', { input: { kind: 'trigger_sync' } });
    await fixture.left.snapshot();
    gate.release();
    await Promise.all([automatic, manual]);
    expect(readContent(fixture.leftSnapshot.databasePath, 'third-topic')).toBe('Saved on third device');
    expect(readContent(fixture.rightSnapshot.databasePath, 'left-topic')).toBe('Saved on first device');
    expect(readContent(third.snapshot.databasePath, 'left-topic')).toBe('Saved on first device');
    const restarted = await fixture.restartLeft();
    expect(readContent(restarted.snapshot.databasePath, 'third-topic')).toBe('Saved on third device');
    await fixture.left.invoke('round', { input: peerCommand('remember_peer', right) });
    await fixture.left.invoke('round', { input: peerCommand('remember_peer', third.snapshot) });
    await expect(fixture.left.invoke('round', { input: { kind: 'trigger_sync' } }))
      .resolves.toMatchObject({ status: 'completed' });
  } finally {
    gate.release();
    await gate.close();
    await Promise.allSettled([fixture.left.close(), fixture.right.close(), third.process.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

function peerCommand(kind: string, peer: DesktopFramedSyncFixtureSnapshot) {
  return { kind, peer: { deviceId: peer.deviceId, libraryEpoch: `${peer.deviceId}-epoch` },
    peerOrigin: peer.origin };
}

it('completes current-state sync without rewriting an unrelated legacy historical body', { meta: { calibratedMs: 60_000 } }, async () => {
  const fixture = await createDesktopFramedSyncTwoProcessFixture(undefined, true, true);
  try {
    await fixture.left.seed({ nodeId: 'legacy-topic', title: 'Legacy', content: 'Original historical body' });
    const original = new Database(fixture.leftSnapshot.databasePath, { readonly: true });
    let base: string;
    try { base = original.prepare<[], { current_version_id: string }>(
      "SELECT current_version_id FROM nodes WHERE id = 'legacy-topic'").get()!.current_version_id; }
    finally { original.close(); }
    await fixture.left.invoke('round', { input: peerCommand('remember_peer', fixture.rightSnapshot) });
    await fixture.left.invoke('round', { input: { kind: 'trigger_sync' } });
    await fixture.left.seed({ nodeId: 'legacy-topic', title: 'Legacy', content: 'Current body' });
    await fixture.left.invoke('round', { input: { kind: 'trigger_sync' } });
    const sqlite = new Database(fixture.leftSnapshot.databasePath);
    try {
      // Represent a legacy source that still owns the original bytes but has no hash metadata.
      expect(sqlite.prepare(`UPDATE node_sync_versions SET body_text = ?,
        snapshot_json = json_remove(snapshot_json, '$.body_blob_hash', '$.body_deleted')
        WHERE version_id = ?`).run('Original historical body', base).changes).toBe(1);
    } finally { sqlite.close(); }
    await expect(fixture.left.invoke('round', { input: { kind: 'trigger_sync' } }))
      .resolves.toMatchObject({ status: 'completed' });
    expect(readContent(fixture.rightSnapshot.databasePath, 'legacy-topic')).toBe('Current body');
    const restarted = await fixture.restartLeft();
    const stored = new Database(restarted.snapshot.databasePath, { readonly: true });
    try {
      expect(stored.prepare(`SELECT body_text, json_extract(snapshot_json, '$.body_blob_hash') AS body_hash FROM node_sync_versions
        WHERE version_id = ?`).get(base))
        .toEqual({ body_text: 'Original historical body', body_hash: null });
      expect(readContent(restarted.snapshot.databasePath, 'legacy-topic')).toBe('Current body');
    } finally { stored.close(); }
  } finally {
    await Promise.allSettled([fixture.left.close(), fixture.right.close()]);
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
});

function readContent(databasePath: string, id: string) {
  const sqlite = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { return sqlite.prepare('SELECT content FROM nodes WHERE id = ?').pluck().get(id); }
  finally { sqlite.close(); }
}

async function createRequestGate(targetOrigin: string) {
  let release!: () => void;
  let enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const server = http.createServer((request, response) => {
    enter();
    void released.then(() => {
      const upstream = http.request(new URL(request.url ?? '/', targetOrigin), {
        method: request.method, headers: request.headers
      }, reply => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      });
      upstream.once('error', () => response.destroy());
      request.pipe(upstream);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('request_gate_port_missing');
  return { entered, release, origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>(resolve => {
      server.closeAllConnections();
      server.close(() => resolve());
    }) };
}
