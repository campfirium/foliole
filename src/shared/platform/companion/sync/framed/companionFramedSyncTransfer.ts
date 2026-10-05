import type { NativeCompanionFramedSyncTransferReceipt } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

interface SendCompanionFramedSyncObjectArgs {
  endpointUrl: string;
  groupId: string;
  objectId: string;
  receiverDeviceId: string;
  receiverLibraryEpoch: string;
}

const HEX_DIGEST = /^[a-f0-9]{64}$/u;

function assertReceipt(
  args: SendCompanionFramedSyncObjectArgs,
  receipt: NativeCompanionFramedSyncTransferReceipt
) {
  if (receipt.receiver_device_id !== args.receiverDeviceId ||
      receipt.receiver_library_epoch !== args.receiverLibraryEpoch ||
      !HEX_DIGEST.test(receipt.transfer_id) || !HEX_DIGEST.test(receipt.content_id) ||
      !HEX_DIGEST.test(receipt.applied_state_hash)) {
    throw new Error('framed_sync_transfer_receipt_invalid');
  }
}

/** Send one explicitly selected current object through the native durable framed transport. */
export async function sendCompanionFramedSyncObject(args: SendCompanionFramedSyncObjectArgs) {
  const receipt = await FolioleCompanionSync.sendFramedSyncTransfer({
    endpoint_url: args.endpointUrl,
    object_id: args.objectId,
    receiver_device_id: args.receiverDeviceId,
    receiver_library_epoch: args.receiverLibraryEpoch,
    sync_group_id: args.groupId
  });
  assertReceipt(args, receipt);
  return receipt;
}
