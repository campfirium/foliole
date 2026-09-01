import type { NativeAssistantFailureCategory } from '../../lib/platform/nativeAssistantContract.js';

import { probeOpenAiCompatibleModelTools } from './openAiCompatibleModelToolProbe.js';

const TEST_TIMEOUT_MS = 20_000;

export async function testOpenAiCompatibleModel(input: {
  apiKey: string;
  endpoint: string;
  model: string;
}): Promise<NativeAssistantFailureCategory | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    return await probeOpenAiCompatibleModelTools({ ...input, signal: controller.signal });
  } catch (error) {
    return error && typeof error === 'object' && 'name' in error && error.name === 'AbortError'
      ? 'timeout'
      : 'protocol_error';
  } finally {
    clearTimeout(timer);
  }
}
