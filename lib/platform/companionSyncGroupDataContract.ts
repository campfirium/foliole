export const COMPANION_SYNC_GROUP_DATA_CONTRACT = Object.freeze({
  eventName: 'syncGroupDataRequest',
  operations: Object.freeze({
    createSnapshot: 'create_snapshot',
    loadCurrentCredential: 'load_current_credential',
    loadGroup: 'load_group',
    registerDevice: 'register_device',
    verifyDevice: 'verify_device',
    recordSupplyCursor: 'record_supply_cursor',
    saveSyncEndpoint: 'save_sync_endpoint'
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
