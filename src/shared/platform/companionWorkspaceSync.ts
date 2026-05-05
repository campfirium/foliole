import { Capacitor, registerPlugin } from '@capacitor/core';

import type {
  NativeCompanionDirtyNodePayload,
  CompanionWorkspaceSnapshotPayload,
  CompanionWorkspaceVersionPayload,
  NativeCompanionReadableArticlePayload,
  NativeCompanionWorkspaceSyncState
} from '../../../lib/platform/nativeCompanionSyncContract';

import { resolveReadableCompanionArticle, type CompanionReadableArticle } from './companionReadableArticle';

const WEB_SYNC_STATE_KEY = 'foliole-companion-workspace-sync-state';
const WORKSPACE_SNAPSHOT_PATH = '/companion/workspace-snapshot';
const WORKSPACE_VERSION_PATH = '/companion/workspace-version';

interface CompanionWorkspaceSyncPlugin {
  loadDirtyNodes(): Promise<NativeCompanionDirtyNodePayload>;
  loadWorkspaceSyncState(): Promise<NativeCompanionWorkspaceSyncState>;
  loadReadableArticle(): Promise<NativeCompanionReadableArticlePayload>;
  saveWorkspaceSyncEndpoint(args: { endpoint_url: string | null }): Promise<NativeCompanionWorkspaceSyncState>;
  replaceWorkspaceSnapshot(args: {
    endpoint_url: string;
    last_synced_at: string;
    workspace_snapshot_json: string;
  }): Promise<NativeCompanionWorkspaceSyncState>;
  replaceWorkspaceNode(args: {
    endpoint_url: string;
    last_synced_at: string;
    node_id: string;
    node_snapshot_json: string;
  }): Promise<NativeCompanionWorkspaceSyncState>;
}

const FolioleCompanionSync = registerPlugin<CompanionWorkspaceSyncPlugin>('FolioleCompanionSync');

function isNativeAndroidCompanionRuntime() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function normalizeWorkspaceSyncState(value: unknown): NativeCompanionWorkspaceSyncState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      endpoint_url: null,
      last_synced_at: null,
      workspace_snapshot: null
    };
  }

  const raw = value as Record<string, unknown>;
  return {
    endpoint_url: typeof raw.endpoint_url === 'string' && raw.endpoint_url.trim() ? raw.endpoint_url.trim() : null,
    last_synced_at: typeof raw.last_synced_at === 'string' && raw.last_synced_at.trim() ? raw.last_synced_at.trim() : null,
    workspace_snapshot:
      raw.workspace_snapshot && typeof raw.workspace_snapshot === 'object' && !Array.isArray(raw.workspace_snapshot)
        ? (raw.workspace_snapshot as NativeCompanionWorkspaceSyncState['workspace_snapshot'])
        : null
  };
}

function readWebSyncState() {
  if (typeof window === 'undefined') {
    return normalizeWorkspaceSyncState(null);
  }
  try {
    return normalizeWorkspaceSyncState(JSON.parse(window.localStorage.getItem(WEB_SYNC_STATE_KEY) ?? 'null'));
  } catch {
    return normalizeWorkspaceSyncState(null);
  }
}

function writeWebSyncState(state: NativeCompanionWorkspaceSyncState) {
  if (typeof window === 'undefined') {
    return state;
  }
  window.localStorage.setItem(WEB_SYNC_STATE_KEY, JSON.stringify(state));
  return state;
}

function normalizePersistedSyncState(args: {
  endpointUrl: string | null;
  lastSyncedAt: string | null;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  return {
    endpoint_url: args.endpointUrl,
    last_synced_at: args.lastSyncedAt,
    workspace_snapshot: args.workspaceSnapshot
  } satisfies NativeCompanionWorkspaceSyncState;
}

function normalizeEndpointUrl(endpointUrl: string) {
  return endpointUrl.trim().replace(/\/+$/, '');
}

function normalizeReadableArticlePayload(value: unknown): CompanionReadableArticle | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const article = (value as Record<string, unknown>).readable_article;
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    return null;
  }
  const raw = article as Record<string, unknown>;
  if (typeof raw.content !== 'string' || typeof raw.node_id !== 'string' || typeof raw.title !== 'string') {
    return null;
  }
  return {
    content: raw.content,
    hideTitleHeading: raw.hide_title_heading === true,
    nodeId: raw.node_id,
    textAnchorDecorations: [],
    title: raw.title
  };
}

function normalizeDirtyNodePayload(value: unknown): NativeCompanionDirtyNodePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      device_id: 'web-preview',
      last_synced_at: null,
      nodes: []
    };
  }
  const raw = value as Record<string, unknown>;
  return {
    device_id: typeof raw.device_id === 'string' && raw.device_id.trim() ? raw.device_id.trim() : 'web-preview',
    last_synced_at: typeof raw.last_synced_at === 'string' && raw.last_synced_at.trim() ? raw.last_synced_at.trim() : null,
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.filter((node): node is NativeCompanionDirtyNodePayload['nodes'][number] => {
          return Boolean(
            node &&
            typeof node === 'object' &&
            !Array.isArray(node) &&
            typeof (node as { device_id?: unknown }).device_id === 'string' &&
            typeof (node as { object_id?: unknown }).object_id === 'string' &&
            (node as { object_type?: unknown }).object_type === 'node' &&
            typeof (node as { updated_at?: unknown }).updated_at === 'string' &&
            (node as { snapshot?: unknown }).snapshot &&
            typeof (node as { snapshot: unknown }).snapshot === 'object' &&
            !Array.isArray((node as { snapshot: unknown }).snapshot)
          );
        })
      : []
  };
}

export async function loadCompanionWorkspaceSyncState() {
  if (!isNativeAndroidCompanionRuntime()) {
    return readWebSyncState();
  }
  return normalizeWorkspaceSyncState(await FolioleCompanionSync.loadWorkspaceSyncState());
}

export async function loadCompanionDirtyNodes() {
  if (!isNativeAndroidCompanionRuntime()) {
    const state = readWebSyncState();
    return {
      device_id: 'web-preview',
      last_synced_at: state.last_synced_at,
      nodes: []
    } satisfies NativeCompanionDirtyNodePayload;
  }
  return normalizeDirtyNodePayload(await FolioleCompanionSync.loadDirtyNodes());
}

export async function saveCompanionWorkspaceSyncEndpoint(endpointUrl: string) {
  const normalizedEndpointUrl = endpointUrl.trim() ? normalizeEndpointUrl(endpointUrl) : null;
  if (!isNativeAndroidCompanionRuntime()) {
    const current = readWebSyncState();
    return writeWebSyncState({
      ...current,
      endpoint_url: normalizedEndpointUrl
    });
  }
  return normalizeWorkspaceSyncState(
    await FolioleCompanionSync.saveWorkspaceSyncEndpoint({ endpoint_url: normalizedEndpointUrl })
  );
}

export async function loadCompanionReadableArticle(snapshot?: NativeCompanionWorkspaceSyncState['workspace_snapshot']) {
  if (!isNativeAndroidCompanionRuntime()) {
    return resolveReadableCompanionArticle(snapshot ?? readWebSyncState().workspace_snapshot);
  }
  return normalizeReadableArticlePayload(await FolioleCompanionSync.loadReadableArticle());
}

export async function loadCompanionWorkspaceVersion(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const response = await fetch(`${normalizedEndpointUrl}${WORKSPACE_VERSION_PATH}`);
  if (!response.ok) {
    throw new Error(`Desktop sync source returned ${response.status}.`);
  }
  return (await response.json()) as CompanionWorkspaceVersionPayload;
}

export async function pullCompanionWorkspaceSnapshot(endpointUrl: string) {
  const normalizedEndpointUrl = normalizeEndpointUrl(endpointUrl);
  const response = await fetch(`${normalizedEndpointUrl}${WORKSPACE_SNAPSHOT_PATH}`);
  if (!response.ok) {
    throw new Error(`Desktop sync source returned ${response.status}.`);
  }
  const payload = (await response.json()) as CompanionWorkspaceSnapshotPayload;
  const lastSyncedAt =
    typeof payload.exported_at === 'string' && payload.exported_at.trim() ? payload.exported_at : new Date().toISOString();
  const nextState: NativeCompanionWorkspaceSyncState = {
    endpoint_url: normalizedEndpointUrl,
    last_synced_at: lastSyncedAt,
    workspace_snapshot: payload.workspace_snapshot ?? null
  };

  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebSyncState(nextState);
  }

  return normalizeWorkspaceSyncState(
    await FolioleCompanionSync.replaceWorkspaceSnapshot({
      endpoint_url: normalizedEndpointUrl,
      last_synced_at: lastSyncedAt,
      workspace_snapshot_json: JSON.stringify(payload.workspace_snapshot ?? null)
    })
  );
}

export async function persistCompanionWorkspaceSnapshot(args: {
  changedNodeId?: string;
  endpointUrl: string | null;
  lastSyncedAt: string | null;
  workspaceSnapshot: NativeCompanionWorkspaceSyncState['workspace_snapshot'];
}) {
  const nextState = normalizePersistedSyncState(args);
  if (!isNativeAndroidCompanionRuntime()) {
    return writeWebSyncState(nextState);
  }

  const endpointUrl = args.endpointUrl?.trim() ? normalizeEndpointUrl(args.endpointUrl) : 'local://companion';
  const lastSyncedAt = args.lastSyncedAt?.trim() ? args.lastSyncedAt : new Date().toISOString();
  const changedNode =
    args.changedNodeId && args.workspaceSnapshot ? args.workspaceSnapshot.nodesById[args.changedNodeId] : null;
  if (args.changedNodeId && changedNode) {
    return normalizeWorkspaceSyncState(
      await FolioleCompanionSync.replaceWorkspaceNode({
        endpoint_url: endpointUrl,
        last_synced_at: lastSyncedAt,
        node_id: args.changedNodeId,
        node_snapshot_json: JSON.stringify(changedNode)
      })
    );
  }
  return normalizeWorkspaceSyncState(
    await FolioleCompanionSync.replaceWorkspaceSnapshot({
      endpoint_url: endpointUrl,
      last_synced_at: lastSyncedAt,
      workspace_snapshot_json: JSON.stringify(args.workspaceSnapshot ?? null)
    })
  );
}
