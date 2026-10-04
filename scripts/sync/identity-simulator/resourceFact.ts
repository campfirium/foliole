import { promises as fs } from 'node:fs';
import path from 'node:path';

import { expect } from 'vitest';

import { importImageAttachmentResource } from '../../../electron/attachments/importImageAttachmentResource.js';
import { runDesktopSyncIdentityRound } from '../../../electron/sync/desktopSyncIdentityRound.js';

import { assertBody, assertHealthy, convergenceState } from './assertions.js';
import { edit, resetOperations } from './operations.js';
import { openPeer, pairPeers, reopenPeer } from './peers.js';
import { inPeer, type SimulatorPeer } from './scope.js';
import { route, serve } from './transport.js';

/** Equal identity fingerprints must still recover missing attachment bytes. */
export async function runIdentityMissingResource(root: string) {
  process.env.FOLIOLE_SIM_SCENARIO = 'identity-missing-resource';
  resetOperations();
  await fs.mkdir(root, { recursive: true });
  const peers = ['a', 'b'].map((name) => openPeer(root, name, 'identity-missing-resource'));
  const [a, b] = peers as [SimulatorPeer, SimulatorPeer];
  pairPeers(peers);
  const endpoint = await serve(a);
  try {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLs8AAAAASUVORK5CYII=', 'base64');
    const imported = await inPeer(a, () => importImageAttachmentResource({ bytes,
      mimeType: 'image/png', originalName: 'pixel.png', errorSource: 'simulator' }));
    expect(imported.status).toBe('imported');
    if (imported.status !== 'imported') throw new Error('simulator_attachment_import_failed');
    const body = `![pixel](asset://${imported.storage_key})`;
    edit(a, body);
    const exchange = () => inPeer(b, () => runDesktopSyncIdentityRound(route(endpoint, b)));
    await exchange();
    expect(convergenceState(b)).toEqual(convergenceState(a));
    const file = path.join(b.assets, imported.storage_key);
    expect(await fs.readFile(file)).toEqual(bytes);
    await fs.rm(file);
    const repaired = await exchange();
    expect(repaired.verifiedCandidateCount).toBe(0);
    expect(await fs.readFile(file)).toEqual(bytes);
    reopenPeer(b);
    expect(await fs.readFile(file)).toEqual(bytes);
    assertBody(b, body);
    peers.forEach((peer) => assertHealthy(peer, []));
  } finally {
    await endpoint.close();
    for (const peer of peers) peer.sqlite.close();
  }
}
