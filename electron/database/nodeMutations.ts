import {
  clearNodeOrder as clearNodeOrderViaDriver,
  deleteNodesPermanently as deleteNodesPermanentlyViaDriver,
  replaceNodeOrder as replaceNodeOrderViaDriver,
  restoreNodes as restoreNodesViaDriver,
  softDeleteNodes as softDeleteNodesViaDriver,
  upsertNodeSnapshot as upsertNodeSnapshotViaDriver
} from '../../lib/core/database/nodeMutations.js';
import type {
  DeleteNodesPermanentlyInput,
  RestoreNodesInput,
  SoftDeleteNodesInput,
  UpsertNodeSnapshotInput
} from '../../lib/core/database/nodeMutations.js';

import { openDatabaseConnection } from './connection.js';
import { withTransaction } from './transaction.js';

export type {
  DeleteNodesPermanentlyInput,
  RestoreNodesInput,
  SoftDeleteNodesInput,
  UpsertNodeSnapshotInput
};

export function upsertNodeSnapshot(input: UpsertNodeSnapshotInput): void {
  upsertNodeSnapshotViaDriver(openDatabaseConnection().driver, input);
}

export function upsertNodeSnapshots(inputs: UpsertNodeSnapshotInput[]): void {
  const connection = openDatabaseConnection();
  withTransaction(connection.driver, () => {
    inputs.forEach((input) => {
      upsertNodeSnapshotViaDriver(connection.driver, input);
    });
  });
}

export function replaceNodeOrder(nodeIds: string[]): void {
  replaceNodeOrderViaDriver(openDatabaseConnection().driver, nodeIds);
}

export function clearNodeOrder(): void {
  clearNodeOrderViaDriver(openDatabaseConnection().driver);
}

export function softDeleteNodes(input: SoftDeleteNodesInput): void {
  softDeleteNodesViaDriver(openDatabaseConnection().driver, input);
}

export function restoreNodes(input: RestoreNodesInput): void {
  restoreNodesViaDriver(openDatabaseConnection().driver, input);
}

export function deleteNodesPermanently(input: DeleteNodesPermanentlyInput): string[] {
  return deleteNodesPermanentlyViaDriver(openDatabaseConnection().driver, input);
}
