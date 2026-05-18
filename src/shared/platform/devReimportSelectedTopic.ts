import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import { getRuntimeInvoke, type RuntimeInvoke } from './runtimeInvoke';

export type DevReimportSelectedTopicResult =
  | { status: 'reimported'; nodeId: string | null }
  | { status: 'unavailable'; detail: string }
  | { status: 'failed'; detail: string };

interface DevReimportSelectedTopicInput {
  nodeId: string;
  runtimeInvoke: RuntimeInvoke | null;
}

export async function runDevReimportSelectedTopic(input: DevReimportSelectedTopicInput): Promise<DevReimportSelectedTopicResult> {
  if (!input.runtimeInvoke) {
    return { status: 'unavailable', detail: 'Desktop runtime is unavailable.' };
  }
  try {
    const result = await input.runtimeInvoke(NATIVE_COMMANDS.devReimportCurrentTopicSource, {
      node_id: input.nodeId
    });
    if (!result || result.status !== 'reimported') {
      return { status: result?.status ?? 'failed', detail: result?.detail ?? 'Re-import failed.' };
    }
    return { status: 'reimported', nodeId: result.node_id };
  } catch (error) {
    return { status: 'failed', detail: error instanceof Error ? error.message : 'Re-import failed.' };
  }
}

export async function devReimportSelectedTopic(args: { nodeId: string }) {
  return runDevReimportSelectedTopic({
    nodeId: args.nodeId,
    runtimeInvoke: getRuntimeInvoke()
  });
}
