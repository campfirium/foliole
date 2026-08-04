// @vitest-environment node
import { expect, it } from 'vitest';

import { FakeCodexProcess, writeMessage } from './codexAppServerAdapter.testSupport.js';
import { readCodexModelCatalog } from './codexAppServerModelCatalog.js';

it('returns only picker-visible models and their declared options', async () => {
  const process = new FakeCodexProcess();
  process.stdin.on('data', (chunk) => respondToCatalogRequest(process, chunk));

  await expect(readCodexModelCatalog({ appVersion: 'test', spawn: () => process })).resolves.toEqual({
    models: [{
      defaultReasoningEffort: 'high',
      defaultServiceTier: 'fast',
      description: 'Primary model',
      displayName: 'GPT Test',
      isDefault: true,
      model: 'gpt-test',
      serviceTiers: [{ description: 'Faster responses', id: 'fast', name: 'Fast' }],
      supportedReasoningEfforts: [{ description: 'High', effort: 'high' }]
    }]
  });
  expect(process.kill).toHaveBeenCalledOnce();
});
it('rejects a catalog without one valid default model', async () => {
  const process = new FakeCodexProcess();
  process.stdin.on('data', (chunk) => {
    for (const message of readRequests(chunk)) {
      if (message.method === 'initialize') writeMessage(process, { id: message.id, result: {} });
      if (message.method === 'model/list') writeMessage(process, {
        id: message.id,
        result: { data: [{ ...visibleModel(), isDefault: false }], nextCursor: null }
      });
    }
  });

  await expect(readCodexModelCatalog({ appVersion: 'test', spawn: () => process }))
    .rejects.toMatchObject({ category: 'protocol_error' });
});

function respondToCatalogRequest(process: FakeCodexProcess, chunk: unknown) {
  for (const message of readRequests(chunk)) {
    if (message.method === 'initialize') writeMessage(process, { id: message.id, result: {} });
    if (message.method === 'model/list') writeMessage(process, {
      id: message.id,
      result: {
        data: [visibleModel(), { ...visibleModel(), hidden: true, isDefault: false, model: 'hidden' }],
        nextCursor: null
      }
    });
  }
}

function visibleModel() {
  return {
    defaultReasoningEffort: 'high',
    defaultServiceTier: 'fast',
    description: 'Primary model',
    displayName: 'GPT Test',
    hidden: false,
    isDefault: true,
    model: 'gpt-test',
    serviceTiers: [{ description: 'Faster responses', id: 'fast', name: 'Fast' }],
    supportedReasoningEfforts: [{ description: 'High', reasoningEffort: 'high' }]
  };
}

function readRequests(chunk: unknown) {
  return String(chunk).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}
