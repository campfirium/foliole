import {
  ANDROID_COMPANION_SYNC_GROUP_SECURITY_CONTRACT_DEFINITIONS
} from './androidCompanionSyncGroupSecurityContractDefinitions.js';
import {
  ANDROID_COMPANION_SYNC_GROUP_PROVIDER_CONTRACT_DEFINITIONS,
  ANDROID_COMPANION_SYNC_PARTICIPATION_CONTRACT_DEFINITIONS
} from './androidCompanionSyncParticipationContractDefinitions.js';
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
  hostApi: {
    attachmentResourceSync: COMPANION_ATTACHMENT_RESOURCE_HOST_CONTRACT_DEFINITIONS,
    bootstrap: {
      hostNameDefaults: {
        defaultHostName: 'Android device',
        emulatorHostName: 'Android Emulator',
        emulatorModelTokens: ['sdk', 'gphone', 'emulator']
      },
      outputKeys: {
        bootedAt: 'booted_at',
        databasePath: 'database_path',
        databaseReady: 'database_ready',
        hostName: 'host_name',
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
      discoverySession: {
        eventName: 'syncGroupDiscoveryChanged',
        startMethod: 'startDiscoverySession',
        stopMethod: 'stopDiscoverySession'
      },
      discoveryCandidateKeys: {
        endpointUrl: 'endpoint_url',
        protocolTxt: 'protocol_txt',
        source: 'source'
      },
      protocolTxtKeys: {
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
    syncGroupProvider: ANDROID_COMPANION_SYNC_GROUP_PROVIDER_CONTRACT_DEFINITIONS,
    syncParticipation: ANDROID_COMPANION_SYNC_PARTICIPATION_CONTRACT_DEFINITIONS,
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
        reason: 'reason',
        runId: 'run_id',
        status: 'status'
      }
    }
  },
  syncGroupSecurity: ANDROID_COMPANION_SYNC_GROUP_SECURITY_CONTRACT_DEFINITIONS,
  resourcePlugin: {
    defaults: COMPANION_RESOURCE_PLUGIN_DEFAULTS,
    requestKeys: COMPANION_RESOURCE_PLUGIN_REQUEST_KEYS
  }
} as const;
