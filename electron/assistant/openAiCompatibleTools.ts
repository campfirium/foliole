import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';

export function createChatCompletionsAideTools(capabilities: readonly string[] = []) {
  const enabled = new Set(capabilities);
  return Object.entries(AIDE_TOOL_REGISTRY)
    .filter(([, definition]) => enabled.has(definition.capability))
    .map(([name, definition]) => ({
      function: {
        description: definition.description,
        name,
        parameters: definition.inputSchema
      },
      type: 'function' as const
    }));
}
