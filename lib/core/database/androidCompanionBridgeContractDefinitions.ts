import {
  COMPANION_ATTACHMENT_RESOURCE_HOST_CONTRACT_DEFINITIONS
} from './companionAttachmentResourceHostContractDefinitions.js';
import {
  COMPANION_CONTENT_BLOB_HOST_CONTRACT_DEFINITIONS
} from './companionContentBlobHostContractDefinitions.js';
import {
  COMPANION_RESOURCE_PLUGIN_DEFAULTS,
  COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS
} from './companionResourcePluginContractDefinitions.js';
import { COMPANION_TOPIC_SEARCH_HOST_CONTRACT } from './companionTopicSearchDefinitions.js';

export const ANDROID_COMPANION_BRIDGE_CONTRACT_DEFINITIONS = {
  methodInventory: {
    folioleCompanionSync: [
      'approveSyncGroupJoinRequest',
      'clearPairingCredentials',
      'desktopHttpRequest',
      'downloadAttachmentResourceBatch',
      'downloadContentBlobBatch',
      'finishAttachmentResourceBatch',
      'finishContentBlobBatch',
      'loadDiscoveryCandidates',
      'loadPairingState',
      'loadSyncGroupProviderState',
      'rejectSyncGroupJoinRequest',
      'resolveAttachmentResource',
      'savePairingCredentials',
      'savePrimaryDeviceId',
      'signCompanionSyncRequest',
      'stageAttachmentResourceBatch',
      'startSyncGroupProvider',
      'stopSyncGroupProvider'
    ]
  },
  hostApi: {
    attachmentResourceSync: COMPANION_ATTACHMENT_RESOURCE_HOST_CONTRACT_DEFINITIONS,
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
        blobHash: COMPANION_CONTENT_BLOB_HOST_CONTRACT_DEFINITIONS.responseHeaderKey
      }
    },
    contentBlobSync: COMPANION_CONTENT_BLOB_HOST_CONTRACT_DEFINITIONS,
    topicSearch: COMPANION_TOPIC_SEARCH_HOST_CONTRACT,
    network: {
      discoveryDefaults: {
        emulatorHost: '10.0.2.2',
        endpointTemplate: 'http://{host}:{port}',
        hostToken: '{host}',
        port: 38641,
        portToken: '{port}',
        serviceType: '_foliole-sync._tcp',
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
    syncGroupProvider: {
      requestKeys: {
        appVersion: 'app_version',
        databasePath: 'database_path',
        deviceId: 'device_id',
        deviceName: 'device_name',
        group: 'sync_group',
        pairRequestId: 'pair_request_id'
      }
    },
    syncPackTransfer: {
      requestKeys: {
        expectedPeerId: 'expected_peer_id',
        expectedSourcePeerId: 'expected_source_peer_id',
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
      endpointUrl: 'endpoint_url',
      syncGroupId: 'sync_group_id',
      negotiatedProtocolVersion: 'negotiated_protocol_version',
      pairedAt: 'paired_at',
      primaryDeviceId: 'primary_device_id',
      remotePeerId: 'remote_peer_id',
      remotePeerName: 'remote_peer_name',
      remotePeerPlatform: 'remote_peer_platform',
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
        deviceId: 'X-Device-Id',
        nonce: 'X-Nonce',
        signature: 'X-Signature',
        timestamp: 'X-Timestamp'
      },
      requestKeys: {
        bodyHash: 'body_hash',
        endpointUrl: 'endpoint_url',
        method: 'method',
        nonce: 'nonce',
        pathWithQuery: 'path_with_query',
        syncGroupId: 'sync_group_id',
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
      remotePeerId: 'remote_peer_id',
      remotePeerName: 'remote_peer_name',
      remotePeerPlatform: 'remote_peer_platform',
      remoteProtocol: 'remote_protocol',
      repairRequired: 'repair_required',
      syncUsable: 'sync_usable'
    }
  },
  resourcePlugin: {
    defaults: COMPANION_RESOURCE_PLUGIN_DEFAULTS,
    requestKeys: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS
  }
} as const;
