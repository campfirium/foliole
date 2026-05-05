export const ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS = {
  hostApi: {
    bootstrap: {
      outputKeys: {
        bootedAt: 'booted_at',
        databasePath: 'database_path',
        databaseReady: 'database_ready',
        deviceId: 'device_id',
        deviceName: 'device_name',
        runtimeKind: 'runtime_kind'
      },
      runtimeKind: 'android-capacitor'
    },
    network: {
      discoveryResponseKeys: {
        endpointUrls: 'endpoint_urls'
      },
      requestKeys: {
        body: 'body',
        headers: 'headers',
        method: 'method',
        url: 'url'
      },
      responseKeys: {
        body: 'body',
        status: 'status'
      }
    },
    syncPackTransfer: {
      requestKeys: {
        headers: 'headers',
        packPath: 'pack_path',
        url: 'url'
      },
      responseKeys: {
        deleted: 'deleted',
        packPath: 'pack_path'
      }
    },
    workspaceSync: {
      requestKeys: {
        endpointUrl: 'endpoint_url',
        message: 'message',
        occurredAt: 'occurred_at',
        status: 'status'
      }
    }
  },
  pairingPlugin: {
    credentialRequestKeys: {
      deviceId: 'device_id',
      deviceKind: 'device_kind',
      deviceName: 'device_name',
      deviceSecret: 'device_secret',
      pairedAt: 'paired_at'
    },
    preferenceKeys: {
      deviceId: 'device_id',
      deviceKind: 'device_kind',
      deviceName: 'device_name',
      deviceSecret: 'device_secret',
      deviceSecretIv: 'device_secret_iv',
      pairedAt: 'paired_at'
    },
    signature: {
      headerKeys: {
        deviceId: 'X-Device-Id',
        nonce: 'X-Nonce',
        signature: 'X-Signature',
        timestamp: 'X-Timestamp'
      },
      requestKeys: {
        bodyHash: 'body_hash',
        method: 'method',
        nonce: 'nonce',
        pathWithQuery: 'path_with_query',
        timestamp: 'timestamp'
      },
      responseKeys: {
        headers: 'headers'
      }
    },
    stateKeys: {
      deviceId: 'device_id',
      deviceKind: 'device_kind',
      deviceName: 'device_name',
      isPaired: 'is_paired',
      pairedAt: 'paired_at'
    }
  },
  resourcePlugin: {
    defaults: {
      externalDocumentSearchLimit: 20,
      missingResourceLimit: 50,
      pdfPageTextSearchLimit: 20
    },
    requestKeys: {
      attachmentId: 'attachment_id',
      body: 'body',
      contentHash: 'content_hash',
      documentId: 'document_id',
      hash: 'hash',
      headers: 'headers',
      limit: 'limit',
      query: 'query',
      resources: 'resources',
      url: 'url'
    }
  }
} as const;
