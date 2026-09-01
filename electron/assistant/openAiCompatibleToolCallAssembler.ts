import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

export interface OpenAiCompatibleToolCall {
  argumentsText: string;
  extensionFields: Record<string, unknown>;
  functionExtensionFields: Record<string, unknown>;
  id: string;
  name: string;
}

interface PendingToolCall extends OpenAiCompatibleToolCall {
  type: string;
}

type IndexMode = 'explicit' | 'positional' | null;

export function createOpenAiCompatibleToolCallAssembler() {
  const calls: PendingToolCall[] = [];
  let indexMode: IndexMode = null;
  return {
    append(value: unknown) {
      const parsed = parseFragments(value, indexMode);
      indexMode = parsed.indexMode;
      appendFragments(calls, parsed.fragments);
    },
    finalize: () => finalizeCalls(calls)
  };
}

function parseFragments(value: unknown, currentMode: IndexMode) {
  if (value === undefined || value === null) return { fragments: [], indexMode: currentMode };
  if (!Array.isArray(value)) throw categorized('protocol_error');
  const modes = value.map((fragment) => isRecord(fragment) && fragment.index === undefined
    ? 'positional' as const
    : 'explicit' as const);
  if (new Set(modes).size > 1) throw categorized('protocol_error');
  const frameMode = modes[0] ?? currentMode;
  if (currentMode && frameMode && currentMode !== frameMode) throw categorized('protocol_error');
  const indexMode = frameMode ?? currentMode;
  const fragments = value.map((fragment, position) => parseFragment(fragment, position, indexMode));
  return { fragments, indexMode };
}

function parseFragment(value: unknown, position: number, indexMode: IndexMode) {
  if (!isRecord(value)) throw categorized('protocol_error');
  const fn = value.function;
  if (fn !== undefined && !isRecord(fn)) throw categorized('protocol_error');
  return {
    argumentsText: readOptionalString(fn?.arguments),
    extensionFields: readExtensionFields(value, ['function', 'id', 'index', 'type']),
    functionExtensionFields: fn ? readExtensionFields(fn, ['arguments', 'name']) : {},
    id: readOptionalString(value.id),
    index: indexMode === 'positional' ? position : readIndex(value.index),
    name: readOptionalString(fn?.name),
    type: readOptionalString(value.type)
  };
}

function appendFragments(calls: PendingToolCall[], fragments: ReturnType<typeof parseFragment>[]) {
  for (const fragment of fragments) {
    const call = calls[fragment.index] ?? {
      argumentsText: '', extensionFields: {}, functionExtensionFields: {}, id: '', name: '', type: ''
    };
    call.argumentsText += fragment.argumentsText;
    mergeExtensionFields(call.extensionFields, fragment.extensionFields);
    mergeExtensionFields(call.functionExtensionFields, fragment.functionExtensionFields);
    call.id = mergeStableField(call.id, fragment.id);
    call.name = mergeStableField(call.name, fragment.name);
    call.type = mergeStableField(call.type, fragment.type);
    calls[fragment.index] = call;
  }
}

function finalizeCalls(calls: PendingToolCall[]): OpenAiCompatibleToolCall[] {
  return Array.from({ length: calls.length }, (_, index) => {
    const call = calls[index];
    if (!call || !call.id || !call.name || call.type !== 'function') throw categorized('protocol_error');
    return {
      argumentsText: call.argumentsText,
      extensionFields: call.extensionFields,
      functionExtensionFields: call.functionExtensionFields,
      id: call.id,
      name: call.name
    };
  });
}

function readExtensionFields(value: Record<string, unknown>, coreFields: string[]) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !coreFields.includes(key)));
}

function mergeExtensionFields(target: Record<string, unknown>, fragment: Record<string, unknown>) {
  for (const [key, value] of Object.entries(fragment)) {
    if (!Object.hasOwn(target, key)) {
      Object.defineProperty(target, key, { configurable: true, enumerable: true, value, writable: true });
    } else if (JSON.stringify(target[key]) !== JSON.stringify(value)) throw categorized('protocol_error');
  }
}

function mergeStableField(current: string, fragment: string) {
  if (!fragment) return current;
  if (!current || current === fragment) return fragment;
  throw categorized('protocol_error');
}

function readOptionalString(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw categorized('protocol_error');
  return value;
}

function readIndex(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0) throw categorized('protocol_error');
  return Number(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function categorized(category: NativeAssistantFailureCategory) {
  return Object.assign(new Error(category), { category });
}
