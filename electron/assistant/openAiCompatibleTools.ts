import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';

export function createChatCompletionsAideTools(capabilities: readonly string[] = []) {
  const enabled = new Set(capabilities);
  return Object.entries(AIDE_TOOL_REGISTRY)
    .filter(([, definition]) => enabled.has(definition.capability))
    .map(([name, definition]) => ({
      function: {
        description: definition.description,
        name,
        parameters: compatibleToolSchema(definition.inputSchema)
      },
      type: 'function' as const
    }));
}

function compatibleToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compatibleToolSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => key !== 'additionalProperties' || entry !== false)
    .map(([key, entry]) => [key, compatibleToolSchema(entry)]));
}
