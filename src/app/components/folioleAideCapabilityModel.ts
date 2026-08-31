import type {
  NativeAssistantFailureCategory,
  NativeAssistantStatusResult
} from '../../../lib/platform/nativeAssistantContract';

export type FolioleAideCapabilityState =
  'checking' | 'notEnabled' | 'ready' | 'unavailable' | 'needsCheck';
export type FolioleAideCapabilityUnavailableReason =
  | 'missingThreadIndex'
  | 'missingSendMessage'
  | 'statusFailed'
  | NativeAssistantFailureCategory;
export type FolioleAideDiagnosticState =
  | 'authFailed'
  | 'busy'
  | 'launchFailed'
  | 'notConfigured'
  | 'ready'
  | 'unavailable'
  | 'unknown';
export type FolioleAideToolsDiagnosticState = 'failed' | 'running' | 'stopped' | 'unknown';

export interface FolioleAideCapabilityDiagnostic {
  codex: FolioleAideDiagnosticState;
  tools: FolioleAideToolsDiagnosticState;
}

export function isAssistantReady(status: NativeAssistantStatusResult | null | undefined) {
  return Boolean(
    status?.state === 'ready' &&
      status.capabilities.some((capability) => capability.name === 'sendMessage' && capability.enabled) &&
      status.capabilities.some((capability) => capability.name === 'threadIndex' && capability.enabled) &&
      status.capabilities.some((capability) => capability.name === 'agentControl' && capability.enabled) &&
      status.agentControl?.state === 'running'
  );
}

export function readUnavailableReason(
  status: NativeAssistantStatusResult | null | undefined
): FolioleAideCapabilityUnavailableReason {
  if (!status) return 'statusFailed';
  if (status.failure?.category) return status.failure.category;
  if (status.agentControl?.state !== 'running') return 'agent_control_unavailable';
  if (!status.capabilities.some((capability) => capability.name === 'agentControl' && capability.enabled)) {
    return 'agent_control_unavailable';
  }
  if (!status.capabilities.some((capability) => capability.name === 'sendMessage' && capability.enabled)) {
    return 'missingSendMessage';
  }
  if (!status.capabilities.some((capability) => capability.name === 'threadIndex' && capability.enabled)) {
    return 'missingThreadIndex';
  }
  return status.state === 'busy' ? 'busy' : 'statusFailed';
}

export function readDiagnostic(
  status: NativeAssistantStatusResult | null | undefined
): FolioleAideCapabilityDiagnostic {
  return { codex: readCodexDiagnostic(status), tools: readToolsDiagnostic(status) };
}

export function isCapabilityFailureCategory(category: NativeAssistantFailureCategory) {
  return category === 'agent_control_unavailable' ||
    category === 'auth_failed' ||
    category === 'not_configured';
}

export function createFailureDiagnostic(
  category: NativeAssistantFailureCategory,
  current: FolioleAideCapabilityDiagnostic | null
): FolioleAideCapabilityDiagnostic {
  return {
    codex: readFailureCodexDiagnostic(category),
    tools: category === 'agent_control_unavailable' ? 'stopped' : current?.tools ?? 'unknown'
  };
}

function readCodexDiagnostic(
  status: NativeAssistantStatusResult | null | undefined
): FolioleAideDiagnosticState {
  if (!status) return 'unknown';
  if (isAssistantReady(status)) return 'ready';
  if (status.failure?.category === 'auth_failed') return 'authFailed';
  if (status.failure?.category === 'not_configured') return 'notConfigured';
  if (status.failure?.category === 'launch_failed') return 'launchFailed';
  if (status.failure?.category === 'busy' || status.state === 'busy') return 'busy';
  return 'unavailable';
}

function readToolsDiagnostic(
  status: NativeAssistantStatusResult | null | undefined
): FolioleAideToolsDiagnosticState {
  if (!status?.agentControl) return 'unknown';
  if (status.agentControl.state === 'running') return 'running';
  if (status.agentControl.state === 'failed') return 'failed';
  return 'stopped';
}

function readFailureCodexDiagnostic(category: NativeAssistantFailureCategory): FolioleAideDiagnosticState {
  if (category === 'auth_failed') return 'authFailed';
  if (category === 'busy' || category === 'overloaded' || category === 'timeout') return 'busy';
  if (category === 'launch_failed') return 'launchFailed';
  if (category === 'not_configured') return 'notConfigured';
  return 'unavailable';
}
