// @vitest-environment node
import { expect, it } from 'vitest';

import {
  IOS_SYNC_PACK_CAPTURE_OBJECT_ID,
  IOS_SYNC_PACK_CAPTURE_VERSION_ID,
  IOS_SYNC_PACK_RESTORE_VERSION_ID
} from '../../lib/platform/iosSyncPackAcceptanceContract.ts';

import { acceptIosAcceptancePush } from './ios-acceptance-mechanical-push.ts';

it('acknowledges fixed node versions and canonicalizes only the runtime capture identity', () => {
  const captureId = 'node-runtime-capture';
  const result = acceptIosAcceptancePush(JSON.stringify({ items: [
    nodePush(captureId, IOS_SYNC_PACK_CAPTURE_VERSION_ID),
    nodePush('ios-acceptance-restore', IOS_SYNC_PACK_RESTORE_VERSION_ID)
  ] }));

  expect(result.acks).toEqual([
    expect.objectContaining({
      canonical_object_id: IOS_SYNC_PACK_CAPTURE_OBJECT_ID,
      identity: expect.objectContaining({ objectId: captureId }),
      version_id: IOS_SYNC_PACK_CAPTURE_VERSION_ID
    }),
    expect.not.objectContaining({ canonical_object_id: expect.anything() })
  ]);
  expect(result.acks[1]).toMatchObject({ version_id: IOS_SYNC_PACK_RESTORE_VERSION_ID });
});

function nodePush(objectId, versionId) {
  return {
    authorHostName: 'ios-acceptance-contract-runtime',
    base: { ancestorVersionIds: [], kind: 'node_version', parentVersionId: null },
    clientOpId: `node:${versionId}`,
    identity: { objectId, objectType: 'node', scope: 'workspace' },
    payloadJson: JSON.stringify({ version_id: versionId })
  };
}
