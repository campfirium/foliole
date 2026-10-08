export const COMPANION_SYNC_GROUP_DATA_CONTRACT = Object.freeze({
  eventName: 'syncGroupDataRequest',
  operations: Object.freeze({
    createSnapshot: 'create_snapshot',
    readIdentitySource: 'read_identity_source',
    prepareIdentityPack: 'prepare_identity_pack',
    applyIdentityPack: 'apply_identity_pack',
    applyFramedTransfer: 'apply_framed_transfer',
    completeFramedOutbound: 'complete_framed_outbound',
    inspectFramedOutbound: 'inspect_framed_outbound',
    prepareFramedOutbound: 'prepare_framed_outbound',
    readFramedInventory: 'read_framed_inventory',
    readFramedBody: 'read_framed_body',
    readFramedOutboundFact: 'read_framed_outbound_fact',
    attachmentCheckpoint: 'attachment_checkpoint',
    confirmVersionPack: 'confirm_version_pack',
    applyMemberState: 'apply_member_state',
    validateJoin: 'validate_join',
    loadCurrentCredential: 'load_current_credential',
    loadGroup: 'load_group',
    loadMemberState: 'load_member_state',
    registerDevice: 'register_device',
    verifyDevice: 'verify_device',
    recordSupplyCursor: 'record_supply_cursor',
    saveSyncEndpoint: 'save_sync_endpoint',
    stageVersionPack: 'stage_version_pack'
  }),
  requestKeys: Object.freeze({
    operation: 'operation',
    payload: 'payload',
    requestId: 'request_id'
  }),
  responseKeys: Object.freeze({
    error: 'error',
    requestId: 'request_id',
    result: 'result'
  })
});

export type CompanionSyncGroupDataOperation =
  (typeof COMPANION_SYNC_GROUP_DATA_CONTRACT.operations)[keyof typeof COMPANION_SYNC_GROUP_DATA_CONTRACT.operations];

export interface CompanionSyncGroupDataRequest {
  operation: CompanionSyncGroupDataOperation;
  payload: Record<string, unknown>;
  request_id: string;
}
