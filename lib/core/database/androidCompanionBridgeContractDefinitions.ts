export const ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS = {
  methodInventory: {
    folioleCompanionSync: [
      'clearPairingCredentials',
      'commitAttachmentResourceBatch',
      'commitContentBlobBatch',
      'desktopHttpRequest',
      'diagnoseSync',
      'downloadAttachmentResourceBatch',
      'downloadContentBlobBatch',
      'loadDiscoveryCandidates',
      'loadExternalDirectory',
      'loadExternalDocument',
      'loadMissingAttachmentResource',
      'loadMissingAttachmentResources',
      'loadMissingContentBlobHashes',
      'loadPairingState',
      'loadPdfPageText',
      'loadReadableArticle',
      'loadSyncIndex',
      'loadSyncNodeConflicts',
      'loadSyncNodeVersionCursor',
      'loadSyncNodeVersionPushCursor',
      'loadSyncNodeVersions',
      'loadSyncObjects',
      'loadSyncPackCursor',
      'loadSyncReviewLog',
      'loadSyncReviewLogCursor',
      'loadSyncReviewLogPushCursor',
      'loadSyncStateChanges',
      'loadSyncStateCursor',
      'loadSyncStatePushCursor',
      'loadWorkspaceSyncState',
      'recordWorkspaceSyncEvent',
      'releaseDatabaseConnection',
      'removeWorkspaceSyncRememberedTarget',
      'resolveAttachmentResource',
      'savePairingCredentials',
      'savePrimaryDeviceId',
      'saveSyncActiveViewState',
      'saveSyncNodeReadingRecord',
      'saveSyncNodeReviewRecord',
      'saveSyncNodeVersionCursor',
      'saveSyncNodeVersionPushCursor',
      'saveSyncNodeViewState',
      'saveSyncOnboardingStatus',
      'saveSyncPackCursor',
      'saveSyncPushAcks',
      'saveSyncReviewLogCursor',
      'saveSyncReviewLogPushCursor',
      'saveSyncSettingRecord',
      'saveSyncStateCursor',
      'saveSyncStatePushCursor',
      'saveWorkspaceSyncEndpoint',
      'searchExternalDocuments',
      'searchPdfPageText',
      'searchTopics',
      'signCompanionSyncRequest'
    ]
  },
  hostApi: {
    bootstrap: {
      deviceNameDefaults: {
        defaultDeviceName: 'Android device',
        emulatorDeviceName: 'Android Emulator',
        emulatorModelTokens: ['sdk', 'gphone', 'emulator']
      },
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
    contentBlobBatch: {
      responseHeaderKeys: {
        blobHash: 'x-blob-hash'
      }
    },
    network: {
      discoveryDefaults: {
        emulatorHost: '10.0.2.2',
        endpointTemplate: 'http://{host}:{port}',
        hostToken: '{host}',
        port: 38641,
        portToken: '{port}',
        serviceType: '_foliole-sync._tcp.',
        timeoutMs: 1500
      },
      discoveryResponseKeys: {
        candidates: 'candidates'
      },
      discoveryCandidateKeys: {
        endpointUrl: 'endpoint_url',
        protocolTxt: 'protocol_txt',
        source: 'source'
      },
      protocolTxtKeys: {
        capabilities: 'protocol_capabilities',
        maxSupportedVersion: 'protocol_max_version',
        minSupportedVersion: 'protocol_min_version',
        version: 'protocol_version'
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
      negotiatedProtocolVersion: 'negotiated_protocol_version',
      pairedAt: 'paired_at',
      primaryDeviceId: 'primary_device_id',
      remoteProtocol: 'remote_protocol'
    },
    preferenceKeys: {
      deviceId: 'device_id',
      deviceKind: 'device_kind',
      deviceName: 'device_name',
      deviceSecret: 'device_secret',
      deviceSecretIv: 'device_secret_iv',
      negotiatedProtocolVersion: 'negotiated_protocol_version',
      pairedAt: 'paired_at',
      primaryDeviceId: 'primary_device_id',
      remoteProtocol: 'remote_protocol'
    },
    storageKeys: {
      keyAlias: 'foliole_companion_pairing_secret',
      preferencesName: 'foliole_companion_pairing'
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
      negotiatedProtocolVersion: 'negotiated_protocol_version',
      pairedAt: 'paired_at',
      primaryDeviceId: 'primary_device_id',
      remoteProtocol: 'remote_protocol',
      repairRequired: 'repair_required',
      syncUsable: 'sync_usable'
    }
  },
  resourcePlugin: {
    defaults: {
      externalDocumentSearchLimit: 20,
      missingResourceLimit: 50,
      pdfPageTextSearchLimit: 20,
      topicSearchLimit: 20
    },
    requestKeys: {
      attachmentId: 'attachment_id',
      batchToken: 'batch_token',
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
