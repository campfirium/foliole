import { normalizeReadwiseApiDocumentImportState } from '../readwise/readwiseApiImportState.js';
import { normalizeRemoteAnnotationBindings } from '../readwise/readwiseRemoteIdentity.js';

export type PrivateStateIdentity = Readonly<{
  formFactor: string;
  host: string;
  key: string;
  platform: string;
  scope: string;
}>;

export type WatchedFolderSharedState = Readonly<{
  actionMode: string;
  bindingId: string;
  connectionStatus: string;
  highlightMode: string;
  host: string;
  hostPlatform: string;
  ownerDeviceId: string;
  sourceRef: string;
}>;

export type ImportSourceProjectionInput = Readonly<{
  lastContentFingerprint: string;
  latestNodeId: string | null;
  provider: string;
  remoteAnnotationsJson: string;
  remoteConnectionRef: string | null;
  remoteDocumentId: string | null;
  remoteImportStateJson: string;
  remoteProvider: string | null;
  sourceFingerprint: string;
  sourceKind: string;
  sourceLocation: string | null;
  sourceLocator: string;
  sourceName: string;
  sourceRef: string | null;
  watchedBindingId: string | null;
  watchedRelativePath: string | null;
}>;

export function privateStateIdentity(value: PrivateStateIdentity) {
  return {
    form_factor: value.formFactor,
    host: value.host,
    key: value.key,
    platform: value.platform,
    scope: value.scope
  };
}

export function watchedFolderSharedState(value: WatchedFolderSharedState) {
  return {
    action_mode: value.actionMode,
    binding_id: value.bindingId,
    connection_status: value.connectionStatus,
    highlight_mode: value.highlightMode,
    host: value.host,
    host_platform: value.hostPlatform,
    owner_device_id: value.ownerDeviceId,
    source_ref: stableLocator(value.sourceRef)
  };
}

export function importSourceSharedState(value: ImportSourceProjectionInput) {
  const base = {
    last_content_fingerprint: value.lastContentFingerprint,
    latest_node_id: value.latestNodeId,
    provider: value.provider,
    source_fingerprint: value.sourceFingerprint,
    source_kind: value.sourceKind,
    source_name: value.sourceName
  };
  if (value.remoteProvider === 'readwise') {
    return {
      ...base,
      remote_annotations: normalizeRemoteAnnotationBindings(parseJson(value.remoteAnnotationsJson)),
      remote_connection_ref: value.remoteConnectionRef,
      remote_document_id: value.remoteDocumentId,
      remote_import_state: readwiseSharedState(value.remoteImportStateJson),
      remote_provider: value.remoteProvider
    };
  }
  return {
    ...base,
    source_location: stableLocator(value.sourceLocation ?? ''),
    source_locator: stableLocator(value.sourceLocator),
    source_ref: value.sourceRef === null ? null : stableLocator(value.sourceRef),
    watched_binding_id: value.watchedBindingId,
    watched_relative_path: value.watchedRelativePath === null
      ? null
      : stableRelativePath(value.watchedRelativePath)
  };
}

function readwiseSharedState(value: string) {
  const state = normalizeReadwiseApiDocumentImportState(parseJson(value));
  return {
    annotations: state.annotations.map((annotation) => ({
      contentHash: annotation.contentHash,
      kind: annotation.kind,
      nodeId: annotation.nodeId,
      parentRemoteId: annotation.parentRemoteId,
      remoteId: annotation.remoteId,
      remoteStatus: annotation.remoteStatus
    })),
    bodyAuthority: state.bodyAuthority,
    bodyState: state.bodyState,
    epubProjection: state.epubProjection ?? null,
    originalFile: state.originalFile,
    remoteLifecycle: state.remoteLifecycle ? {
      export: state.remoteLifecycle.export,
      reader: state.remoteLifecycle.reader,
      scope: state.remoteLifecycle.scope
    } : null,
    version: state.version
  };
}

function stableLocator(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    return ['external:', 'http:', 'https:', 'readwise:', 'urn:', 'watched:'].includes(parsed.protocol)
      ? parsed.toString()
      : '';
  } catch {
    return trimmed.includes(':') || trimmed.includes('\\') ? '' : stableRelativePath(trimmed);
  }
}

function stableRelativePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('\\') ||
      trimmed.includes('\\') || /^[A-Za-z]:/.test(trimmed)) return '';
  const segments = trimmed.split('/');
  return segments.some((segment) => !segment || segment === '.' || segment === '..') ? '' : trimmed;
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}
