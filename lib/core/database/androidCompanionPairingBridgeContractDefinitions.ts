export const ANDROID_COMPANION_PAIRING_BRIDGE_CONTRACT_DEFINITIONS = {
  routeBindingRequestKeys: {
    endpointUrl: 'endpoint_url',
    localAuthorizationId: 'local_authorization_id',
    localHostName: 'local_host_name',
    peerAuthorizationId: 'peer_authorization_id',
    peerHostName: 'peer_host_name',
    peerHostPlatform: 'peer_host_platform',
    syncGroupId: 'sync_group_id'
  },
  credentialRequestKeys: {
    authorizationId: 'authorization_id',
    credentialSecret: 'credential_secret',
    deviceId: 'device_id',
    deviceKind: 'device_kind',
    deviceName: 'device_name',
    deviceSecret: 'device_secret',
    endpointUrl: 'endpoint_url',
    syncGroupId: 'sync_group_id',
    negotiatedProtocolVersion: 'negotiated_protocol_version',
    pairedAt: 'paired_at',
    providerDeviceSecret: 'provider_device_secret',
    remotePeerId: 'remote_peer_id',
    remotePeerName: 'remote_peer_name',
    remotePeerPlatform: 'remote_peer_platform',
    remoteProtocol: 'remote_protocol'
  },
  preferenceKeys: {
    authorizationId: 'authorization_id',
    credentialSecret: 'credential_secret',
    credentialSecretIv: 'credential_secret_iv',
    deviceId: 'device_id',
    deviceKind: 'device_kind',
    deviceName: 'device_name',
    deviceSecret: 'device_secret',
    deviceSecretIv: 'device_secret_iv',
    hostName: 'host_name',
    hostPlatform: 'host_platform',
    negotiatedProtocolVersion: 'negotiated_protocol_version',
    pairedAt: 'paired_at',
    remotePeerId: 'remote_peer_id',
    remotePeerName: 'remote_peer_name',
    remotePeerPlatform: 'remote_peer_platform',
    remoteProtocol: 'remote_protocol'
  },
  storageKeys: {
    keyAlias: 'foliole_companion_pairing_secret',
    preferencesName: 'foliole_companion_pairing'
  },
  signature: {
    headerKeys: {
      authorizationId: 'X-Authorization-Id',
      nonce: 'X-Nonce',
      signature: 'X-Signature',
      timestamp: 'X-Timestamp'
    },
    requestKeys: {
      body: 'body',
      bodyHash: 'body_hash',
      endpointUrl: 'endpoint_url',
      method: 'method',
      nonce: 'nonce',
      pathWithQuery: 'path_with_query',
      syncGroupId: 'sync_group_id',
      timestamp: 'timestamp',
      workgroupKey: 'workgroup_key'
    },
    responseKeys: {
      headers: 'headers'
    }
  },
  stateKeys: {
    authorizationId: 'authorization_id',
    deviceId: 'device_id',
    deviceKind: 'device_kind',
    deviceName: 'device_name',
    hostName: 'host_name',
    hostPlatform: 'host_platform',
    isPaired: 'is_paired',
    negotiatedProtocolVersion: 'negotiated_protocol_version',
    pairedAt: 'paired_at',
    remotePeerId: 'remote_peer_id',
    remotePeerName: 'remote_peer_name',
    remotePeerPlatform: 'remote_peer_platform',
    remoteProtocol: 'remote_protocol',
    repairRequired: 'repair_required',
    syncUsable: 'sync_usable'
  }
} as const;
