import type {
  NativeAssistantFailure,
  NativeAssistantFailureCategory
} from '../../lib/platform/nativeAssistantContract.js';
import { appendMainProcessDiagnosticLog } from '../diagnostics/mainProcessDiagnostics.js';

import { formatOpenAiCompatibleToolCall, readOpenAiCompatibleSse } from './openAiCompatibleSse.js';

const PROBE_NAME = 'foliole_aide_tool_contract_probe';

export async function probeOpenAiCompatibleModelTools(input: {
  apiKey: string;
  endpoint: string;
  model: string;
  signal: AbortSignal;
}): Promise<NativeAssistantFailure | null> {
  if (input.signal.aborted) return { category: 'timeout' };
  let phase = 'first_request';
  try {
    const first = await sendProbe(input, [{
      content: `Call ${PROBE_NAME} with supported set to true. Do not answer with text.`,
      role: 'user'
    }]);
    phase = 'first_contract';
    const call = first.toolCalls[0];
    if (first.toolCalls.length !== 1
      || call?.name !== PROBE_NAME
      || !isSupportedProbeArguments(call.argumentsText)) {
      logProbeFailure(phase, {
        arguments_supported_true: call ? isSupportedProbeArguments(call.argumentsText) : false,
        expected_name: call?.name === PROBE_NAME,
        finish_reason: first.finishReason,
        tool_call_count: first.toolCalls.length
      });
      return { category: 'model_tools_unsupported' };
    }
    phase = 'second_request';
    const second = await sendProbe(input, [
      { content: 'Call the required probe tool.', role: 'user' },
      {
        content: null,
        role: 'assistant',
        tool_calls: [formatOpenAiCompatibleToolCall(call)]
      },
      {
        content: '{"supported":true}',
        name: call.name,
        role: 'tool',
        tool_call_id: call.id
      }
    ]);
    phase = 'second_contract';
    if (second.toolCalls.length === 0 && Boolean(second.text.trim())) return null;
    logProbeFailure(phase, {
      finish_reason: second.finishReason,
      has_text: Boolean(second.text.trim()),
      tool_call_count: second.toolCalls.length
    });
    return { category: 'model_tools_unsupported' };
  } catch (error) {
    const category = readProbeFailure(error);
    const details = readProbeDetails(error);
    logProbeFailure(phase, { category, ...details });
    const message = typeof details.provider_message === 'string'
      ? details.provider_message
      : undefined;
    return { category, ...(message === undefined ? {} : { message }) };
  }
}

function logProbeFailure(phase: string, details: Record<string, unknown>) {
  appendMainProcessDiagnosticLog('assistant_model_tool_probe_failed', { phase, ...details });
}

function isSupportedProbeArguments(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && (parsed as Record<string, unknown>).supported === true);
  } catch {
    return false;
  }
}

async function sendProbe(
  input: Parameters<typeof probeOpenAiCompatibleModelTools>[0],
  messages: unknown[],
  toolChoice: unknown = 'auto'
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(input.endpoint, {
      body: JSON.stringify({
        messages,
        model: input.model,
        stream: true,
        tool_choice: toolChoice,
        tools: [{
          function: {
            description: 'Confirm a complete function-tool round trip.',
            name: PROBE_NAME,
            parameters: {
              properties: { supported: { type: 'boolean' } },
              required: ['supported'],
              type: 'object'
            }
          },
          type: 'function'
        }]
      }),
      headers: requestHeaders(input.apiKey),
      method: 'POST',
      redirect: 'error',
      signal: controller.signal
    });
    const body = await assertProbeResponse(response);
    return await readOpenAiCompatibleSse(body, controller, () => undefined);
  } finally {
    input.signal.removeEventListener('abort', abort);
  }
}

async function assertProbeResponse(response: Response): Promise<ReadableStream<Uint8Array>> {
  if (!response.ok) {
    const details = await readHttpFailureDetails(response);
    throw categorized(responseCategory(response.status, details), details);
  }
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
    throw categorized('model_tools_unsupported', {
      content_type: response.headers.get('content-type'),
      http_status: response.status,
      reason: 'non_sse_response'
    });
  }
  return response.body;
}

async function readHttpFailureDetails(response: Response) {
  const details: Record<string, unknown> = {
    content_type: response.headers.get('content-type'),
    http_status: response.status,
    reason: 'http_error'
  };
  try {
    const decoded = await response.clone().json() as unknown;
    const payload = (Array.isArray(decoded) ? decoded[0] : decoded) as {
      error?: { code?: unknown; message?: unknown; status?: unknown };
    };
    if (typeof payload.error?.code === 'number') details.provider_code = payload.error.code;
    if (typeof payload.error?.status === 'string') details.provider_status = payload.error.status;
    if (typeof payload.error?.message === 'string') details.provider_message = payload.error.message;
  } catch {
    // Status and content type still distinguish transport failures without retaining response bodies.
  }
  return details;
}

function requestHeaders(apiKey: string) {
  return {
    accept: 'text/event-stream',
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json'
  };
}

function responseCategory(
  status: number,
  details: Record<string, unknown> = {}
): NativeAssistantFailureCategory {
  if (status === 401 || status === 403) return 'auth_failed';
  if (status === 429 || (status >= 502 && status <= 504)) return 'overloaded';
  if (isUnsupportedProviderRegion(details.provider_message)) return 'provider_region_unsupported';
  return 'model_tools_unsupported';
}

function isUnsupportedProviderRegion(message: unknown) {
  return typeof message === 'string'
    && /(location|region).*(not supported|unsupported)|unsupported.*(location|region)/iu.test(message);
}

function readProbeFailure(error: unknown): NativeAssistantFailureCategory {
  if (error && typeof error === 'object' && 'category' in error) {
    const category = (error as { category: NativeAssistantFailureCategory }).category;
    return category === 'protocol_error' ? 'model_tools_unsupported' : category;
  }
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'timeout';
  return 'model_tools_unsupported';
}

function readProbeDetails(error: unknown) {
  if (!error || typeof error !== 'object' || !('probeDetails' in error)) return {};
  const details = (error as { probeDetails?: unknown }).probeDetails;
  return details && typeof details === 'object' && !Array.isArray(details)
    ? details as Record<string, unknown>
    : {};
}

function categorized(category: NativeAssistantFailureCategory, details: Record<string, unknown> = {}) {
  return Object.assign(new Error(category), { category, probeDetails: details });
}
