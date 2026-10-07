import { createHash } from 'node:crypto';

import type { VerifiedBodyRef } from '../sync/verifiedBody.js';

import { writeBodyJsonWithDriver } from './bodyJsonWithDriver.js';
import type { DatabaseDriver } from './driver.js';
import { buildCanonicalNodeSyncPayload, type NodeSyncHashInput } from './nodeSyncPayload.js';

/** Original canonical node identity without assembling its content JSON string. */
export function computeNodeSyncHashWithBody(driver: DatabaseDriver,
  metadata: Omit<NodeSyncHashInput, 'content'>, body: VerifiedBodyRef) {
  const digest = createHash('sha256');
  const write = (text: string) => { digest.update(text); };
  write('{');
  let separator = '';
  for (const [key, value] of Object.entries(buildCanonicalNodeSyncPayload({ ...metadata, content: '' }))) {
    write(`${separator}${JSON.stringify(key)}:`);
    if (key === 'content') writeBodyJsonWithDriver(driver, body, write);
    else write(JSON.stringify(value));
    separator = ',';
  }
  write('}');
  return digest.digest('hex');
}
