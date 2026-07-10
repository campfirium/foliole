import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';

import { formatAgentControlContext } from './codexAppServerAgentControlPrompt.js';

export type JsonRpcRecord = Record<string, unknown>;

export interface JsonRpcMessage {
  error?: JsonRpcError;
  id?: number | string;
  method?: string;
  params?: JsonRpcRecord;
  result?: JsonRpcRecord;
}

export interface JsonRpcError extends JsonRpcRecord {
  code?: number;
  message?: string;
}

export const CODEX_APP_SERVER_PROVIDER = 'codex-app-server' as const;

export function createInitializeMessage(appVersion: string): JsonRpcMessage {
  return {
    id: 0,
    method: 'initialize',
    params: {
      clientInfo: { name: 'foliole_desktop', title: 'Foliole Desktop', version: appVersion }
    }
  };
}

export function parseMessage(line: string): { message: JsonRpcMessage; ok: true } | { ok: false } {
  try {
    const message = JSON.parse(line) as JsonRpcMessage;
    return message && typeof message === 'object' ? { message, ok: true } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function readNestedString(source: unknown, path: string[]) {
  let value = source;
  for (const key of path)
    value = typeof value === 'object' && value ? (value as JsonRpcRecord)[key] : undefined;
  return typeof value === 'string' ? value : null;
}

export function readDeltaText(params: JsonRpcRecord | undefined) {
  return typeof params?.delta === 'string'
    ? params.delta
    : typeof params?.text === 'string'
      ? params.text
      : '';
}

export function mapJsonRpcError(error: JsonRpcError): NativeAssistantFailureCategory {
  const text = readAppServerErrorText(error);
  if (readNestedNumber(error, ['codexErrorInfo', 'responseStreamDisconnected', 'httpStatusCode']) === 401)
    return 'auth_failed';
  if (text.includes('401 unauthorized') || text.includes('missing bearer') || text.includes('unauthorized'))
    return 'auth_failed';
  if (error.code === -32001 || text.includes('overloaded'))
    return 'overloaded';
  if (text.includes('auth')) return 'auth_failed';
  return 'protocol_error';
}

export function mapAppServerEventError(params: JsonRpcRecord | undefined) {
  const text = readAppServerErrorText(params);
  if (text.includes('401 unauthorized') || text.includes('missing bearer')) return 'auth_failed';
  if (text.includes('overloaded')) return 'overloaded';
  return null;
}

function readAppServerErrorText(value: JsonRpcRecord | undefined) {
  if (!value) return '';
  return [
    readNestedString(value, ['message']),
    readNestedString(value, ['error', 'message']),
    typeof value.additionalDetails === 'string' ? value.additionalDetails : null
  ].filter(Boolean).join('\n').toLowerCase();
}

function readNestedNumber(source: unknown, path: string[]) {
  let value = source;
  for (const key of path)
    value = typeof value === 'object' && value ? (value as JsonRpcRecord)[key] : undefined;
  return typeof value === 'number' ? value : null;
}

export function sendFailure(
  state: NativeAssistantSendMessageResult['state'],
  category: NativeAssistantFailureCategory
) {
  return {
    failure: { category },
    provider: CODEX_APP_SERVER_PROVIDER,
    state
  } satisfies NativeAssistantSendMessageResult;
}

export function composeAssistantTurnInput(
  message: string,
  context?: NativeAssistantWorkspaceContext
) {
  if (!context) return message;
  const lines = [
    'Foliole Assistant context:',
    `- Current product surface: Foliole Desktop workspace Assistant panel.`,
    `- Current Foliole scope: ${context.scope}.`,
    ...(context.schemaVersion ? [`- Context packet version: ${context.schemaVersion}.`] : []),
    ...(context.activeKind ? [`- Active Foliole object type: ${context.activeKind}.`] : []),
    ...(context.activeSpecialKind ? [`- Active Foliole special entry: ${context.activeSpecialKind}.`] : []),
    ...(context.activeNodeId ? [`- Active Foliole material id: ${context.activeNodeId}.`] : []),
    ...(context.activeParentNodeId ? [`- Active Foliole parent material id: ${context.activeParentNodeId}.`] : []),
    ...(context.activeTitle ? [`- Active title: ${context.activeTitle}.`] : []),
    ...(context.path?.length ? [`- Active path: ${context.path.join(' / ')}.`] : []),
    ...formatWorkspaceScopeGuidance(context),
    ...formatAnchorContext(context),
    ...formatAgentControlContext(context),
    ...formatDocumentContext(context),
    ...formatSelectionContext(context),
    ...formatFolderContext(context),
    ...formatParentFolderContext(context),
    '- Do not answer location questions from the process working directory unless the user explicitly asks about the development repository.',
    '- When the user asks what you know, can see, or have as context, summarize the concrete fields in this context packet and the available Foliole actions instead of giving only the path.',
    '- Foliole Aide history is a local global thread index; it is not split by the currently opened folder or topic.',
    '- Removing a thread from Foliole Aide history only removes the local Foliole history entry; do not claim it deletes the Codex conversation unless a separate Codex-side deletion is explicitly available and requested.',
    '- Answer from the Foliole facts included above and from explicit Foliole action results you obtain during this turn.',
    '- When needed content, Folders, or search results were not included, use the available Foliole actions; otherwise say they were not provided.',
    '',
    'User message:',
    message
  ];
  return lines.join('\n');
}

function formatWorkspaceScopeGuidance(context: NativeAssistantWorkspaceContext) {
  const lines = [
    '- Treat this packet as the current Foliole working context, not as the development repository context.'
  ];
  if (context.scope === 'node') {
    lines.push('- By default, answer as if the user is asking about the active Foliole topic or folder unless they name a broader scope.');
  } else {
    lines.push('- By default, answer as if the user is asking about the Foliole workspace as a whole.');
  }
  if (context.selection) {
    lines.push('- If a selection is present, treat it as the most specific focus for explain, rewrite, summarize, or edit-style questions.');
  }
  if (context.folder) {
    if (context.scope === 'workspace') {
      lines.push('- The included direct topics and folders are workspace-level top-level Foliole materials.');
    }
    lines.push('- For Folder questions, use the included direct Topics and Folders first; when the list is truncated or details are needed, use the available Foliole actions.');
  }
  if (context.parentFolder) {
    lines.push('- The included parent-folder entries are the active material directory siblings; use them for nearby-material questions before broad search.');
  }
  if (context.document?.preview) {
    lines.push('- The included document preview is authoritative for the visible active topic, but it may be truncated.');
  }
  return lines;
}

function formatAnchorContext(context: NativeAssistantWorkspaceContext) {
  if (!context.anchor) return [];
  const lines = [
    `- Active Foliole anchor: ${context.anchor.kind}, id=${context.anchor.id}.`
  ];
  if (context.anchor.parentNodeId) {
    lines.push(`- Anchor parent material id: ${context.anchor.parentNodeId}.`);
  }
  if (context.anchor.parentTitle) lines.push(`- Anchor parent title: ${context.anchor.parentTitle}.`);
  if (context.anchor.page) lines.push(`- Anchor page: ${context.anchor.page}.`);
  if (context.anchor.text) lines.push('- Anchor text:', context.anchor.text);
  return lines;
}

function formatDocumentContext(context: NativeAssistantWorkspaceContext) {
  if (!context.document) return [];
  const lines = [
    `- Active Foliole document body status: ${context.document.bodyStatus}${typeof context.document.charCount === 'number' ? `, ${context.document.charCount} chars` : ''}.`
  ];
  if (context.document.preview) {
    lines.push(
      `- Active Foliole document body preview${context.document.truncated ? ' (truncated)' : ''}:`,
      context.document.preview
    );
  }
  return lines;
}

function formatSelectionContext(context: NativeAssistantWorkspaceContext) {
  if (!context.selection) return [];
  return [
    `- Current editor selection${context.selection.truncated ? ' (truncated)' : ''}, ${context.selection.charCount} chars:`,
    context.selection.text
  ];
}

function formatFolderContext(context: NativeAssistantWorkspaceContext) {
  if (!context.folder) return [];
  const lines = [
    `- Direct Foliole children: ${context.folder.children.length} of ${context.folder.childCount}${context.folder.truncated ? ' shown' : ''}.`
  ];
  for (const child of context.folder.children) {
    const meta = [child.kind, `id=${child.nodeId}`];
    if (child.specialKind) meta.push(`special=${child.specialKind}`);
    if (child.anchorKind) meta.push(`anchor=${child.anchorKind}`);
    lines.push(`  - ${child.title} [${meta.join(', ')}]${child.preview ? `: ${child.preview}` : ''}`);
  }
  return lines;
}

function formatParentFolderContext(context: NativeAssistantWorkspaceContext) {
  if (!context.parentFolder) return [];
  const lines = [
    `- Parent Foliole folder entries: ${context.parentFolder.children.length} of ${context.parentFolder.childCount}${context.parentFolder.truncated ? ' shown' : ''}.`
  ];
  for (const child of context.parentFolder.children) {
    const meta = [child.kind, `id=${child.nodeId}`];
    if (child.isActive) meta.push('active');
    if (child.specialKind) meta.push(`special=${child.specialKind}`);
    if (child.anchorKind) meta.push(`anchor=${child.anchorKind}`);
    lines.push(`  - ${child.title} [${meta.join(', ')}]${child.preview ? `: ${child.preview}` : ''}`);
  }
  return lines;
}
