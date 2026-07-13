import type {
  NativeAssistantFailureCategory,
  NativeAssistantSendMessageResult,
  NativeAssistantStatusResult
} from '../../lib/platform/nativeAssistantContract.js';

export function createAssistantStatus(
  state: NativeAssistantStatusResult['state'],
  category?: NativeAssistantFailureCategory
) {
  return {
    capabilities: [
      { enabled: state === 'ready', name: 'sendMessage' as const },
      { enabled: true, name: 'status' as const },
      { enabled: state === 'ready', name: 'threadIndex' as const }
    ],
    ...(category ? { failure: { category } } : {}),
    provider: 'codex-app-server' as const,
    state
  } satisfies NativeAssistantStatusResult;
}

export function createAssistantFailure(
  state: NativeAssistantSendMessageResult['state'],
  category: NativeAssistantFailureCategory
) {
  return {
    failure: { category },
    provider: 'codex-app-server' as const,
    state
  } satisfies NativeAssistantSendMessageResult;
}

export function sanitizeCodexLauncherEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || isBlockedCodexEnvironmentKey(key)) continue;
    next[key] = value;
  }
  return next;
}

export function normalizeOptionalThreadId(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) throw new Error('invalid_provider_thread_id');
  return normalized;
}

export function failureFromError(error: unknown): NativeAssistantFailureCategory {
  if (error && typeof error === 'object' && 'category' in error) {
    const category = error.category;
    if (typeof category === 'string') return category as NativeAssistantFailureCategory;
  }
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
    ? 'not_configured'
    : 'internal_error';
}

export function categorizedError(category: NativeAssistantFailureCategory) {
  const error = new Error(category) as Error & { category?: NativeAssistantFailureCategory };
  error.category = category;
  return error;
}

function isBlockedCodexEnvironmentKey(key: string) {
  const normalized = key.toUpperCase();
  return normalized.startsWith('CODEX_') && normalized !== 'CODEX_HOME';
}
