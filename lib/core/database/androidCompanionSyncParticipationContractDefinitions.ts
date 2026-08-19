export const ANDROID_COMPANION_SYNC_GROUP_PROVIDER_CONTRACT_DEFINITIONS = {
  dataRequestEvent: 'syncGroupDataRequest',
  serviceHintEvent: 'syncGroupServiceHint',
  serviceHintKeys: {
    endpointUrl: 'endpoint_url'
  },
  dataRequestKeys: {
    operation: 'operation',
    payload: 'payload',
    requestId: 'request_id'
  },
  dataResponseKeys: {
    error: 'error',
    requestId: 'request_id',
    result: 'result'
  },
  requestKeys: {
    appVersion: 'app_version',
    authorizationId: 'authorization_id',
    databasePath: 'database_path',
    deviceId: 'device_id',
    deviceName: 'device_name',
    factsRevision: 'facts_revision',
    group: 'sync_group',
    pairRequestId: 'pair_request_id',
    workgroupKey: 'workgroup_key'
  }
} as const;

export const ANDROID_COMPANION_SYNC_PARTICIPATION_CONTRACT_DEFINITIONS = {
  defaults: {
    syncEnabled: true,
    syncPaused: false
  },
  requestKeys: {
    syncEnabled: 'sync_enabled',
    syncPaused: 'sync_paused'
  },
  stateKeys: {
    lifecycleActive: 'lifecycle_active',
    participating: 'participating',
    syncEnabled: 'sync_enabled',
    syncPaused: 'sync_paused'
  },
  storage: {
    preferencesName: 'foliole_companion_sync_participation'
  }
} as const;
