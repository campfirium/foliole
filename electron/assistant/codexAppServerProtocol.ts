import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';

import { formatCodexMaterialProjection } from './assistantMaterialProjection.js';
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

export function createInitializeMessage(appVersion: string, id = 0): JsonRpcMessage {
  return {
    id,
    method: 'initialize',
    params: {
      capabilities: { experimentalApi: true },
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
    ...formatCodexMaterialProjection(context),
    ...formatAgentControlContext(context),
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
