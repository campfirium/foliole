import type { NativeCompanionFramedSyncTransferReceipt } from '../../../../../../lib/platform/nativeCompanionSyncContract.js';
import { FolioleCompanionSync } from '../../../companionWorkspaceRuntimeRepository.js';

export interface SendCompanionFramedSyncObjectArgs {
  endpointUrl: string;
  groupId: string;
  includeCurrentNode: boolean;
  objectId: string;
  objectType: string;
  receiverDeviceId: string;
  receiverLibraryEpoch: string;
  requiredRelationIds: readonly string[];
  reviewFactIds: readonly string[];
  stateFactIds: readonly string[];
}

const HEX_DIGEST = /^[a-f0-9]{64}$/u;

export function assertCompanionFramedSyncReceipt(
  args: Pick<SendCompanionFramedSyncObjectArgs, 'receiverDeviceId' | 'receiverLibraryEpoch'>,
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
    include_current_node: args.includeCurrentNode,
    object_id: args.objectId,
    object_type: args.objectType,
    receiver_device_id: args.receiverDeviceId,
    receiver_library_epoch: args.receiverLibraryEpoch,
    required_relation_ids: args.requiredRelationIds,
    review_fact_ids: args.reviewFactIds,
    state_fact_ids: args.stateFactIds,
    sync_group_id: args.groupId
  });
  assertCompanionFramedSyncReceipt(args, receipt);
  return receipt;
}
