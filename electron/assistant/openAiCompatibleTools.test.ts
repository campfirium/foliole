// @vitest-environment node

import { expect, it } from 'vitest';

import { AIDE_TOOL_REGISTRY } from './aideToolRegistry.js';
import { createChatCompletionsAideTools } from './openAiCompatibleTools.js';

it('omits strict-object hints from wire schemas while preserving local validation', () => {
  const [tool] = createChatCompletionsAideTools(['materials.read']);

  expect(tool?.function.parameters).toEqual({
    properties: { id: { minLength: 1, type: 'string' } },
    required: ['id'],
    type: 'object'
  });
  expect(AIDE_TOOL_REGISTRY.read_material?.inputSchema).toMatchObject({
    additionalProperties: false
  });
});
