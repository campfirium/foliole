import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { sendFramedSyncTransfer: native.send }
}));

import { sendCompanionFramedSyncObject } from './companionFramedSyncTransfer.js';

const args = {
  endpointUrl: 'http://desktop:43110', groupId: 'group-1', objectId: 'node-1',
  receiverDeviceId: 'desktop-1', receiverLibraryEpoch: 'desktop-epoch-1'
};
const receipt = {
  applied_state_hash: 'a'.repeat(64), content_id: 'b'.repeat(64),
  receiver_device_id: args.receiverDeviceId,
  receiver_library_epoch: args.receiverLibraryEpoch, transfer_id: 'c'.repeat(64)
};

it('sends one current object through the native framed transfer contract', async () => {
  native.send.mockResolvedValueOnce(receipt);
  await expect(sendCompanionFramedSyncObject(args)).resolves.toEqual(receipt);
  expect(native.send).toHaveBeenCalledWith({
    endpoint_url: args.endpointUrl, object_id: args.objectId,
    receiver_device_id: args.receiverDeviceId,
    receiver_library_epoch: args.receiverLibraryEpoch, sync_group_id: args.groupId
  });
});

it('rejects a receipt bound to a different receiver', async () => {
  native.send.mockResolvedValueOnce({ ...receipt, receiver_device_id: 'another-device' });
  await expect(sendCompanionFramedSyncObject(args))
    .rejects.toThrow('framed_sync_transfer_receipt_invalid');
});

it('propagates native transfer failures without falling back', async () => {
  const failure = new Error('framed_sync_http_503');
  native.send.mockRejectedValueOnce(failure);
  await expect(sendCompanionFramedSyncObject(args)).rejects.toBe(failure);
});
