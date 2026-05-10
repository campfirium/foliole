import { registerPlugin } from '@capacitor/core';

import { canRunPrimaryDeviceExternalSource, resolvePrimaryDeviceState } from '../../../lib/core/sync/primaryDeviceResolver';
import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { NativeReadwiseTokenConnection, NativeReadwiseTokenSyncResult } from '../../../lib/platform/nativeReadwiseContract';

import { syncReadwiseCredentialBagFromDesktop } from './companionCredentialBag';
import { loadCompanionPairingState } from './companionWorkspacePairing';
import { isNativeAndroidCompanionRuntime } from './companionWorkspaceRuntimeRepository';
import { loadCompanionWorkspaceSyncState } from './companionWorkspaceSync';
import { getRuntimeInvoke } from './runtimeInvoke';

export type RuntimeReadwiseTokenConnection = NativeReadwiseTokenConnection;
export type RuntimeReadwiseTokenSyncResult = NativeReadwiseTokenSyncResult;

interface ReadwiseTokenPlugin {
  loadReadwiseTokenConnection(): Promise<NativeReadwiseTokenConnection>;
  connectReadwiseToken(args: { token: string }): Promise<NativeReadwiseTokenConnection>;
  disconnectReadwiseToken(): Promise<NativeReadwiseTokenConnection>;
}

const FolioleReadwiseToken = registerPlugin<ReadwiseTokenPlugin>('FolioleReadwiseToken');

function unavailableConnection(): NativeReadwiseTokenConnection {
  return {
    checked_at: null,
    connected: false,
    message: 'Readwise connection is available in the desktop app and Android app.',
    status: 'not_connected'
  };
}

function secondaryConnection(): NativeReadwiseTokenConnection {
  return {
    checked_at: null,
    connected: false,
    message: 'Readwise can be connected only on the current primary device.',
    status: 'not_connected'
  };
}

function unavailableSyncResult(message: string): NativeReadwiseTokenSyncResult {
  return {
    checked_at: new Date().toISOString(),
    document_count: 0,
    message,
    source_count: 0,
    status: 'blocked_secondary'
  };
}

async function canCompanionConnectExternalSource() {
  const pairing = await loadCompanionPairingState();
  if (!pairing.is_paired) {
    return true;
  }
  if (!pairing.device_id) {
    return false;
  }
  return canRunPrimaryDeviceExternalSource(resolvePrimaryDeviceState({
    hostKind: 'companion',
    isPairedToPrimary: true,
    localDeviceId: pairing.device_id,
    pairedPrimaryDeviceId: pairing.primary_device_id
  }));
}

export async function loadReadwiseTokenConnectionFromRuntime(): Promise<NativeReadwiseTokenConnection> {
  const runtimeInvoke = getRuntimeInvoke();
  if (runtimeInvoke) {
    return runtimeInvoke(NATIVE_COMMANDS.loadReadwiseTokenConnection);
  }
  if (isNativeAndroidCompanionRuntime()) {
    const connection = await FolioleReadwiseToken.loadReadwiseTokenConnection();
    if (connection.connected) {
      return connection;
    }
    const syncState = await loadCompanionWorkspaceSyncState();
    const endpointUrl = syncState.endpoint_url ?? syncState.remembered_targets[0] ?? null;
    const synced = endpointUrl ? await syncReadwiseCredentialBagFromDesktop(endpointUrl).catch(() => null) : null;
    return synced ?? connection;
  }
  return unavailableConnection();
}

export async function connectReadwiseTokenInRuntime(token: string): Promise<NativeReadwiseTokenConnection> {
  const runtimeInvoke = getRuntimeInvoke();
  if (runtimeInvoke) {
    return runtimeInvoke(NATIVE_COMMANDS.connectReadwiseToken, { token });
  }
  if (isNativeAndroidCompanionRuntime()) {
    if (!(await canCompanionConnectExternalSource())) {
      return secondaryConnection();
    }
    return FolioleReadwiseToken.connectReadwiseToken({ token });
  }
  return unavailableConnection();
}

export async function disconnectReadwiseTokenInRuntime(): Promise<NativeReadwiseTokenConnection> {
  const runtimeInvoke = getRuntimeInvoke();
  if (runtimeInvoke) {
    return runtimeInvoke(NATIVE_COMMANDS.disconnectReadwiseToken);
  }
  if (isNativeAndroidCompanionRuntime()) {
    return FolioleReadwiseToken.disconnectReadwiseToken();
  }
  return unavailableConnection();
}

export async function syncReadwiseTokenLibraryInRuntime(): Promise<NativeReadwiseTokenSyncResult> {
  const runtimeInvoke = getRuntimeInvoke();
  if (runtimeInvoke) {
    return runtimeInvoke(NATIVE_COMMANDS.syncReadwiseTokenLibrary);
  }
  if (isNativeAndroidCompanionRuntime()) {
    if (!(await canCompanionConnectExternalSource())) {
      return unavailableSyncResult('Readwise sync runs on the current primary device.');
    }
    return unavailableSyncResult('Readwise library sync on Android is not connected yet.');
  }
  return unavailableSyncResult('Readwise sync is available in the desktop app and Android app.');
}
