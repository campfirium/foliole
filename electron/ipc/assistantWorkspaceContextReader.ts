import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

type AssistantBodyStatus = NonNullable<NativeAssistantWorkspaceContext['document']>['bodyStatus'];
type AssistantAnchorContext = NonNullable<NativeAssistantWorkspaceContext['anchor']>;

export function readOptionalWorkspaceContext(value: unknown): NativeAssistantWorkspaceContext | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') throw new Error('invalid_workspace_context');
  const context = value as Record<string, unknown>;
  if (context.scope !== 'node' && context.scope !== 'workspace')
    throw new Error('invalid_workspace_context_scope');
  const next: NativeAssistantWorkspaceContext = {
    schemaVersion: 1,
    scope: context.scope
  };
  if (typeof context.activeNodeId === 'string') next.activeNodeId = context.activeNodeId.slice(0, 200);
  if (typeof context.activeParentNodeId === 'string') next.activeParentNodeId = context.activeParentNodeId.slice(0, 200);
  if (typeof context.activeKind === 'string') next.activeKind = context.activeKind.slice(0, 80);
  if (typeof context.activeSpecialKind === 'string') next.activeSpecialKind = context.activeSpecialKind.slice(0, 80);
  if (typeof context.activeTitle === 'string') next.activeTitle = context.activeTitle.slice(0, 300);
  if (context.anchor && typeof context.anchor === 'object')
    next.anchor = readWorkspaceAnchorContext(context.anchor);
  if (context.document && typeof context.document === 'object')
    next.document = readWorkspaceDocumentContext(context.document);
  if (context.folder && typeof context.folder === 'object')
    next.folder = readWorkspaceFolderContext(context.folder);
  if (Array.isArray(context.path))
    next.path = context.path.filter((item) => typeof item === 'string').slice(0, 12);
  if (context.selection && typeof context.selection === 'object')
    next.selection = readWorkspaceSelectionContext(context.selection);
  return next;
}

function readWorkspaceAnchorContext(value: object): AssistantAnchorContext {
  const anchor = value as Record<string, unknown>;
  if (typeof anchor.id !== 'string') throw new Error('invalid_workspace_anchor');
  const kind = readWorkspaceChildAnchorKind(anchor.kind);
  if (!kind) throw new Error('invalid_workspace_anchor');
  return {
    id: anchor.id.slice(0, 200),
    kind,
    ...(typeof anchor.page === 'number' ? { page: Math.max(1, anchor.page) } : {}),
    ...(typeof anchor.parentNodeId === 'string' ? { parentNodeId: anchor.parentNodeId.slice(0, 200) } : {}),
    ...(typeof anchor.parentTitle === 'string' ? { parentTitle: anchor.parentTitle.slice(0, 300) } : {}),
    ...(typeof anchor.text === 'string' ? { text: anchor.text.slice(0, 220) } : {})
  };
}

function readWorkspaceDocumentContext(value: object) {
  const document = value as Record<string, unknown>;
  const bodyStatus = readBodyStatus(document.bodyStatus);
  return {
    bodyStatus,
    ...(typeof document.charCount === 'number' ? { charCount: Math.max(0, document.charCount) } : {}),
    ...(typeof document.preview === 'string' ? { preview: document.preview.slice(0, 4000) } : {}),
    ...(typeof document.truncated === 'boolean' ? { truncated: document.truncated } : {})
  };
}

function readWorkspaceFolderContext(value: object) {
  const folder = value as Record<string, unknown>;
  return {
    childCount: typeof folder.childCount === 'number' ? Math.max(0, folder.childCount) : 0,
    children: Array.isArray(folder.children)
      ? folder.children.slice(0, 30).map(readWorkspaceChildSummary)
      : [],
    truncated: folder.truncated === true
  };
}

function readWorkspaceChildSummary(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('invalid_workspace_child_summary');
  const child = value as Record<string, unknown>;
  if (typeof child.nodeId !== 'string' || typeof child.title !== 'string' || typeof child.kind !== 'string')
    throw new Error('invalid_workspace_child_summary');
  const anchorKind = readWorkspaceChildAnchorKind(child.anchorKind);
  return {
    ...(anchorKind ? { anchorKind } : {}),
    ...(child.bodyStatus ? { bodyStatus: readBodyStatus(child.bodyStatus) } : {}),
    hasContent: child.hasContent === true,
    kind: child.kind.slice(0, 80),
    nodeId: child.nodeId.slice(0, 200),
    ...(typeof child.preview === 'string' ? { preview: child.preview.slice(0, 220) } : {}),
    ...(typeof child.specialKind === 'string' ? { specialKind: child.specialKind.slice(0, 80) } : {}),
    title: child.title.slice(0, 300),
    ...(typeof child.updatedAt === 'string' ? { updatedAt: child.updatedAt.slice(0, 80) } : {})
  };
}

function readWorkspaceChildAnchorKind(value: unknown): 'cloze' | 'highlight' | 'image-excerpt' | null {
  return value === 'cloze' || value === 'highlight' || value === 'image-excerpt' ? value : null;
}

function readWorkspaceSelectionContext(value: object) {
  const selection = value as Record<string, unknown>;
  return {
    charCount: typeof selection.charCount === 'number' ? Math.max(0, selection.charCount) : 0,
    ranges: Array.isArray(selection.ranges)
      ? selection.ranges.slice(0, 5).map(readWorkspaceSelectionRange)
      : [],
    text: typeof selection.text === 'string' ? selection.text.slice(0, 1200) : '',
    truncated: selection.truncated === true
  };
}

function readWorkspaceSelectionRange(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('invalid_workspace_selection_range');
  const range = value as Record<string, unknown>;
  return {
    from: typeof range.from === 'number' ? Math.max(0, range.from) : 0,
    to: typeof range.to === 'number' ? Math.max(0, range.to) : 0
  };
}

function readBodyStatus(value: unknown): AssistantBodyStatus {
  if (value === 'empty' || value === 'failed' || value === 'fetching' || value === 'missing' || value === 'ready')
    return value;
  throw new Error('invalid_workspace_body_status');
}
