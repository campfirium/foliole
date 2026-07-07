import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';

export type JsonRpcRecord = Record<string, unknown>;

export interface JsonRpcMessage {
  error?: { code?: number; message?: string };
  id?: number;
  method?: string;
  params?: JsonRpcRecord;
  result?: JsonRpcRecord;
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

export function mapJsonRpcError(error: {
  code?: number;
  message?: string;
}): NativeAssistantFailureCategory {
  if (error.code === -32001 || error.message?.toLowerCase().includes('overloaded'))
    return 'overloaded';
  if (error.message?.toLowerCase().includes('auth')) return 'auth_failed';
  return 'protocol_error';
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
    ...(context.activeTitle ? [`- Active title: ${context.activeTitle}.`] : []),
    ...(context.path?.length ? [`- Active path: ${context.path.join(' / ')}.`] : []),
    '- Do not answer location questions from the process working directory unless the user explicitly asks about the development repository.',
    '',
    'User message:',
    message
  ];
  return lines.join('\n');
}
