import { AsyncLocalStorage } from 'node:async_hooks';

import type { DatabaseConnection } from '../../../electron/database/connection.js';

export interface SimulatorPeer extends DatabaseConnection {
  name: string;
  id: string;
  anchor: string;
  assets: string;
  root: string;
  seed: string;
}
export const routing = new AsyncLocalStorage<SimulatorPeer>();
export function currentPeer() {
  const peer = routing.getStore();
  if (!peer) throw new Error('simulator_peer_scope_missing');
  return peer;
}
export function inPeer<T>(peer: SimulatorPeer, task: () => T): T {
  return routing.run(peer, task);
}
