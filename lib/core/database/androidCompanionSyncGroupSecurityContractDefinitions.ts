export const ANDROID_COMPANION_SYNC_GROUP_SECURITY_CONTRACT_DEFINITIONS = {
  signature: {
    headerKeys: {
      deviceId: 'X-Device-Id',
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
      timestamp: 'timestamp'
    },
    responseKeys: { headers: 'headers' }
  }
} as const;
